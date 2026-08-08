import {
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE_STATE,
  STORAGE_KEYS,
  type Settings,
  type Workspace,
  type WorkspaceState,
  type WorkspaceWindowBinding,
  type WorkspaceWindowBindingMap
} from "~core/types"
import { normalizeHex } from "~core/utils"
import {
  sanitizeTabSpecs,
  sanitizeWorkspace
} from "~features/workspace/logic/workspaceLogic"
import { writeCachedThemePreference } from "~lib/common"

const LEGACY_STORAGE_KEYS = {
  virtualWindows: "virtualWindows",
  virtualWindowBindings: "virtualWindowBindings",
  workspaceVirtualWindowLayouts: "workspaceVirtualWindowLayouts"
} as const

const localSet = async (items: Record<string, unknown>) => {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return
  try {
    await chrome.storage.local.set(items)
  } catch (err) {
    throw new Error(
      `写入本地存储失败：${err instanceof Error ? err.message : String(err)}`
    )
  }
}

type LegacyTabContainer = {
  order?: unknown
  virtualWindowId?: unknown
  displayId?: unknown
  tabs?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

const isValidWindowId = (value: number) =>
  Number.isSafeInteger(value) && value >= 0

const orderedLegacyTabs = (
  containers: unknown,
  orderByVirtualWindowId?: Map<string, number>
) => {
  if (!Array.isArray(containers)) return []
  return containers
    .filter(isRecord)
    .map((container, index) => ({
      container: container as LegacyTabContainer,
      index
    }))
    .sort((left, right) => {
      const explicitOrder = (value: LegacyTabContainer) =>
        typeof value.order === "number" && Number.isFinite(value.order)
          ? value.order
          : undefined
      const virtualWindowOrder = (value: LegacyTabContainer) => {
        const id =
          typeof value.virtualWindowId === "string"
            ? value.virtualWindowId
            : typeof value.displayId === "string"
              ? value.displayId
              : ""
        return id ? orderByVirtualWindowId?.get(id) : undefined
      }
      const leftOrder =
        explicitOrder(left.container) ??
        virtualWindowOrder(left.container) ??
        left.index
      const rightOrder =
        explicitOrder(right.container) ??
        virtualWindowOrder(right.container) ??
        right.index
      return leftOrder - rightOrder || left.index - right.index
    })
    .flatMap(({ container }) =>
      Array.isArray(container.tabs) ? container.tabs : []
    )
}

const toVirtualWindowOrderMap = (value: unknown) => {
  const orderById = new Map<string, number>()
  if (!Array.isArray(value)) return orderById
  value.filter(isRecord).forEach((item, index) => {
    const id =
      typeof item.virtualWindowId === "string"
        ? item.virtualWindowId
        : typeof item.displayId === "string"
          ? item.displayId
          : null
    if (!id) return
    orderById.set(
      id,
      typeof item.order === "number" && Number.isFinite(item.order)
        ? item.order
        : index
    )
  })
  return orderById
}

const normalizeWorkspace = (
  item: Record<string, unknown>,
  legacyLayouts: unknown,
  virtualWindowOrder: Map<string, number>
): Workspace => {
  const { windowSlots: legacyWindowSlots, ...flatWorkspace } = item
  const tabs =
    Array.isArray(legacyWindowSlots) && legacyWindowSlots.length > 0
      ? orderedLegacyTabs(legacyWindowSlots)
      : Array.isArray(legacyLayouts) && legacyLayouts.length > 0
        ? orderedLegacyTabs(legacyLayouts, virtualWindowOrder)
        : Array.isArray(item.tabs)
          ? item.tabs
          : []

  return sanitizeWorkspace({
    ...flatWorkspace,
    tabs,
    history: Array.isArray(item.history) ? item.history : [],
    tabsRevision: typeof item.tabsRevision === "number" ? item.tabsRevision : 0
  } as Workspace)
}

const toWorkspaceArray = (
  value: unknown,
  options?: {
    legacyLayoutsByWorkspace?: Record<string, unknown>
    virtualWindows?: unknown
  }
): Workspace[] => {
  if (!Array.isArray(value)) return []

  const virtualWindowOrder = toVirtualWindowOrderMap(options?.virtualWindows)

  return value
    .filter(isRecord)
    .filter(
      (item) => typeof item.id === "string" && typeof item.name === "string"
    )
    .map((item) =>
      normalizeWorkspace(
        item,
        options?.legacyLayoutsByWorkspace?.[item.id as string],
        virtualWindowOrder
      )
    )
}

type WorkspaceSwitchState = NonNullable<WorkspaceState["switchState"]>
type WorkspaceSwitchPhase = NonNullable<WorkspaceSwitchState["phase"]>

const UNKNOWN_LEGACY_WINDOW_ID = -1

const SWITCH_PHASES = new Set<WorkspaceSwitchPhase>([
  "preparing",
  "opening",
  "committing",
  "loading",
  "recovering",
  "recovery_failed",
  "done",
  "aborted"
])

const isWorkspaceSwitchPhase = (
  value: unknown
): value is WorkspaceSwitchPhase =>
  typeof value === "string" && SWITCH_PHASES.has(value as WorkspaceSwitchPhase)

const toOptionalCount = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined

const toOptionalFiniteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const toWindowId = (value: unknown) =>
  typeof value === "number" && isValidWindowId(value) ? value : undefined

const legacyWindowEntries = (value: unknown) =>
  Array.isArray(value) ? value.filter(isRecord) : []

const uniqueWindowIds = (entries: Record<string, unknown>[]) => [
  ...new Set(
    entries
      .map((entry) => toWindowId(entry.windowId))
      .filter((windowId): windowId is number => windowId !== undefined)
  )
]

const focusedWindowId = (entries: Record<string, unknown>[]) => {
  const focusedIds = uniqueWindowIds(
    entries.filter((entry) => entry.isFocused === true)
  )
  return focusedIds.length === 1 ? focusedIds[0] : undefined
}

const resolveLegacySwitchWindow = (
  journal: Record<string, unknown>,
  legacyMainState?: unknown
) => {
  const directWindowId = toWindowId(journal.windowId)
  if (directWindowId !== undefined) {
    return { windowId: directWindowId, trusted: true }
  }

  const mainState = isRecord(legacyMainState) ? legacyMainState : {}
  const sourceEntries = legacyWindowEntries(journal.sourceManagedWindows)
  const mainEntries = legacyWindowEntries(mainState.managedWindows)
  const sourceIds = uniqueWindowIds(sourceEntries)
  const mainId = toWindowId(mainState.managedWindowId)

  const focusedSourceId = focusedWindowId(sourceEntries)
  if (focusedSourceId !== undefined) {
    return { windowId: focusedSourceId, trusted: true }
  }
  if (
    mainId !== undefined &&
    (sourceIds.length === 0 || sourceIds.includes(mainId))
  ) {
    return { windowId: mainId, trusted: true }
  }
  if (sourceIds.length === 1) {
    return { windowId: sourceIds[0], trusted: true }
  }

  const focusedMainId = focusedWindowId(mainEntries)
  if (focusedMainId !== undefined) {
    return { windowId: focusedMainId, trusted: true }
  }
  const mainIds = uniqueWindowIds(mainEntries)
  if (mainIds.length === 1) {
    return { windowId: mainIds[0], trusted: true }
  }

  return { windowId: UNKNOWN_LEGACY_WINDOW_ID, trusted: false }
}

const toWorkspaceSwitchSnapshot = (
  value: unknown,
  fallbackId: string,
  fallbackContainers: unknown
): WorkspaceSwitchState["sourceSnapshot"] => {
  if (!isRecord(value) && !Array.isArray(fallbackContainers)) return undefined
  const snapshot = isRecord(value) ? value : {}
  const id =
    typeof snapshot.id === "string" && snapshot.id ? snapshot.id : fallbackId
  const tabs =
    Array.isArray(snapshot.tabs) && snapshot.tabs.length > 0
      ? snapshot.tabs
      : Array.isArray(snapshot.windowSlots) && snapshot.windowSlots.length > 0
        ? orderedLegacyTabs(snapshot.windowSlots)
        : orderedLegacyTabs(fallbackContainers)

  const updatedAt = toOptionalFiniteNumber(snapshot.updatedAt)
  const lastUsedAt = toOptionalFiniteNumber(snapshot.lastUsedAt)
  return {
    id,
    tabs: sanitizeTabSpecs(tabs as Workspace["tabs"])
      .filter((tab) => !tab.pinned)
      .map((tab) => ({ ...tab, pinned: false })),
    ...(updatedAt === undefined ? {} : { updatedAt }),
    ...(lastUsedAt === undefined ? {} : { lastUsedAt })
  }
}

const toWorkspaceSwitchState = (
  value: unknown,
  legacyMainState?: unknown
): WorkspaceState["switchState"] => {
  if (!isRecord(value)) return null
  if (
    typeof value.runId !== "string" ||
    !value.runId ||
    typeof value.targetId !== "string" ||
    !value.targetId ||
    typeof value.ts !== "number" ||
    !Number.isFinite(value.ts)
  ) {
    return null
  }

  const sourceId =
    typeof value.sourceId === "string" && value.sourceId ? value.sourceId : null
  const sourceTabsRevision = toOptionalCount(value.sourceTabsRevision)
  const expectedCount = toOptionalCount(value.expectedCount)
  const openedCount = toOptionalCount(value.openedCount)
  const completedCount = toOptionalCount(value.completedCount)
  const failedCount = toOptionalCount(value.failedCount)
  const updatedAt = toOptionalFiniteNumber(value.updatedAt)
  const recoveryAttempts = toOptionalCount(value.recoveryAttempts)
  const windowResolution = resolveLegacySwitchWindow(value, legacyMainState)
  const sourceSnapshot = toWorkspaceSwitchSnapshot(
    value.sourceSnapshot,
    sourceId ?? `legacy-source-${value.runId}`,
    value.sourceWindowSlots
  )
  const phase = windowResolution.trusted
    ? isWorkspaceSwitchPhase(value.phase)
      ? value.phase
      : undefined
    : "recovery_failed"
  const recoveryError = windowResolution.trusted
    ? typeof value.recoveryError === "string"
      ? value.recoveryError
      : undefined
    : "legacy-window-identity-ambiguous"

  return {
    runId: value.runId,
    targetId: value.targetId,
    sourceId,
    windowId: windowResolution.windowId,
    ...(sourceTabsRevision === undefined ? {} : { sourceTabsRevision }),
    ts: value.ts,
    ...(phase ? { phase } : {}),
    ...(expectedCount === undefined ? {} : { expectedCount }),
    ...(openedCount === undefined ? {} : { openedCount }),
    ...(completedCount === undefined ? {} : { completedCount }),
    ...(failedCount === undefined ? {} : { failedCount }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
    ...(sourceSnapshot ? { sourceSnapshot } : {}),
    ...(recoveryAttempts === undefined ? {} : { recoveryAttempts }),
    ...(recoveryError ? { recoveryError } : {})
  }
}

const toWorkspaceState = (value: unknown): WorkspaceState | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const source = value as Record<string, unknown>
  const activeWorkspaceId =
    typeof source.activeWorkspaceId === "string" ||
    source.activeWorkspaceId === null
      ? (source.activeWorkspaceId as string | null)
      : null

  return {
    activeWorkspaceId,
    notes:
      source.notes && typeof source.notes === "object"
        ? (source.notes as Record<string, string>)
        : {},
    notePreview:
      source.notePreview && typeof source.notePreview === "object"
        ? (source.notePreview as Record<string, boolean>)
        : {},
    linkedResources:
      source.linkedResources && typeof source.linkedResources === "object"
        ? (source.linkedResources as WorkspaceState["linkedResources"])
        : {},
    switchState: toWorkspaceSwitchState(source.switchState, source)
  }
}

const hasOwn = (obj: object, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key)

type WorkspaceStorageSource =
  "local-workspaces" | "local-tags" | "sync-workspaces" | "sync-tags" | "none"

const readWorkspaceStorageSource = async (): Promise<{
  source: WorkspaceStorageSource
  workspaces: Workspace[]
  needsRewrite: boolean
}> => {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return { source: "none", workspaces: [], needsRewrite: false }
  }

  const rLocal = await chrome.storage.local.get([
    STORAGE_KEYS.WORKSPACES,
    STORAGE_KEYS.TAGS,
    LEGACY_STORAGE_KEYS.workspaceVirtualWindowLayouts,
    LEGACY_STORAGE_KEYS.virtualWindows
  ])
  const legacyLayoutsByWorkspace =
    (rLocal[LEGACY_STORAGE_KEYS.workspaceVirtualWindowLayouts] as
      Record<string, unknown> | undefined) ?? {}
  const virtualWindows = rLocal[LEGACY_STORAGE_KEYS.virtualWindows]
  const localOptions = { legacyLayoutsByWorkspace, virtualWindows }

  if (hasOwn(rLocal, STORAGE_KEYS.WORKSPACES)) {
    const raw = rLocal[STORAGE_KEYS.WORKSPACES]
    const workspaces = toWorkspaceArray(raw, localOptions)
    return {
      source: "local-workspaces",
      workspaces,
      needsRewrite:
        JSON.stringify(raw) !== JSON.stringify(workspaces) ||
        Object.keys(legacyLayoutsByWorkspace).length > 0
    }
  }
  if (hasOwn(rLocal, STORAGE_KEYS.TAGS)) {
    return {
      source: "local-tags",
      workspaces: toWorkspaceArray(rLocal[STORAGE_KEYS.TAGS], localOptions),
      needsRewrite: true
    }
  }
  if (!chrome.storage?.sync) {
    return { source: "none", workspaces: [], needsRewrite: false }
  }

  const rSync = await chrome.storage.sync.get([
    STORAGE_KEYS.WORKSPACES,
    STORAGE_KEYS.TAGS
  ])
  if (hasOwn(rSync, STORAGE_KEYS.WORKSPACES)) {
    return {
      source: "sync-workspaces",
      workspaces: toWorkspaceArray(rSync[STORAGE_KEYS.WORKSPACES]),
      needsRewrite: true
    }
  }
  if (hasOwn(rSync, STORAGE_KEYS.TAGS)) {
    return {
      source: "sync-tags",
      workspaces: toWorkspaceArray(rSync[STORAGE_KEYS.TAGS]),
      needsRewrite: true
    }
  }
  return { source: "none", workspaces: [], needsRewrite: false }
}

