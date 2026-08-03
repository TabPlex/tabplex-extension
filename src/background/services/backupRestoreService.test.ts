import { beforeEach, describe, expect, it, vi } from "vitest"

import { STORAGE_KEYS } from "~core/types"
import type { ImportPlan } from "~features/backup"

import {
  recoverInterruptedBackupRestore,
  restoreBackupImportPlan,
  restoreBackupWithPlanFactory,
  withConsistentBackupSnapshot,
  type BackupRestoreCheckpoint,
  type BackupRestoreStorageArea
} from "./backupRestoreService"
import type {
  BackupRestoreJournal,
  RestoreJournalStore
} from "./restoreJournal"

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

class MemoryStorageArea implements BackupRestoreStorageArea {
  QUOTA_BYTES?: number
  QUOTA_BYTES_PER_ITEM?: number
  setCalls = 0
  removeCalls = 0
  failNextSet = false
  failSetNumber: number | null = null
  private values: Record<string, unknown>

  constructor(initial: Record<string, unknown> = {}) {
    this.values = clone(initial)
  }

  async get(keys: string[] | string | null) {
    const selected =
      keys === null
        ? Object.keys(this.values)
        : Array.isArray(keys)
          ? keys
          : [keys]
    return Object.fromEntries(
      selected
        .filter((key) => Object.prototype.hasOwnProperty.call(this.values, key))
        .map((key) => [key, clone(this.values[key])])
    )
  }

  async set(items: Record<string, unknown>) {
    this.setCalls += 1
    if (
      this.failNextSet ||
      (this.failSetNumber !== null && this.setCalls === this.failSetNumber)
    ) {
      this.failNextSet = false
      throw new Error("injected-storage-set-failure")
    }
    Object.assign(this.values, clone(items))
  }

  async remove(keys: string[] | string) {
    this.removeCalls += 1
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete this.values[key]
    }
  }

  async getBytesInUse(keys?: string[] | string | null) {
    const selected = await this.get(keys ?? null)
    return Object.entries(selected).reduce(
      (total, [key, value]) =>
        total +
        new TextEncoder().encode(key).length +
        new TextEncoder().encode(JSON.stringify(value)).length,
      0
    )
  }

  snapshot() {
    return clone(this.values)
  }

  overwrite(key: string, value: unknown) {
    this.values[key] = clone(value)
  }
}

class MemoryJournal implements RestoreJournalStore {
  current: BackupRestoreJournal | null = null
  failNextWrite = false
  failNextClear = false
  failWriteNumber: number | null = null
  writeCount = 0

  async read() {
    return this.current ? clone(this.current) : null
  }

  async write(journal: BackupRestoreJournal) {
    this.writeCount += 1
    if (
      this.failNextWrite ||
      (this.failWriteNumber !== null &&
        this.writeCount === this.failWriteNumber)
    ) {
      this.failNextWrite = false
      throw new Error("injected-journal-write-failure")
    }
    this.current = clone(journal)
  }

  async clear() {
    if (this.failNextClear) {
      this.failNextClear = false
      throw new Error("injected-journal-clear-failure")
    }
    this.current = null
  }
}

const portableWorkspace = (id: string, url: string) => ({
  id,
  name: id === "current" ? "Current" : "Imported",
  color: null,
  emoji: null,
  createdAt: 1,
  updatedAt: null,
  lastUsedAt: null,
  trashedAt: null,
  tabs: [
    {
      url,
      pinned: false,
      title: id,
      faviconUrl: null,
      lastAccessedAt: null,
      excluded: false
    }
  ],
  history: []
})

const makePlan = (
  mode: "merge" | "replace",
  importedUrl = "https://imported.example.com"
): ImportPlan => {
  const imported = portableWorkspace("imported", importedUrl)
  const current = portableWorkspace("current", "https://current.example.com")
  return {
    mode,
    payload: {
      workspaces: mode === "merge" ? [current, imported] : [imported],
      workspaceContexts:
        mode === "merge"
          ? [
              {
                workspaceId: "current",
                note: "current note",
                linkedResources: []
              },
              {
                workspaceId: "imported",
                note: "imported note",
                linkedResources: []
              }
            ]
          : [
              {
                workspaceId: "imported",
                note: "imported note",
                linkedResources: []
              }
            ],
      settings: {
        language: "zh-CN",
        theme: "dark",
        accentColor: "#123456",
        tabRestoreMode: "aggressive",
        workspaceSort: "lastUsed"
      }
    },
    workspaceIdMap: { imported: "imported" },
    settingsAction: mode === "replace" ? "replace" : "preserve",
    summary: {
      importedWorkspaces: 1,
      remappedWorkspaceIds: 0,
      renamedWorkspaces: 0
    },
    storagePolicy: {
      resetWorkspaceRuntime: mode === "replace",
      clearLegacyLayouts: mode === "replace",
      clearPendingAction: mode === "replace",
      preserveOnboardingAndLogs: true,
      disableAgentControl: mode === "replace"
    }
  }
}

