import {
  clearWorkspaceWindowBindings,
  splitSettingsForStorage
} from "~core/storage"
import {
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE_STATE,
  STORAGE_KEYS,
  type Settings,
  type WorkspaceState
} from "~core/types"
import {
  assertSafeJsonGraph,
  canonicalJson,
  sha256Hex,
  validatePortablePayload,
  type ImportPlan
} from "~features/backup"
import { withGlobalStorageWriteBarrier } from "~lib/storageQueues"

import { materializeBackupImportPlan } from "./backupRestoreModel"
import {
  createIndexedDbRestoreJournalStore,
  type BackupRestoreJournal,
  type RestoreJournalStore,
  type StorageKeySnapshot
} from "./restoreJournal"

const LEGACY_LOCAL_KEYS = [
  STORAGE_KEYS.TAGS,
  STORAGE_KEYS.SETTINGS,
  "virtualWindows",
  "virtualWindowBindings",
  "workspaceVirtualWindowLayouts",
  "displaySlots",
  "displayBindings",
  "workspaceDisplayLayouts",
  "tempGroups",
  "cloudSync",
  "e2eeState"
] as const

const LEGACY_SYNC_KEYS = [
  STORAGE_KEYS.WORKSPACES,
  STORAGE_KEYS.TAGS,
  STORAGE_KEYS.STATE,
  STORAGE_KEYS.SWITCH_STATE,
  STORAGE_KEYS.PENDING_ACTION,
  STORAGE_KEYS.LOCAL_SETTINGS,
  "virtualWindows",
  "virtualWindowBindings",
  "workspaceVirtualWindowLayouts",
  "displaySlots",
  "displayBindings",
  "workspaceDisplayLayouts",
  "tempGroups",
  "cloudSync",
  "e2eeState"
] as const

const ALLOWED_LOCAL_KEYS = new Set<string>([
  STORAGE_KEYS.WORKSPACES,
  STORAGE_KEYS.STATE,
  STORAGE_KEYS.SWITCH_STATE,
  STORAGE_KEYS.PENDING_ACTION,
  STORAGE_KEYS.LOCAL_SETTINGS,
  ...LEGACY_LOCAL_KEYS
])

const ALLOWED_SYNC_KEYS = new Set<string>([
  STORAGE_KEYS.SETTINGS,
  ...LEGACY_SYNC_KEYS
])

const SYNC_QUOTA_SAFETY_RATIO = 0.9
const MAX_RESTORE_JOURNAL_BYTES = 12 * 1024 * 1024
const MAX_RESTORE_JOURNAL_STRING_BYTES = 10 * 1024 * 1024

export const BACKUP_RESTORE_CLEANUP_ALARM =
  "tabplex-backup-restore-journal-cleanup"

export type BackupRestoreCheckpoint =
  | "after-abort"
  | "after-snapshot"
  | "after-quota-check"
  | "after-journal-prepared"
  | "after-local-write"
  | "after-sync-write"
  | "after-readback"
  | "after-commit"

export type BackupRestoreStorageArea = {
  get: (keys: string[] | string | null) => Promise<Record<string, unknown>>
  set: (items: Record<string, unknown>) => Promise<void>
  remove: (keys: string[] | string) => Promise<void>
  getBytesInUse?: (keys?: string[] | string | null) => Promise<number>
  QUOTA_BYTES?: number
  QUOTA_BYTES_PER_ITEM?: number
}

export type BackupRestoreDependencies = {
  abortSwitch: (reason: string) => Promise<unknown>
  withControllerMaintenance?: <T>(task: () => Promise<T>) => Promise<T>
  withAgentOperation?: <T>(task: () => Promise<T>) => Promise<T>
  revokeAgentAccess?: () => Promise<void>
  clearWindowBindings?: () => Promise<void>
  local?: BackupRestoreStorageArea
  sync?: BackupRestoreStorageArea
  journal?: RestoreJournalStore
  withStorageBarrier?: <T>(task: () => Promise<T>) => Promise<T>
  now?: () => number
  createTransactionId?: () => string
  faultInjector?: (checkpoint: BackupRestoreCheckpoint) => void | Promise<void>
}

export type BackupRestorePlanFactory =
  (() => ImportPlan) | (() => Promise<ImportPlan>)