// Use storage.local for potentially large workspace data to avoid sync per-item quota
export const loadWorkspaces = async (): Promise<Workspace[]> => {
  const result = await readWorkspaceStorageSource()
  return result.workspaces
}

const migrateLegacyWorkspaceStorage = async () => {
  const result = await readWorkspaceStorageSource()
  if (result.source === "none") {
    return false
  }
  if (result.source === "local-workspaces" && !result.needsRewrite) return false

  await localSet({ [STORAGE_KEYS.WORKSPACES]: result.workspaces })
  // chrome.storage.sync has no compare-and-swap delete. Keep remote legacy
  // values as an inert fallback so this device cannot erase a newer write
  // arriving from another browser between the migration read and cleanup.
  try {
    if (result.source === "local-tags") {
      await chrome.storage.local.remove(STORAGE_KEYS.TAGS as any)
    }
  } catch {}
  return true
}

export const saveWorkspaces = async (workspaces: Workspace[]) => {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return
  const normalized = workspaces.map((workspace) =>
    normalizeWorkspace(
      workspace as unknown as Record<string, unknown>,
      [],
      new Map()
    )
  )
  await localSet({ [STORAGE_KEYS.WORKSPACES]: normalized })
}

const normalizeWorkspaceWindowBinding = (
  value: unknown
): WorkspaceWindowBinding | null => {
  if (!isRecord(value)) return null
  const workspaceId =
    typeof value.workspaceId === "string" ? value.workspaceId.trim() : ""
  if (!workspaceId) return null
  const tabsRevision =
    typeof value.tabsRevision === "number" &&
    Number.isSafeInteger(value.tabsRevision) &&
    value.tabsRevision >= 0
      ? value.tabsRevision
      : 0
  const updatedAt =
    typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
      ? value.updatedAt
      : 0
  return {
    workspaceId,
    tabsRevision,
    ...(value.stale === true ? { stale: true } : {}),
    updatedAt
  }
}