const initialLocal = () => ({
  [STORAGE_KEYS.WORKSPACES]: [{ id: "current", name: "Current" }],
  [STORAGE_KEYS.STATE]: {
    activeWorkspaceId: "current",
    notes: { current: "current note" },
    linkedResources: {},
    hibernated: { current: 1 },
    notePreview: { current: true },
    managedWindowId: 42,
    managedWindows: [
      {
        windowId: 42,
        workspaceId: "current",
        slotId: "current-window"
      }
    ],
    controller: { id: "controller", ts: 1 }
  },
  [STORAGE_KEYS.SWITCH_STATE]: null,
  virtualWindows: [],
  virtualWindowBindings: { "current-window": 42 },
  workspaceVirtualWindowLayouts: { current: [] },
  [STORAGE_KEYS.PENDING_ACTION]: { type: "create" },
  [STORAGE_KEYS.LOCAL_SETTINGS]: {
    devMode: true,
    agentControlEnabled: true
  },
  [STORAGE_KEYS.TAGS]: [{ id: "legacy" }],
  displaySlots: [{ id: "legacy-display" }],
  displayBindings: { "legacy-display": 42 },
  workspaceDisplayLayouts: { current: [] },
  tempGroups: { current: [1] },
  cloudSync: { enabled: true },
  e2eeState: { enabled: true },
  [STORAGE_KEYS.ONBOARDING]: { status: "completed" },
  [STORAGE_KEYS.LOGS]: [{ message: "keep me" }]
})

const initialSync = () => ({
  [STORAGE_KEYS.SETTINGS]: {
    theme: "system",
    accentColor: "#6C5CE7",
    tabRestoreMode: "aggressive",
    workspaceSort: "created"
  },
  [STORAGE_KEYS.WORKSPACES]: [{ id: "stale-sync" }],
  [STORAGE_KEYS.TAGS]: [{ id: "stale-tag" }],
  displaySlots: [{ id: "legacy-sync-display" }],
  displayBindings: { "legacy-sync-display": 42 },
  workspaceDisplayLayouts: { current: [] },
  tempGroups: { current: [1] },
  cloudSync: { enabled: true },
  e2eeState: { enabled: true },
  [STORAGE_KEYS.ONBOARDING]: { status: "sync-keep" },
  [STORAGE_KEYS.LOGS]: [{ message: "sync keep" }]
})

const setup = (
  options: {
    local?: Record<string, unknown>
    sync?: Record<string, unknown>
    checkpoint?: BackupRestoreCheckpoint
  } = {}
) => {
  const local = new MemoryStorageArea(options.local ?? initialLocal())
  const sync = new MemoryStorageArea(options.sync ?? initialSync())
  const journal = new MemoryJournal()
  const abortSwitch = vi.fn(async () => undefined)
  const clearWindowBindings = vi.fn(async () => undefined)
  const dependencies = {
    local,
    sync,
    journal,
    abortSwitch,
    clearWindowBindings,
    now: () => 100,
    createTransactionId: () => "transaction-1",
    faultInjector: options.checkpoint
      ? async (checkpoint: BackupRestoreCheckpoint) => {
          if (checkpoint === options.checkpoint) {
            throw new Error(`fault:${checkpoint}`)
          }
        }
      : undefined
  }
  return {
    local,
    sync,
    journal,
    abortSwitch,
    clearWindowBindings,
    dependencies
  }
}