type ResolvedDependencies = {
  abortSwitch: BackupRestoreDependencies["abortSwitch"]
  withControllerMaintenance: <T>(
    reason: string,
    task: () => Promise<T>
  ) => Promise<T>
  withAgentOperation: NonNullable<
    BackupRestoreDependencies["withAgentOperation"]
  >
  revokeAgentAccess: NonNullable<BackupRestoreDependencies["revokeAgentAccess"]>
  clearWindowBindings: NonNullable<
    BackupRestoreDependencies["clearWindowBindings"]
  >
  local: BackupRestoreStorageArea
  sync: BackupRestoreStorageArea
  journal: RestoreJournalStore
  withStorageBarrier: NonNullable<
    BackupRestoreDependencies["withStorageBarrier"]
  >
  now: () => number
  createTransactionId: () => string
  faultInjector?: BackupRestoreDependencies["faultInjector"]
}

type StorageMutation = {
  setItems: Record<string, unknown>
  removeKeys: string[]
}

export class BackupRestoreError extends Error {
  constructor(
    readonly code: string,
    options?: ErrorOptions
  ) {
    super(code, options)
    this.name = "BackupRestoreError"
  }
}

const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)

const uniqueSorted = (values: Iterable<string>) =>
  [...new Set(values)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  )

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const cloneForStorage = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T

const createTransactionId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}

const defaultStorageArea = (area: "local" | "sync") => {
  if (typeof chrome === "undefined" || !chrome.storage?.[area]) {
    throw new BackupRestoreError(`backup-restore-storage-${area}-unavailable`)
  }
  return chrome.storage[area] as unknown as BackupRestoreStorageArea
}

const resolveDependencies = (
  dependencies: BackupRestoreDependencies
): ResolvedDependencies => {
  const withControllerMaintenance = dependencies.withControllerMaintenance
    ? async <T>(_reason: string, task: () => Promise<T>) =>
        dependencies.withControllerMaintenance!(task)
    : async <T>(reason: string, task: () => Promise<T>) => {
        await dependencies.abortSwitch(reason)
        return task()
      }

  return {
    abortSwitch: dependencies.abortSwitch,
    withControllerMaintenance,
    withAgentOperation:
      dependencies.withAgentOperation ??
      (async <T>(task: () => Promise<T>) => task()),
    revokeAgentAccess:
      dependencies.revokeAgentAccess ?? (async () => undefined),
    clearWindowBindings:
      dependencies.clearWindowBindings ??
      (async () => {
        await clearWorkspaceWindowBindings()
      }),
    local: dependencies.local ?? defaultStorageArea("local"),
    sync: dependencies.sync ?? defaultStorageArea("sync"),
    journal: dependencies.journal ?? createIndexedDbRestoreJournalStore(),
    withStorageBarrier:
      dependencies.withStorageBarrier ?? withGlobalStorageWriteBarrier,
    now: dependencies.now ?? Date.now,
    createTransactionId:
      dependencies.createTransactionId ?? createTransactionId,
    faultInjector: dependencies.faultInjector
  }
}

const runCheckpoint = async (
  dependencies: ResolvedDependencies,
  checkpoint: BackupRestoreCheckpoint
) => {
  await dependencies.faultInjector?.(checkpoint)
}

const assertImportPlanPolicy = (plan: ImportPlan) => {
  const replace = plan?.mode === "replace"
  const merge = plan?.mode === "merge"
  const policy = plan?.storagePolicy
  const valid =
    (replace || merge) &&
    policy?.preserveOnboardingAndLogs === true &&
    policy.resetWorkspaceRuntime === replace &&
    policy.clearLegacyLayouts === replace &&
    policy.clearPendingAction === replace &&
    policy.disableAgentControl === replace
  if (!valid) {
    throw new BackupRestoreError("backup-restore-import-plan-policy-invalid")
  }
  try {
    validatePortablePayload(plan.payload)
  } catch (error) {
    throw new BackupRestoreError("backup-restore-import-plan-payload-invalid", {
      cause: error
    })
  }
}

const takeSnapshot = async (
  area: BackupRestoreStorageArea,
  keys: string[]
): Promise<StorageKeySnapshot> => {
  const stored = await area.get(keys)
  const values: Record<string, unknown> = {}
  const missing: string[] = []
  for (const key of keys) {
    if (hasOwn(stored, key)) {
      values[key] = stored[key]
    } else {
      missing.push(key)
    }
  }
  return { values, missing }
}

const snapshotDigest = async (
  local: StorageKeySnapshot,
  sync: StorageKeySnapshot
) => sha256Hex(canonicalJson({ local, sync }))