const normalizeWorkspaceWindowBindings = (
  value: unknown
): WorkspaceWindowBindingMap => {
  if (!isRecord(value)) return {}
  const bindings: WorkspaceWindowBindingMap = {}
  for (const [rawWindowId, rawBinding] of Object.entries(value)) {
    if (!/^(0|[1-9]\d*)$/.test(rawWindowId)) continue
    const windowId = Number(rawWindowId)
    const binding = normalizeWorkspaceWindowBinding(rawBinding)
    if (!isValidWindowId(windowId) || !binding) continue
    bindings[String(windowId)] = binding
  }
  return bindings
}

export const loadWorkspaceWindowBindings =
  async (): Promise<WorkspaceWindowBindingMap> => {
    if (typeof chrome === "undefined" || !chrome.storage?.session) return {}
    const result = await chrome.storage.session.get(
      STORAGE_KEYS.WINDOW_BINDINGS
    )
    return normalizeWorkspaceWindowBindings(
      result[STORAGE_KEYS.WINDOW_BINDINGS]
    )
  }

let workspaceWindowBindingWriteQueue: Promise<void> = Promise.resolve()

const enqueueWorkspaceWindowBindingWrite = <T>(task: () => Promise<T>) => {
  const run = workspaceWindowBindingWriteQueue.then(task)
  workspaceWindowBindingWriteQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export const updateWorkspaceWindowBindings = (
  updater: (
    current: WorkspaceWindowBindingMap
  ) => WorkspaceWindowBindingMap | Promise<WorkspaceWindowBindingMap>
) =>
  enqueueWorkspaceWindowBindingWrite(async () => {
    const current = await loadWorkspaceWindowBindings()
    const next = normalizeWorkspaceWindowBindings(
      await updater(structuredClone(current))
    )
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      await chrome.storage.session.set({
        [STORAGE_KEYS.WINDOW_BINDINGS]: next
      })
    }
    return next
  })