describe("backupRestoreService", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("commits replace as canonical data, clears stale state and preserves logs/onboarding", async () => {
    const {
      local,
      sync,
      journal,
      abortSwitch,
      clearWindowBindings,
      dependencies
    } = setup()

    await expect(
      restoreBackupImportPlan(makePlan("replace"), dependencies)
    ).resolves.toEqual({
      transactionId: "transaction-1",
      cleanupPending: false
    })

    const localResult = local.snapshot()
    const syncResult = sync.snapshot()
    expect(abortSwitch).toHaveBeenCalledWith("backup-restore")
    expect(clearWindowBindings).toHaveBeenCalledOnce()
    expect(journal.current).toBeNull()
    expect(localResult[STORAGE_KEYS.WORKSPACES]).toEqual([
      expect.objectContaining({ id: "imported" })
    ])
    expect(localResult[STORAGE_KEYS.STATE]).toMatchObject({
      activeWorkspaceId: null,
      notes: { imported: "imported note" }
    })
    expect(localResult[STORAGE_KEYS.STATE]).not.toHaveProperty("hibernated")
    expect(localResult[STORAGE_KEYS.STATE]).not.toHaveProperty("controller")
    expect(localResult[STORAGE_KEYS.STATE]).not.toHaveProperty(
      "managedWindowId"
    )
    expect(localResult[STORAGE_KEYS.STATE]).not.toHaveProperty("managedWindows")
    expect(localResult[STORAGE_KEYS.SWITCH_STATE]).toBeNull()
    expect(localResult[STORAGE_KEYS.LOCAL_SETTINGS]).toEqual({
      devMode: false,
      agentControlEnabled: false
    })
    expect(localResult).not.toHaveProperty(STORAGE_KEYS.TAGS)
    expect(localResult).not.toHaveProperty("virtualWindowBindings")
    expect(localResult).not.toHaveProperty("workspaceVirtualWindowLayouts")
    expect(localResult).not.toHaveProperty(STORAGE_KEYS.PENDING_ACTION)
    expect(localResult).not.toHaveProperty("displaySlots")
    expect(localResult).not.toHaveProperty("cloudSync")
    expect(localResult[STORAGE_KEYS.ONBOARDING]).toEqual({
      status: "completed"
    })
    expect(localResult[STORAGE_KEYS.LOGS]).toEqual([{ message: "keep me" }])
    expect(syncResult[STORAGE_KEYS.SETTINGS]).not.toHaveProperty("devMode")
    expect(syncResult[STORAGE_KEYS.SETTINGS]).not.toHaveProperty(
      "agentControlEnabled"
    )
    expect(syncResult[STORAGE_KEYS.SETTINGS]).not.toHaveProperty(
      "tabRestoreMode"
    )
    expect(syncResult).not.toHaveProperty(STORAGE_KEYS.WORKSPACES)
    expect(syncResult).not.toHaveProperty(STORAGE_KEYS.TAGS)
    expect(syncResult).not.toHaveProperty("cloudSync")
    expect(syncResult[STORAGE_KEYS.ONBOARDING]).toEqual({
      status: "sync-keep"
    })
    expect(syncResult[STORAGE_KEYS.LOGS]).toEqual([{ message: "sync keep" }])
  })

  it("preserves merge main state while clearing session window bindings", async () => {
    const { local, sync, clearWindowBindings, dependencies } = setup()
    const settingsBefore = sync.snapshot()[STORAGE_KEYS.SETTINGS]

    await restoreBackupImportPlan(makePlan("merge"), dependencies)

    const result = local.snapshot()
    expect(result[STORAGE_KEYS.STATE]).toMatchObject({
      activeWorkspaceId: "current",
      notes: { current: "current note", imported: "imported note" }
    })
    expect(result[STORAGE_KEYS.STATE]).not.toHaveProperty("hibernated")
    expect(result[STORAGE_KEYS.STATE]).not.toHaveProperty("controller")
    expect(result[STORAGE_KEYS.STATE]).not.toHaveProperty("managedWindowId")
    expect(result[STORAGE_KEYS.STATE]).not.toHaveProperty("managedWindows")
    expect(result[STORAGE_KEYS.LOCAL_SETTINGS]).toEqual({
      devMode: true,
      agentControlEnabled: true
    })
    expect(result.virtualWindowBindings).toEqual({
      "current-window": 42
    })
    expect(clearWindowBindings).toHaveBeenCalledOnce()
    expect(result[STORAGE_KEYS.PENDING_ACTION]).toEqual({ type: "create" })
    expect(sync.snapshot()[STORAGE_KEYS.SETTINGS]).toEqual(settingsBefore)
    expect(result.displaySlots).toEqual([{ id: "legacy-display" }])
    expect(result.displayBindings).toEqual({ "legacy-display": 42 })
    expect(result.workspaceDisplayLayouts).toEqual({ current: [] })
    expect(result.tempGroups).toEqual({ current: [1] })
    expect(result.cloudSync).toEqual({ enabled: true })
    expect(result.e2eeState).toEqual({ enabled: true })
    expect(sync.snapshot()).toMatchObject({
      displaySlots: [{ id: "legacy-sync-display" }],
      displayBindings: { "legacy-sync-display": 42 },
      workspaceDisplayLayouts: { current: [] },
      tempGroups: { current: [1] },
      cloudSync: { enabled: true },
      e2eeState: { enabled: true }
    })
  })

  it("disconnects Agent control before a replace transaction commits", async () => {
    const { dependencies } = setup()
    const revokeAgentAccess = vi.fn(async () => undefined)

    await restoreBackupImportPlan(makePlan("replace"), {
      ...dependencies,
      revokeAgentAccess
    })
    expect(revokeAgentAccess).toHaveBeenCalledOnce()

    revokeAgentAccess.mockClear()
    await restoreBackupImportPlan(makePlan("merge"), {
      ...dependencies,
      revokeAgentAccess
    })
    expect(revokeAgentAccess).not.toHaveBeenCalled()
  })

  it("rolls back durable data when session binding cleanup fails", async () => {
    const { local, sync, dependencies } = setup()
    const beforeLocal = local.snapshot()
    const beforeSync = sync.snapshot()

    await expect(
      restoreBackupImportPlan(makePlan("replace"), {
        ...dependencies,
        clearWindowBindings: vi.fn(async () => {
          throw new Error("session-binding-cleanup-failed")
        })
      })
    ).rejects.toThrow("session-binding-cleanup-failed")

    expect(local.snapshot()).toEqual(beforeLocal)
    expect(sync.snapshot()).toEqual(beforeSync)
  })

  it("rolls back the replace transaction when Agent revocation fails", async () => {
    const { local, sync, dependencies } = setup()
    const beforeLocal = local.snapshot()
    const beforeSync = sync.snapshot()

    await expect(
      restoreBackupImportPlan(makePlan("replace"), {
        ...dependencies,
        revokeAgentAccess: vi.fn(async () => {
          throw new Error("agent-revoke-failed")
        })
      })
    ).rejects.toThrow("agent-revoke-failed")

    expect(local.snapshot()).toEqual(beforeLocal)
    expect(sync.snapshot()).toEqual(beforeSync)
  })

  const rollbackCheckpoints: BackupRestoreCheckpoint[] = [
    "after-abort",
    "after-snapshot",
    "after-quota-check",
    "after-journal-prepared",
    "after-local-write",
    "after-sync-write",
    "after-readback"
  ]

  for (const checkpoint of rollbackCheckpoints) {
    it(`keeps the exact prior snapshot when ${checkpoint} fails`, async () => {
      const { local, sync, journal, dependencies } = setup({ checkpoint })
      const beforeLocal = local.snapshot()
      const beforeSync = sync.snapshot()

      await expect(
        restoreBackupImportPlan(makePlan("replace"), dependencies)
      ).rejects.toThrow(`fault:${checkpoint}`)

      expect(local.snapshot()).toEqual(beforeLocal)
      expect(sync.snapshot()).toEqual(beforeSync)
      expect(journal.current).toBeNull()
    })
  }

  it("restores keys that were missing before a failed transaction as missing", async () => {
    const localBefore = initialLocal()
    delete localBefore[STORAGE_KEYS.SWITCH_STATE]
    delete localBefore.virtualWindowBindings
    delete localBefore.workspaceVirtualWindowLayouts
    const { local, dependencies } = setup({
      local: localBefore,
      checkpoint: "after-local-write"
    })

    await expect(
      restoreBackupImportPlan(makePlan("replace"), dependencies)
    ).rejects.toThrow("fault:after-local-write")

    const result = local.snapshot()
    expect(result).not.toHaveProperty(STORAGE_KEYS.SWITCH_STATE)
    expect(result).not.toHaveProperty("virtualWindowBindings")
    expect(result).not.toHaveProperty("workspaceVirtualWindowLayouts")
  })

  it("rolls back when a storage write rejects", async () => {
    const { local, sync, dependencies } = setup()
    const beforeLocal = local.snapshot()
    const beforeSync = sync.snapshot()
    sync.failNextSet = true

    await expect(
      restoreBackupImportPlan(makePlan("replace"), dependencies)
    ).rejects.toThrow("injected-storage-set-failure")

    expect(local.snapshot()).toEqual(beforeLocal)
    expect(sync.snapshot()).toEqual(beforeSync)
  })

  it("does not erase managed keys before a rollback set succeeds", async () => {
    const { local, dependencies } = setup({ checkpoint: "after-sync-write" })
    local.failSetNumber = 2

    await expect(
      restoreBackupImportPlan(makePlan("replace"), dependencies)
    ).rejects.toThrow("backup-restore-rollback-failed")

    expect(local.removeCalls).toBe(1)
    expect(local.snapshot()[STORAGE_KEYS.WORKSPACES]).toEqual([
      expect.objectContaining({ id: "imported" })
    ])
  })

  it("rolls back when local cleanup succeeds but its canonical set fails", async () => {
    const { local, sync, dependencies } = setup()
    const beforeLocal = local.snapshot()
    const beforeSync = sync.snapshot()
    local.failNextSet = true

    await expect(
      restoreBackupImportPlan(makePlan("replace"), dependencies)
    ).rejects.toThrow("injected-storage-set-failure")

    expect(local.snapshot()).toEqual(beforeLocal)
    expect(sync.snapshot()).toEqual(beforeSync)
  })

  it("does not touch storage when the durable journal cannot be created", async () => {
    const { local, sync, journal, dependencies } = setup()
    const beforeLocal = local.snapshot()
    const beforeSync = sync.snapshot()
    journal.failNextWrite = true

    await expect(
      restoreBackupImportPlan(makePlan("replace"), dependencies)
    ).rejects.toThrow("injected-journal-write-failure")

    expect(local.snapshot()).toEqual(beforeLocal)
    expect(sync.snapshot()).toEqual(beforeSync)
    expect(local.setCalls).toBe(0)
    expect(local.removeCalls).toBe(0)
  })

  for (const writeNumber of [2, 3, 4]) {
    it(`rolls back when durable journal write ${writeNumber} fails`, async () => {
      const { local, sync, journal, dependencies } = setup()
      const beforeLocal = local.snapshot()
      const beforeSync = sync.snapshot()
      journal.failWriteNumber = writeNumber

      await expect(
        restoreBackupImportPlan(makePlan("replace"), dependencies)
      ).rejects.toThrow("injected-journal-write-failure")

      expect(local.snapshot()).toEqual(beforeLocal)
      expect(sync.snapshot()).toEqual(beforeSync)
      expect(journal.current).toBeNull()
    })
  }

  it("rejects a policy-confused import plan before aborting the active switch", async () => {
    const { abortSwitch, dependencies } = setup()
    const invalid = makePlan("replace")
    invalid.storagePolicy.disableAgentControl = false

    await expect(
      restoreBackupImportPlan(invalid, dependencies)
    ).rejects.toThrow("backup-restore-import-plan-policy-invalid")

    expect(abortSwitch).not.toHaveBeenCalled()
  })

  it("rejects an unsafe direct import plan before maintenance or storage writes", async () => {
    const { local, sync, abortSwitch, dependencies } = setup()
    const beforeLocal = local.snapshot()
    const beforeSync = sync.snapshot()
    const invalid = makePlan("merge")
    invalid.payload.workspaces[0].tabs[0].url = "javascript:alert(1)"

    await expect(
      restoreBackupImportPlan(invalid, dependencies)
    ).rejects.toThrow("backup-restore-import-plan-payload-invalid")

    expect(abortSwitch).not.toHaveBeenCalled()
    expect(local.snapshot()).toEqual(beforeLocal)
    expect(sync.snapshot()).toEqual(beforeSync)
  })

  it("uses projected post-write bytes for the quota gate", async () => {
    const { local, sync, journal, dependencies } = setup()
    local.QUOTA_BYTES = 3_000
    const beforeSetCalls = local.setCalls
    const beforeRemoveCalls = local.removeCalls
    expect(await local.getBytesInUse(null)).toBeLessThan(
      local.QUOTA_BYTES * 0.9
    )

    await expect(
      restoreBackupImportPlan(
        makePlan("replace", `https://example.com/${"x".repeat(5_000)}`),
        dependencies
      )
    ).rejects.toThrow("backup-restore-quota-exceeded:local")

    expect(local.setCalls).toBe(beforeSetCalls)
    expect(local.removeCalls).toBe(beforeRemoveCalls)
    expect(sync.setCalls).toBe(0)
    expect(journal.current).toBeNull()
  })

  it("finalizes a committed transaction after a simulated MV3 crash", async () => {
    const { local, journal, dependencies } = setup({
      checkpoint: "after-commit"
    })

    await expect(
      restoreBackupImportPlan(makePlan("replace"), dependencies)
    ).rejects.toThrow("fault:after-commit")
    expect(journal.current?.phase).toBe("committed")
    expect(local.snapshot()[STORAGE_KEYS.WORKSPACES]).toEqual([
      expect.objectContaining({ id: "imported" })
    ])

    const result = await recoverInterruptedBackupRestore({
      ...dependencies,
      faultInjector: undefined
    })

    expect(result).toEqual({ status: "finalized" })
    expect(journal.current).toBeNull()
    expect(local.snapshot()[STORAGE_KEYS.WORKSPACES]).toEqual([
      expect.objectContaining({ id: "imported" })
    ])
  })

  it("reports deferred cleanup and lets startup finalize it", async () => {
    const { journal, dependencies } = setup()
    journal.failNextClear = true

    await expect(
      restoreBackupImportPlan(makePlan("replace"), dependencies)
    ).resolves.toEqual({
      transactionId: "transaction-1",
      cleanupPending: true
    })
    expect(journal.current?.phase).toBe("committed")

    await expect(
      recoverInterruptedBackupRestore(dependencies)
    ).resolves.toEqual({ status: "finalized" })
    expect(journal.current).toBeNull()
  })

  it("rolls back an uncommitted MV3 journal on startup, including missing keys", async () => {
    const localBefore = initialLocal()
    delete localBefore[STORAGE_KEYS.SWITCH_STATE]
    const { local, sync, journal, dependencies } = setup({
      local: localBefore,
      checkpoint: "after-commit"
    })
    const beforeLocal = local.snapshot()
    const beforeSync = sync.snapshot()
    await expect(
      restoreBackupImportPlan(makePlan("replace"), dependencies)
    ).rejects.toThrow("fault:after-commit")
    journal.current = {
      ...(journal.current as BackupRestoreJournal),
      phase: "writing"
    }

    await expect(
      recoverInterruptedBackupRestore({
        ...dependencies,
        faultInjector: undefined
      })
    ).resolves.toEqual({ status: "rolled-back" })

    expect(local.snapshot()).toEqual(beforeLocal)
    expect(local.snapshot()).not.toHaveProperty(STORAGE_KEYS.SWITCH_STATE)
    expect(sync.snapshot()).toEqual(beforeSync)
    expect(journal.current).toBeNull()
  })

  it("never rolls back newer writes after the durable commit point", async () => {
    const { local, sync, journal, dependencies } = setup({
      checkpoint: "after-commit"
    })
    const beforeLocal = local.snapshot()
    const beforeSync = sync.snapshot()
    await expect(
      restoreBackupImportPlan(makePlan("replace"), dependencies)
    ).rejects.toThrow("fault:after-commit")
    local.overwrite(STORAGE_KEYS.WORKSPACES, [{ id: "corrupt" }])

    const result = await recoverInterruptedBackupRestore({
      ...dependencies,
      faultInjector: undefined
    })

    expect(result).toEqual({ status: "finalized-with-newer-writes" })
    expect(local.snapshot()[STORAGE_KEYS.WORKSPACES]).toEqual([
      { id: "corrupt" }
    ])
    expect(local.snapshot()).not.toEqual(beforeLocal)
    expect(sync.snapshot()).not.toEqual(beforeSync)
    expect(journal.current).toBeNull()
  })

  it("rejects a non-plain nested journal before any storage write", async () => {
    const { local, sync, journal, dependencies } = setup({
      checkpoint: "after-commit"
    })
    await expect(
      restoreBackupImportPlan(makePlan("replace"), dependencies)
    ).rejects.toThrow("fault:after-commit")
    const malicious = journal.current as BackupRestoreJournal
    malicious.localBefore.values[STORAGE_KEYS.STATE] = new Date()
    const localSetCalls = local.setCalls
    const localRemoveCalls = local.removeCalls
    const syncSetCalls = sync.setCalls
    const syncRemoveCalls = sync.removeCalls

    await expect(
      recoverInterruptedBackupRestore({
        ...dependencies,
        faultInjector: undefined,
        journal: {
          read: async () => malicious,
          write: vi.fn(async () => undefined),
          clear: vi.fn(async () => undefined)
        }
      })
    ).rejects.toThrow("backup-restore-journal-invalid")

    expect(local.setCalls).toBe(localSetCalls)
    expect(local.removeCalls).toBe(localRemoveCalls)
    expect(sync.setCalls).toBe(syncSetCalls)
    expect(sync.removeCalls).toBe(syncRemoveCalls)
  })

  it("serializes concurrent restores through the global storage barrier", async () => {
    const { dependencies } = setup()
    let releaseFirst: () => void = () => undefined
    const firstHold = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const snapshots: string[] = []
    let snapshotCount = 0
    const firstDependencies = {
      ...dependencies,
      faultInjector: async (checkpoint: BackupRestoreCheckpoint) => {
        if (checkpoint !== "after-snapshot") return
        snapshotCount += 1
        snapshots.push(`snapshot-${snapshotCount}`)
        if (snapshotCount === 1) await firstHold
      }
    }

    const first = restoreBackupImportPlan(
      makePlan("replace"),
      firstDependencies
    )
    await vi.waitFor(() => expect(snapshots).toEqual(["snapshot-1"]))
    const second = restoreBackupImportPlan(
      makePlan("replace"),
      firstDependencies
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(snapshots).toEqual(["snapshot-1"])

    releaseFirst()
    await Promise.all([first, second])
    expect(snapshots).toEqual(["snapshot-1", "snapshot-2"])
  })

  it("creates a merge plan only after entering the storage barrier", async () => {
    const { dependencies } = setup()
    const sequence: string[] = []
    const createPlan = vi.fn(() => {
      sequence.push("plan")
      return makePlan("merge")
    })

    await restoreBackupWithPlanFactory(createPlan, {
      ...dependencies,
      withStorageBarrier: async (task) => {
        sequence.push("barrier-enter")
        const result = await task()
        sequence.push("barrier-leave")
        return result
      }
    })

    expect(sequence).toEqual(["barrier-enter", "plan", "barrier-leave"])
  })

  it("holds controller maintenance outside the storage barrier", async () => {
    const { dependencies } = setup()
    const sequence: string[] = []

    await restoreBackupImportPlan(makePlan("merge"), {
      ...dependencies,
      withAgentOperation: async (task) => {
        sequence.push("agent-enter")
        const result = await task()
        sequence.push("agent-leave")
        return result
      },
      withControllerMaintenance: async (task) => {
        sequence.push("maintenance-enter")
        const result = await task()
        sequence.push("maintenance-leave")
        return result
      },
      withStorageBarrier: async (task) => {
        sequence.push("barrier-enter")
        const result = await task()
        sequence.push("barrier-leave")
        return result
      }
    })

    expect(sequence).toEqual([
      "agent-enter",
      "maintenance-enter",
      "barrier-enter",
      "barrier-leave",
      "maintenance-leave",
      "agent-leave"
    ])
  })

  it("exports only while controller maintenance and the storage barrier are held", async () => {
    const { dependencies } = setup()
    const sequence: string[] = []

    const result = await withConsistentBackupSnapshot(
      async () => {
        sequence.push("snapshot")
        return "portable-backup"
      },
      {
        ...dependencies,
        withAgentOperation: async (task) => {
          sequence.push("agent-enter")
          const value = await task()
          sequence.push("agent-leave")
          return value
        },
        withControllerMaintenance: async (task) => {
          sequence.push("maintenance-enter")
          const value = await task()
          sequence.push("maintenance-leave")
          return value
        },
        withStorageBarrier: async (task) => {
          sequence.push("barrier-enter")
          const value = await task()
          sequence.push("barrier-leave")
          return value
        }
      }
    )

    expect(result).toBe("portable-backup")
    expect(sequence).toEqual([
      "agent-enter",
      "maintenance-enter",
      "barrier-enter",
      "snapshot",
      "barrier-leave",
      "maintenance-leave",
      "agent-leave"
    ])
  })
})