const applyMutationToSnapshot = (
  before: StorageKeySnapshot,
  mutation: StorageMutation,
  keys: string[]
): StorageKeySnapshot => {
  const values = { ...before.values }
  for (const key of mutation.removeKeys) delete values[key]
  Object.assign(values, mutation.setItems)
  return {
    values,
    missing: keys.filter((key) => !hasOwn(values, key))
  }
}

const toCurrentWorkspaceState = (
  localBefore: StorageKeySnapshot
): WorkspaceState => {
  const mainState = asRecord(localBefore.values[STORAGE_KEYS.STATE])
  const storedSwitchState = hasOwn(
    localBefore.values,
    STORAGE_KEYS.SWITCH_STATE
  )
    ? localBefore.values[STORAGE_KEYS.SWITCH_STATE]
    : mainState.switchState
  const activeWorkspaceId =
    typeof mainState.activeWorkspaceId === "string"
      ? mainState.activeWorkspaceId
      : null
  return {
    ...DEFAULT_WORKSPACE_STATE,
    activeWorkspaceId,
    notes: asRecord(mainState.notes) as Record<string, string>,
    notePreview: asRecord(mainState.notePreview) as Record<string, boolean>,
    linkedResources: asRecord(
      mainState.linkedResources
    ) as WorkspaceState["linkedResources"],
    switchState:
      storedSwitchState && typeof storedSwitchState === "object"
        ? (storedSwitchState as WorkspaceState["switchState"])
        : null
  }
}

const toCurrentSettings = (
  localBefore: StorageKeySnapshot,
  syncBefore: StorageKeySnapshot
): Settings => {
  const portable = asRecord(syncBefore.values[STORAGE_KEYS.SETTINGS])
  const local = asRecord(localBefore.values[STORAGE_KEYS.LOCAL_SETTINGS])
  const portableSettings = { ...portable }
  delete portableSettings.tabRestoreMode
  return {
    ...DEFAULT_SETTINGS,
    ...portableSettings,
    devMode:
      typeof local.devMode === "boolean"
        ? local.devMode
        : DEFAULT_SETTINGS.devMode,
    agentControlEnabled:
      typeof local.agentControlEnabled === "boolean"
        ? local.agentControlEnabled
        : DEFAULT_SETTINGS.agentControlEnabled,
    shortcuts: {
      ...DEFAULT_SETTINGS.shortcuts,
      ...(asRecord(portable.shortcuts) as Settings["shortcuts"])
    }
  } as Settings
}

const buildMutations = (
  plan: ImportPlan,
  localBefore: StorageKeySnapshot,
  syncBefore: StorageKeySnapshot
) => {
  const materialized = materializeBackupImportPlan(plan, {
    currentSettings: toCurrentSettings(localBefore, syncBefore),
    currentState: toCurrentWorkspaceState(localBefore)
  })
  const { switchState: _switchState, ...workspaceMainState } =
    materialized.workspaceState
  const { localSettings, portableSettings } = splitSettingsForStorage(
    materialized.settings
  )

  const localSetItems = cloneForStorage({
    [STORAGE_KEYS.WORKSPACES]: materialized.workspaces,
    [STORAGE_KEYS.STATE]: workspaceMainState,
    [STORAGE_KEYS.SWITCH_STATE]: null,
    [STORAGE_KEYS.LOCAL_SETTINGS]: localSettings
  })
  const replaceOnlyRemovals = plan.storagePolicy.clearPendingAction
    ? [STORAGE_KEYS.PENDING_ACTION]
    : []
  const legacyLocalRemovals = plan.storagePolicy.clearLegacyLayouts
    ? LEGACY_LOCAL_KEYS
    : []
  const localRemoveKeys = uniqueSorted([
    ...legacyLocalRemovals,
    ...replaceOnlyRemovals
  ]).filter((key) => !hasOwn(localSetItems, key))

  const syncSetItems = cloneForStorage(
    plan.settingsAction === "replace"
      ? { [STORAGE_KEYS.SETTINGS]: portableSettings }
      : {}
  )
  const syncRemoveKeys = (
    plan.storagePolicy.clearLegacyLayouts ? uniqueSorted(LEGACY_SYNC_KEYS) : []
  ).filter((key) => !hasOwn(syncSetItems, key))

  return {
    local: { setItems: localSetItems, removeKeys: localRemoveKeys },
    sync: { setItems: syncSetItems, removeKeys: syncRemoveKeys }
  }
}

const encodedBytes = (value: string) => new TextEncoder().encode(value).length

const estimateEntryBytes = (key: string, value: unknown) =>
  encodedBytes(key) + encodedBytes(JSON.stringify(value))