export const getWorkspaceWindowBinding = async (windowId: number) => {
  if (!isValidWindowId(windowId)) return null
  const bindings = await loadWorkspaceWindowBindings()
  return bindings[String(windowId)] ?? null
}

export const setWorkspaceWindowBinding = (
  windowId: number,
  binding: WorkspaceWindowBinding
) => {
  if (!isValidWindowId(windowId)) {
    return Promise.reject(new Error("invalid-workspace-window-id"))
  }
  const normalized = normalizeWorkspaceWindowBinding(binding)
  if (!normalized) {
    return Promise.reject(new Error("invalid-workspace-window-binding"))
  }
  return updateWorkspaceWindowBindings((current) => ({
    ...current,
    [String(windowId)]: normalized
  }))
}

export const removeWorkspaceWindowBinding = (windowId: number) => {
  if (!isValidWindowId(windowId)) return Promise.resolve({})
  return updateWorkspaceWindowBindings((current) => {
    const next = { ...current }
    delete next[String(windowId)]
    return next
  })
}

export const removeWorkspaceBindingsForWorkspace = (workspaceId: string) =>
  updateWorkspaceWindowBindings((current) =>
    Object.fromEntries(
      Object.entries(current).filter(
        ([, binding]) => binding.workspaceId !== workspaceId
      )
    )
  )

export const clearWorkspaceWindowBindings = () =>
  enqueueWorkspaceWindowBindingWrite(async () => {
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      await chrome.storage.session.remove(STORAGE_KEYS.WINDOW_BINDINGS)
    }
    return {} as WorkspaceWindowBindingMap
  })

const normalizeShortcuts = (value: unknown): Settings["shortcuts"] => {
  const source = isRecord(value) ? value : {}
  const fallback = DEFAULT_SETTINGS.shortcuts ?? {}
  const read = (key: keyof NonNullable<Settings["shortcuts"]>) => {
    const shortcut = source[key]
    return typeof shortcut === "string" ? shortcut : fallback[key]
  }
  return {
    goHome: read("goHome"),
    newWorkspace: read("newWorkspace"),
    prevWorkspace: read("prevWorkspace"),
    nextWorkspace: read("nextWorkspace")
  }
}

const normalizeSettings = (
  portableValue: unknown,
  localValue: unknown
): Settings => {
  const portable = isRecord(portableValue) ? portableValue : {}
  const local = isRecord(localValue) ? localValue : {}
  const theme =
    portable.theme === "dark" ||
    portable.theme === "light" ||
    portable.theme === "system"
      ? portable.theme
      : DEFAULT_SETTINGS.theme
  const accentColor = normalizeHex(
    typeof portable.accentColor === "string"
      ? portable.accentColor
      : (DEFAULT_SETTINGS.accentColor ?? "#6C5CE7")
  ).toUpperCase()

  return {
    devMode:
      typeof local.devMode === "boolean"
        ? local.devMode
        : DEFAULT_SETTINGS.devMode,
    agentControlEnabled:
      typeof local.agentControlEnabled === "boolean"
        ? local.agentControlEnabled
        : DEFAULT_SETTINGS.agentControlEnabled,
    theme,
    ...(portable.language === "zh-CN" || portable.language === "en-US"
      ? { language: portable.language }
      : {}),
    accentColor,
    shortcuts: normalizeShortcuts(portable.shortcuts),
    workspaceSort:
      portable.workspaceSort === "lastUsed" ? "lastUsed" : "created"
  }
}