const estimateMutationBytes = (items: Record<string, unknown>) =>
  Object.entries(items).reduce(
    (total, [key, value]) => total + estimateEntryBytes(key, value),
    0
  )

const assertProjectedSyncQuota = async (
  area: BackupRestoreStorageArea,
  mutation: StorageMutation,
  targetKeys: string[]
) => {
  const quotaBytes = area.QUOTA_BYTES
  if (typeof quotaBytes === "number" && quotaBytes > 0 && area.getBytesInUse) {
    const [usedBytes, replacedBytes] = await Promise.all([
      area.getBytesInUse(null),
      area.getBytesInUse(targetKeys)
    ])
    const projectedBytes =
      usedBytes - replacedBytes + estimateMutationBytes(mutation.setItems)
    if (projectedBytes > quotaBytes * SYNC_QUOTA_SAFETY_RATIO) {
      throw new BackupRestoreError("backup-restore-quota-exceeded:sync")
    }
  }

  const perItemQuota = area.QUOTA_BYTES_PER_ITEM
  if (typeof perItemQuota === "number" && perItemQuota > 0) {
    for (const [key, value] of Object.entries(mutation.setItems)) {
      if (estimateEntryBytes(key, value) > perItemQuota) {
        throw new BackupRestoreError(
          `backup-restore-item-quota-exceeded:sync:${key}`
        )
      }
    }
  }
}

const applyStorageMutation = async (
  area: BackupRestoreStorageArea,
  mutation: StorageMutation
) => {
  if (mutation.removeKeys.length) await area.remove(mutation.removeKeys)
  if (Object.keys(mutation.setItems).length) await area.set(mutation.setItems)
}

const restoreSnapshot = async (
  area: BackupRestoreStorageArea,
  _keys: string[],
  snapshot: StorageKeySnapshot
) => {
  if (Object.keys(snapshot.values).length) await area.set(snapshot.values)
  if (snapshot.missing.length) await area.remove(snapshot.missing)
}

const hasValidSnapshot = (snapshot: StorageKeySnapshot, keys: string[]) => {
  if (!snapshot || typeof snapshot !== "object") return false
  if (
    !snapshot.values ||
    typeof snapshot.values !== "object" ||
    Array.isArray(snapshot.values)
  ) {
    return false
  }
  if (!Array.isArray(snapshot.missing)) return false
  const keySet = new Set(keys)
  const valueKeys = Object.keys(snapshot.values)
  const missing = snapshot.missing
  if (
    valueKeys.some((key) => !keySet.has(key)) ||
    missing.some((key) => !keySet.has(key))
  ) {
    return false
  }
  const represented = new Set([...valueKeys, ...missing])
  const duplicateMissing = new Set(missing).size !== missing.length
  const overlap = missing.some((key) => hasOwn(snapshot.values, key))
  return (
    !duplicateMissing &&
    !overlap &&
    represented.size === keys.length &&
    keys.every((key) => represented.has(key))
  )
}

const assertValidJournal = (journal: BackupRestoreJournal) => {
  try {
    assertSafeJsonGraph(journal, {
      maxAggregateStringBytes: MAX_RESTORE_JOURNAL_STRING_BYTES
    })
    if (
      new TextEncoder().encode(JSON.stringify(journal)).byteLength >
      MAX_RESTORE_JOURNAL_BYTES
    ) {
      throw new Error("journal-too-large")
    }
  } catch (error) {
    throw new BackupRestoreError("backup-restore-journal-invalid", {
      cause: error
    })
  }
  const validPhases = new Set([
    "prepared",
    "writing",
    "written",
    "committed",
    "rolling-back"
  ])
  if (!Array.isArray(journal?.localKeys) || !Array.isArray(journal?.syncKeys)) {
    throw new BackupRestoreError("backup-restore-journal-invalid")
  }
  const localKeys = uniqueSorted(
    journal.localKeys.filter((key): key is string => typeof key === "string")
  )
  const syncKeys = uniqueSorted(
    journal.syncKeys.filter((key): key is string => typeof key === "string")
  )
  const isValid =
    journal?.schemaVersion === 1 &&
    typeof journal.transactionId === "string" &&
    journal.transactionId.length > 0 &&
    journal.transactionId.length <= 256 &&
    (journal.mode === "merge" || journal.mode === "replace") &&
    validPhases.has(journal.phase) &&
    Number.isFinite(journal.createdAt) &&
    journal.createdAt >= 0 &&
    Number.isFinite(journal.updatedAt) &&
    journal.updatedAt >= 0 &&
    localKeys.length === journal.localKeys.length &&
    syncKeys.length === journal.syncKeys.length &&
    localKeys.every((key) => ALLOWED_LOCAL_KEYS.has(key)) &&
    syncKeys.every((key) => ALLOWED_SYNC_KEYS.has(key)) &&
    hasValidSnapshot(journal.localBefore, localKeys) &&
    hasValidSnapshot(journal.syncBefore, syncKeys) &&
    /^[a-f0-9]{64}$/.test(journal.expectedAfterDigest)
  if (!isValid) throw new BackupRestoreError("backup-restore-journal-invalid")
}