export const loadSettings = async (): Promise<Settings> => {
  if (typeof chrome === "undefined" || !chrome.storage) {
    console.warn("[TabPlex] chrome.storage 不可用，返回默认设置")
    return DEFAULT_SETTINGS
  }
  const [syncResult, localResult] = await Promise.all([
    chrome.storage.sync?.get(STORAGE_KEYS.SETTINGS) ?? Promise.resolve({}),
    chrome.storage.local?.get(STORAGE_KEYS.LOCAL_SETTINGS) ??
      Promise.resolve({})
  ])
  const settings = normalizeSettings(
    syncResult?.[STORAGE_KEYS.SETTINGS],
    localResult?.[STORAGE_KEYS.LOCAL_SETTINGS]
  )
  writeCachedThemePreference(settings.theme)
  return settings
}

let settingsWriteQueue: Promise<void> = Promise.resolve()

const enqueueSettingsWrite = <T>(task: () => Promise<T>) => {
  const run = settingsWriteQueue.then(task)
  settingsWriteQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export const splitSettingsForStorage = (settings: Settings) => {
  const devMode = settings.devMode === true
  const agentControlEnabled = settings.agentControlEnabled === true
  const shortcuts = {
    goHome:
      typeof settings.shortcuts?.goHome === "string"
        ? settings.shortcuts.goHome
        : DEFAULT_SETTINGS.shortcuts?.goHome,
    newWorkspace:
      typeof settings.shortcuts?.newWorkspace === "string"
        ? settings.shortcuts.newWorkspace
        : DEFAULT_SETTINGS.shortcuts?.newWorkspace,
    prevWorkspace:
      typeof settings.shortcuts?.prevWorkspace === "string"
        ? settings.shortcuts.prevWorkspace
        : DEFAULT_SETTINGS.shortcuts?.prevWorkspace,
    nextWorkspace:
      typeof settings.shortcuts?.nextWorkspace === "string"
        ? settings.shortcuts.nextWorkspace
        : DEFAULT_SETTINGS.shortcuts?.nextWorkspace
  }
  const portableSettings: Omit<Settings, "devMode" | "agentControlEnabled"> = {
    theme: ["dark", "light", "system"].includes(settings.theme)
      ? settings.theme
      : DEFAULT_SETTINGS.theme,
    ...(settings.language === "zh-CN" || settings.language === "en-US"
      ? { language: settings.language }
      : {}),
    accentColor: normalizeHex(
      settings.accentColor ?? DEFAULT_SETTINGS.accentColor ?? "#6C5CE7"
    ).toUpperCase(),
    shortcuts,
    workspaceSort:
      settings.workspaceSort === "lastUsed" ? "lastUsed" : "created"
  }

  return {
    localSettings: {
      devMode,
      agentControlEnabled
    },
    portableSettings
  }
}

const persistSettings = async (settings: Settings) => {
  if (typeof chrome === "undefined" || !chrome.storage) return
  const { localSettings, portableSettings } = splitSettingsForStorage(settings)
  if (chrome.storage.local) {
    await localSet({
      [STORAGE_KEYS.LOCAL_SETTINGS]: localSettings
    })
  }
  if (chrome.storage.sync) {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.SETTINGS]: portableSettings
    })
  }
  writeCachedThemePreference(settings.theme)
}