const readCurrentJournalSnapshot = async (
  journal: BackupRestoreJournal,
  dependencies: ResolvedDependencies
) => {
  const [local, sync] = await Promise.all([
    takeSnapshot(dependencies.local, journal.localKeys),
    takeSnapshot(dependencies.sync, journal.syncKeys)
  ])
  return { local, sync }
}

const rollbackJournal = async (
  journal: BackupRestoreJournal,
  dependencies: ResolvedDependencies
) => {
  try {
    await dependencies.journal.write({
      ...journal,
      phase: "rolling-back",
      updatedAt: dependencies.now()
    })
  } catch {
    // The original durable snapshot remains sufficient for a retry.
  }

  await restoreSnapshot(
    dependencies.local,
    journal.localKeys,
    journal.localBefore
  )
  await restoreSnapshot(dependencies.sync, journal.syncKeys, journal.syncBefore)
  const restored = await readCurrentJournalSnapshot(journal, dependencies)
  const [actualDigest, expectedDigest] = await Promise.all([
    snapshotDigest(restored.local, restored.sync),
    snapshotDigest(journal.localBefore, journal.syncBefore)
  ])
  if (actualDigest !== expectedDigest) {
    throw new BackupRestoreError("backup-restore-rollback-verification-failed")
  }
  await dependencies.journal.clear()
}

const reconcileJournal = async (
  journal: BackupRestoreJournal,
  dependencies: ResolvedDependencies
) => {
  assertValidJournal(journal)
  if (journal.phase === "committed") {
    const current = await readCurrentJournalSnapshot(journal, dependencies)
    const digest = await snapshotDigest(current.local, current.sync)
    await dependencies.journal.clear()
    return digest === journal.expectedAfterDigest
      ? ("finalized" as const)
      : ("finalized-with-newer-writes" as const)
  }
  await rollbackJournal(journal, dependencies)
  return "rolled-back" as const
}

const ensureNoExistingJournal = async (dependencies: ResolvedDependencies) => {
  const existing = await dependencies.journal.read()
  if (!existing) return
  await reconcileJournal(existing, dependencies)
  throw new BackupRestoreError("backup-restore-recovered-previous-transaction")
}

const runRestoreTransaction = async (
  plan: ImportPlan,
  dependencies: ResolvedDependencies
) => {
  await ensureNoExistingJournal(dependencies)

  const localMutationKeys = uniqueSorted([
    STORAGE_KEYS.WORKSPACES,
    STORAGE_KEYS.STATE,
    STORAGE_KEYS.SWITCH_STATE,
    STORAGE_KEYS.LOCAL_SETTINGS,
    ...(plan.storagePolicy.clearLegacyLayouts ? LEGACY_LOCAL_KEYS : []),
    ...(plan.storagePolicy.clearPendingAction
      ? [STORAGE_KEYS.PENDING_ACTION]
      : [])
  ])
  const syncMutationKeys = uniqueSorted([
    ...(plan.settingsAction === "replace" ? [STORAGE_KEYS.SETTINGS] : []),
    ...(plan.storagePolicy.clearLegacyLayouts ? LEGACY_SYNC_KEYS : [])
  ])
  const [localBefore, syncBefore] = await Promise.all([
    takeSnapshot(dependencies.local, localMutationKeys),
    takeSnapshot(dependencies.sync, syncMutationKeys)
  ])
  await runCheckpoint(dependencies, "after-snapshot")

  const mutations = buildMutations(plan, localBefore, syncBefore)
  await assertProjectedSyncQuota(
    dependencies.sync,
    mutations.sync,
    syncMutationKeys
  )
  await runCheckpoint(dependencies, "after-quota-check")

  const localAfter = applyMutationToSnapshot(
    localBefore,
    mutations.local,
    localMutationKeys
  )
  const syncAfter = applyMutationToSnapshot(
    syncBefore,
    mutations.sync,
    syncMutationKeys
  )
  const now = dependencies.now()
  let journal: BackupRestoreJournal = {
    schemaVersion: 1,
    transactionId: dependencies.createTransactionId(),
    mode: plan.mode,
    phase: "prepared",
    createdAt: now,
    updatedAt: now,
    localKeys: localMutationKeys,
    syncKeys: syncMutationKeys,
    localBefore,
    syncBefore,
    expectedAfterDigest: await snapshotDigest(localAfter, syncAfter)
  }
  let committed = false
  let journalDurable = false

  try {
    assertValidJournal(journal)
    await dependencies.journal.write(journal)
    journalDurable = true
    await runCheckpoint(dependencies, "after-journal-prepared")

    journal = {
      ...journal,
      phase: "writing",
      updatedAt: dependencies.now()
    }
    await dependencies.journal.write(journal)
    await applyStorageMutation(dependencies.local, mutations.local)
    await runCheckpoint(dependencies, "after-local-write")
    await applyStorageMutation(dependencies.sync, mutations.sync)
    await runCheckpoint(dependencies, "after-sync-write")

    journal = {
      ...journal,
      phase: "written",
      updatedAt: dependencies.now()
    }
    await dependencies.journal.write(journal)
    const current = await readCurrentJournalSnapshot(journal, dependencies)
    const actualDigest = await snapshotDigest(current.local, current.sync)
    if (actualDigest !== journal.expectedAfterDigest) {
      throw new BackupRestoreError("backup-restore-readback-mismatch")
    }
    await runCheckpoint(dependencies, "after-readback")
    await dependencies.clearWindowBindings()
    if (plan.storagePolicy.disableAgentControl) {
      await dependencies.revokeAgentAccess()
    }

    journal = {
      ...journal,
      phase: "committed",
      updatedAt: dependencies.now()
    }
    await dependencies.journal.write(journal)
    committed = true
    await runCheckpoint(dependencies, "after-commit")

    let cleanupPending = false
    try {
      await dependencies.journal.clear()
    } catch {
      cleanupPending = true
    }
    return { transactionId: journal.transactionId, cleanupPending }
  } catch (error) {
    if (committed) throw error
    if (!journalDurable) throw error
    try {
      await rollbackJournal(journal, dependencies)
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "backup-restore-rollback-failed"
      )
    }
    throw error
  }
}

export const restoreBackupImportPlan = async (
  plan: ImportPlan,
  dependencyOverrides: BackupRestoreDependencies
) => {
  assertImportPlanPolicy(plan)
  return restoreBackupWithPlanFactory(() => plan, dependencyOverrides)
}

export const restoreBackupWithPlanFactory = async (
  createPlan: BackupRestorePlanFactory,
  dependencyOverrides: BackupRestoreDependencies
) => {
  const dependencies = resolveDependencies(dependencyOverrides)
  return dependencies.withAgentOperation(() =>
    dependencies.withControllerMaintenance("backup-restore", async () => {
      await runCheckpoint(dependencies, "after-abort")
      return dependencies.withStorageBarrier(async () => {
        const plan = await createPlan()
        assertImportPlanPolicy(plan)
        return runRestoreTransaction(plan, dependencies)
      })
    })
  )
}

export const recoverInterruptedBackupRestore = async (
  dependencyOverrides: BackupRestoreDependencies
) => {
  const dependencies = resolveDependencies(dependencyOverrides)
  return dependencies.withAgentOperation(() =>
    dependencies.withControllerMaintenance("backup-restore-recovery", () =>
      dependencies.withStorageBarrier(async () => {
        const journal = await dependencies.journal.read()
        if (!journal) return { status: "none" as const }
        const status = await reconcileJournal(journal, dependencies)
        return { status }
      })
    )
  )
}

export const readPendingBackupRestorePhase = async (
  journal: RestoreJournalStore = createIndexedDbRestoreJournalStore()
) => {
  const pending = await journal.read()
  if (!pending) return null
  assertValidJournal(pending)
  return pending.phase
}

export const withConsistentBackupSnapshot = async <T>(
  task: () => Promise<T>,
  dependencyOverrides: BackupRestoreDependencies
) => {
  const dependencies = resolveDependencies(dependencyOverrides)
  return dependencies.withAgentOperation(() =>
    dependencies.withControllerMaintenance("backup-export", () =>
      dependencies.withStorageBarrier(task)
    )
  )
}