export const saveSettings = async (settings: Settings) =>
  enqueueSettingsWrite(() => persistSettings(settings))

export const loadWorkspaceState = async (): Promise<WorkspaceState> => {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    console.warn("[TabPlex] chrome.storage.local 不可用，返回默认工作区状态")
    return DEFAULT_WORKSPACE_STATE
  }
  const r = await chrome.storage.local.get([
    STORAGE_KEYS.STATE,
    STORAGE_KEYS.SWITCH_STATE
  ])
  let raw = toWorkspaceState(r[STORAGE_KEYS.STATE]) ?? DEFAULT_WORKSPACE_STATE
  let switchStateRaw =
    toWorkspaceSwitchState(
      r[STORAGE_KEYS.SWITCH_STATE],
      r[STORAGE_KEYS.STATE]
    ) ??
    raw.switchState ??
    null

  const hasLocalState = hasOwn(r, STORAGE_KEYS.STATE)
  const hasLocalSwitchState = hasOwn(r, STORAGE_KEYS.SWITCH_STATE)
  if (!hasLocalState && !hasLocalSwitchState && chrome.storage?.sync) {
    const syncResult = await chrome.storage.sync.get([
      STORAGE_KEYS.STATE,
      STORAGE_KEYS.SWITCH_STATE
    ])
    const hasSyncState = hasOwn(syncResult, STORAGE_KEYS.STATE)
    const hasSyncSwitchState = hasOwn(syncResult, STORAGE_KEYS.SWITCH_STATE)
    if (hasSyncState || hasSyncSwitchState) {
      const syncRaw =
        toWorkspaceState(syncResult[STORAGE_KEYS.STATE]) ??
        DEFAULT_WORKSPACE_STATE
      const syncSwitchState =
        toWorkspaceSwitchState(
          syncResult[STORAGE_KEYS.SWITCH_STATE],
          syncResult[STORAGE_KEYS.STATE]
        ) ??
        syncRaw.switchState ??
        null

      raw = syncRaw
      switchStateRaw = syncSwitchState
    }
  }

  const normalizedSwitchState = (() => {
    if (!switchStateRaw) return null
    const opened = switchStateRaw.openedCount
    const completed =
      switchStateRaw.completedCount ?? (typeof opened === "number" ? opened : 0)
    const failed = switchStateRaw.failedCount ?? 0
    const expected = switchStateRaw.expectedCount
    const updatedAt =
      switchStateRaw.updatedAt ?? switchStateRaw.ts ?? Date.now()
    const phase = switchStateRaw.phase
    return {
      ...switchStateRaw,
      expectedCount: expected,
      openedCount: opened,
      completedCount: completed,
      failedCount: failed,
      updatedAt,
      phase
    }
  })()
  return {
    activeWorkspaceId: raw.activeWorkspaceId ?? null,
    notes: raw.notes ?? {},
    notePreview: raw.notePreview ?? {},
    linkedResources: raw.linkedResources ?? {},
    switchState: normalizedSwitchState ?? null
  }
}

const migrateLegacyWorkspaceStateStorage = async () => {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return false

  const localResult = await chrome.storage.local.get([
    STORAGE_KEYS.STATE,
    STORAGE_KEYS.SWITCH_STATE
  ])
  const hasLocalState = hasOwn(localResult, STORAGE_KEYS.STATE)
  const hasLocalSwitchState = hasOwn(localResult, STORAGE_KEYS.SWITCH_STATE)
  if (hasLocalState || hasLocalSwitchState) {
    const rawState = localResult[STORAGE_KEYS.STATE]
    const normalizedState =
      toWorkspaceState(rawState) ?? DEFAULT_WORKSPACE_STATE
    const rawSwitchState = localResult[STORAGE_KEYS.SWITCH_STATE]
    const switchState =
      toWorkspaceSwitchState(rawSwitchState, rawState) ??
      normalizedState.switchState ??
      null
    const { switchState: _ignored, ...mainState } = normalizedState
    const needsRewrite =
      JSON.stringify(rawState ?? {}) !== JSON.stringify(mainState) ||
      JSON.stringify(rawSwitchState ?? null) !== JSON.stringify(switchState) ||
      !hasLocalSwitchState
    if (needsRewrite) {
      await localSet({
        [STORAGE_KEYS.STATE]: mainState,
        [STORAGE_KEYS.SWITCH_STATE]: switchState
      })
    }
    return needsRewrite
  }

  if (!chrome.storage?.sync) return false
  const syncResult = await chrome.storage.sync.get([
    STORAGE_KEYS.STATE,
    STORAGE_KEYS.SWITCH_STATE
  ])
  const hasSyncState = hasOwn(syncResult, STORAGE_KEYS.STATE)
  const hasSyncSwitchState = hasOwn(syncResult, STORAGE_KEYS.SWITCH_STATE)
  if (!hasSyncState && !hasSyncSwitchState) return false

  const normalizedState =
    toWorkspaceState(syncResult[STORAGE_KEYS.STATE]) ?? DEFAULT_WORKSPACE_STATE
  const syncSwitchState =
    toWorkspaceSwitchState(
      syncResult[STORAGE_KEYS.SWITCH_STATE],
      syncResult[STORAGE_KEYS.STATE]
    ) ??
    normalizedState.switchState ??
    null
  const { switchState: _ignored, ...mainState } = normalizedState

  await localSet({
    [STORAGE_KEYS.STATE]: mainState,
    [STORAGE_KEYS.SWITCH_STATE]: syncSwitchState
  })
  // Do not remove the sync source here; see the workspace migration above.
  return true
}

export const migrateLegacyStorage = async () => {
  const workspacesMigrated = await migrateLegacyWorkspaceStorage()
  const workspaceStateMigrated = await migrateLegacyWorkspaceStateStorage()
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.remove(Object.values(LEGACY_STORAGE_KEYS))
  }
  return { workspacesMigrated, workspaceStateMigrated }
}

export const saveWorkspaceState = async (state: WorkspaceState) => {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return
  const normalized = toWorkspaceState(state) ?? DEFAULT_WORKSPACE_STATE
  const { switchState, ...rest } = normalized
  await localSet({
    [STORAGE_KEYS.STATE]: rest,
    [STORAGE_KEYS.SWITCH_STATE]: switchState ?? null
  })
}

// Patch-write WorkspaceState to avoid clobbering fields written concurrently
// by other extension contexts (e.g. background switch progress).
export const saveWorkspaceStatePatch = async (
  patch: Partial<WorkspaceState>
) => {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return
  const r = await chrome.storage.local.get(STORAGE_KEYS.STATE)
  const current =
    toWorkspaceState(r[STORAGE_KEYS.STATE]) ?? DEFAULT_WORKSPACE_STATE
  const normalizedPatch = toWorkspaceState({ ...current, ...patch }) ?? current
  const next: WorkspaceState = {
    ...current,
    ...normalizedPatch,
    activeWorkspaceId:
      patch.activeWorkspaceId === undefined
        ? (current.activeWorkspaceId ?? null)
        : (patch.activeWorkspaceId ?? null),
    notes: patch.notes ?? current.notes ?? {},
    notePreview: patch.notePreview ?? current.notePreview ?? {},
    linkedResources: patch.linkedResources ?? current.linkedResources ?? {}
  }
  const { switchState: _ignored, ...mainState } = next
  await localSet({ [STORAGE_KEYS.STATE]: mainState })
}

export const saveWorkspaceSwitchState = async (
  switchState: WorkspaceState["switchState"] | null
) => {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return
  await localSet({
    [STORAGE_KEYS.SWITCH_STATE]: toWorkspaceSwitchState(switchState)
  })
}
