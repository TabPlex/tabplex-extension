import {
  getWorkspaceWindowBinding,
  loadWorkspaces,
  loadWorkspaceState,
  removeWorkspaceWindowBinding,
  saveWorkspaceSwitchState,
  setWorkspaceWindowBinding
} from "~core/storage"
import type {
  TabSpec,
  Workspace,
  WorkspaceState,
  WorkspaceSwitchSnapshot
} from "~core/types"
import { uuid } from "~core/utils"
import {
  recordSnapshot,
  sanitizeWorkspace
} from "~features/workspace/logic/workspaceLogic"
import { applyWorkspacesUpdate } from "~lib/workspacesQueue"

import { tabOrchestrator } from "./TabOrchestrator"
import {
  flushWorkspaceWindowAutosave,
  resumeWorkspaceWindowAutosave,
  suppressWorkspaceWindowAutosave
} from "./workspaceAutosave"
import {
  assertNormalWindow,
  captureWorkspaceWindowTabs,
  resolveNormalWindowId
} from "./workspaceWindowTabs"

const SWITCH_ALARM_PREFIX = "tabplex-window-switch:"
const SWITCH_TIMEOUT_MS = 60_000

type SwitchTransaction = {
  runId: string
  windowId: number
  intent: SwitchIntent
  promise: Promise<WorkspaceSwitchResult>
}

type SwitchIntent = {
  requestId: number
  windowId: number
  abortController: AbortController
  cancellationReason?: string
}

export type WorkspaceSwitchResult = {
  success: boolean
  reason?: string
  error?: string
}

export type WorkspaceSwitchRequestOptions = {
  preferredWindowId?: number
  skipSourceSave?: boolean
}

let currentSwitch: SwitchTransaction | null = null
let switchQueue: Promise<void> = Promise.resolve()
let recoveryPromise: Promise<boolean> | null = null
let nextSwitchRequestId = 0
const latestSwitchIntentByWindow = new Map<number, SwitchIntent>()
const latestSwitchRequestIdByWindow = new Map<number, number>()

const switchAlarmName = (runId: string) => `${SWITCH_ALARM_PREFIX}${runId}`

const tabPlanSignature = (tabs: TabSpec[]) =>
  JSON.stringify(
    tabs.map((tab) => ({
      url: tab.url,
      pinned: tab.pinned === true,
      excluded: tab.excluded === true,
      group: tab.group ?? null
    }))
  )

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const isVolatileWindowCaptureError = (error: unknown) => {
  const message = getErrorMessage(error)
  return (
    message === "workspace-window-tabs-busy" ||
    message === "workspace-autosave-tabs-changed-during-capture"
  )
}

const cancelSwitchIntent = (intent: SwitchIntent, reason: string) => {
  if (intent.abortController.signal.aborted) return
  intent.cancellationReason = reason
  intent.abortController.abort()
}

const throwIfSwitchIntentCancelled = (intent: SwitchIntent) => {
  if (intent.abortController.signal.aborted) {
    throw new Error("workspace-switch-aborted")
  }
}

const supersededSwitchResult = (): WorkspaceSwitchResult => ({
  success: true
})

const cancelledSwitchResult = (intent: SwitchIntent): WorkspaceSwitchResult =>
  intent.cancellationReason === "superseded"
    ? supersededSwitchResult()
    : {
        success: false,
        reason: "workspace-switch-aborted",
        error: "workspace-switch-aborted"
      }

const updateSwitchState = async (
  current: NonNullable<WorkspaceState["switchState"]>,
  patch: Partial<NonNullable<WorkspaceState["switchState"]>>
) => {
  const next = { ...current, ...patch, updatedAt: Date.now() }
  await saveWorkspaceSwitchState(next)
  return next
}

const appendRecoverySnapshot = async (sourceId: string, tabs: TabSpec[]) => {
  let found = false
  await applyWorkspacesUpdate((workspaces) => {
    const index = workspaces.findIndex((workspace) => workspace.id === sourceId)
    if (index < 0) return workspaces
    found = true
    const next = [...workspaces]
    next[index] = {
      ...recordSnapshot(workspaces[index], tabs),
      updatedAt: Date.now()
    }
    return next
  })
  return found
}

const createOrphanRecoveryWorkspace = async (tabs: TabSpec[]) => {
  if (!tabs.length) return
  const now = Date.now()
  const recovered = sanitizeWorkspace({
    id: uuid(),
    name: `恢复的窗口 ${new Date(now).toLocaleString()}`,
    emoji: "🛟",
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
    tabs,
    tabsRevision: 0,
    history: []
  })
  await applyWorkspacesUpdate((workspaces) => [recovered, ...workspaces])
}

const preserveRecoverySnapshot = async (
  sourceId: string | null,
  tabs: TabSpec[]
) => {
  if (sourceId && (await appendRecoverySnapshot(sourceId, tabs))) {
    return
  }
  await createOrphanRecoveryWorkspace(tabs)
}

const clearSwitchAlarm = async (runId: string) => {
  try {
    await chrome.alarms?.clear(switchAlarmName(runId))
  } catch {}
}

const recoverSwitchJournal = async (
  journal: NonNullable<WorkspaceState["switchState"]>
) => {
  const sourceTabs = journal.sourceSnapshot?.tabs ?? []
  try {
    await assertNormalWindow(journal.windowId)
  } catch {
    await preserveRecoverySnapshot(journal.sourceId, sourceTabs)
    await removeWorkspaceWindowBinding(journal.windowId)
    await saveWorkspaceSwitchState(null)
    await clearSwitchAlarm(journal.runId)
    return true
  }

  try {
    await tabOrchestrator.switchWorkspace(journal.windowId, sourceTabs, {})
    if (journal.sourceId) {
      const source = (await loadWorkspaces()).find(
        (workspace) => workspace.id === journal.sourceId && !workspace.trashedAt
      )
      if (source) {
        const currentRevision = source.tabsRevision ?? 0
        const restoredRevision = journal.sourceTabsRevision ?? currentRevision
        await setWorkspaceWindowBinding(journal.windowId, {
          workspaceId: source.id,
          tabsRevision: restoredRevision,
          stale: restoredRevision !== currentRevision,
          updatedAt: Date.now()
        })
      } else {
        await preserveRecoverySnapshot(journal.sourceId, sourceTabs)
        await removeWorkspaceWindowBinding(journal.windowId)
      }
    } else {
      await removeWorkspaceWindowBinding(journal.windowId)
    }
    await saveWorkspaceSwitchState(null)
    await clearSwitchAlarm(journal.runId)
    return true
  } catch (error) {
    await saveWorkspaceSwitchState({
      ...journal,
      phase: "recovery_failed",
      recoveryAttempts: (journal.recoveryAttempts ?? 0) + 1,
      recoveryError: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now()
    })
    return false
  }
}

export const recoverPendingWorkspaceSwitch = async () => {
  if (recoveryPromise) return recoveryPromise
  recoveryPromise = (async () => {
    const journal = (await loadWorkspaceState()).switchState
    if (!journal) return true
    return recoverSwitchJournal(journal)
  })()
  try {
    return await recoveryPromise
  } finally {
    recoveryPromise = null
  }
}

const captureSourceSnapshot = async (
  windowId: number,
  source: Workspace | null
): Promise<WorkspaceSwitchSnapshot> => {
  let tabs: TabSpec[]
  try {
    tabs = await captureWorkspaceWindowTabs({
      windowId,
      previousTabs: source?.tabs ?? []
    })
  } catch (error) {
    if (!isVolatileWindowCaptureError(error)) throw error
    // 加载中的标签不写回工作区；切换失败时使用已有的持久化副本恢复。
    tabs = source?.tabs ?? []
  }

  return {
    id: source?.id ?? `window-${windowId}`,
    tabs,
    updatedAt: source?.updatedAt,
    lastUsedAt: source?.lastUsedAt
  }
}

const runSwitch = async (
  targetId: string,
  windowId: number,
  options: WorkspaceSwitchRequestOptions,
  intent: SwitchIntent
): Promise<WorkspaceSwitchResult> => {
  if (intent.abortController.signal.aborted) {
    return cancelledSwitchResult(intent)
  }

  suppressWorkspaceWindowAutosave(windowId)
  let journal: NonNullable<WorkspaceState["switchState"]> | null = null
  let discardPendingAutosave = false

  try {
    const initialBinding = await getWorkspaceWindowBinding(windowId)
    throwIfSwitchIntentCancelled(intent)
    let sourceBinding = initialBinding
    if (sourceBinding && !options.skipSourceSave) {
      let result: Awaited<ReturnType<typeof flushWorkspaceWindowAutosave>>
      try {
        result = await flushWorkspaceWindowAutosave(windowId)
      } catch (error) {
        if (!isVolatileWindowCaptureError(error)) throw error
        result = {
          status: "unchanged",
          workspaceId: sourceBinding.workspaceId
        }
      }
      sourceBinding = await getWorkspaceWindowBinding(windowId)
      throwIfSwitchIntentCancelled(intent)
      if (result.status === "stale") {
        const source = (await loadWorkspaces()).find(
          (workspace) => workspace.id === result.workspaceId
        )
        try {
          const staleTabs = await captureWorkspaceWindowTabs({
            windowId,
            previousTabs: source?.tabs ?? []
          })
          await preserveRecoverySnapshot(result.workspaceId, staleTabs)
        } catch (error) {
          if (!isVolatileWindowCaptureError(error)) throw error
        }
      }
    }
    // From this point on, the switch transaction owns the window. Mutations
    // raised by tab orchestration must not be replayed as user autosaves.
    discardPendingAutosave = true

    const workspaces = await loadWorkspaces()
    throwIfSwitchIntentCancelled(intent)
    const target = workspaces.find(
      (workspace) => workspace.id === targetId && !workspace.trashedAt
    )
    if (!target) throw new Error("workspace_not_found")
    if (
      sourceBinding?.workspaceId === target.id &&
      sourceBinding.stale !== true &&
      sourceBinding.tabsRevision === (target.tabsRevision ?? 0)
    ) {
      return { success: true }
    }
    const source = sourceBinding
      ? (workspaces.find(
          (workspace) => workspace.id === sourceBinding?.workspaceId
        ) ?? null)
      : null
    const sourceSnapshot = await captureSourceSnapshot(windowId, source)
    throwIfSwitchIntentCancelled(intent)
    const targetRevision = target.tabsRevision ?? 0
    const targetSignature = tabPlanSignature(target.tabs)
    const runId = uuid()
    journal = {
      runId,
      targetId,
      sourceId: source?.id ?? null,
      windowId,
      sourceTabsRevision: sourceBinding?.tabsRevision,
      ts: Date.now(),
      phase: "preparing",
      expectedCount: target.tabs.length,
      openedCount: 0,
      completedCount: 0,
      failedCount: 0,
      sourceSnapshot,
      updatedAt: Date.now()
    }
    await saveWorkspaceSwitchState(journal)
    throwIfSwitchIntentCancelled(intent)

    try {
      chrome.alarms?.create(switchAlarmName(runId), {
        when: Date.now() + SWITCH_TIMEOUT_MS
      })
    } catch {}

    let preparedCount = 0
    const operation = (async (): Promise<WorkspaceSwitchResult> => {
      await tabOrchestrator.switchWorkspace(windowId, target.tabs, {
        signal: intent.abortController.signal,
        onTabPrepared: () => {
          preparedCount += 1
        },
        onBatchPrepared: async (progress) => {
          throwIfSwitchIntentCancelled(intent)
          preparedCount = progress.preparedCount
          journal = await updateSwitchState(journal!, {
            openedCount: preparedCount,
            completedCount: preparedCount
          })
          throwIfSwitchIntentCancelled(intent)
        },
        onBeforeCommit: async () => {
          throwIfSwitchIntentCancelled(intent)
          const latest = (await loadWorkspaces()).find(
            (workspace) => workspace.id === targetId && !workspace.trashedAt
          )
          throwIfSwitchIntentCancelled(intent)
          if (
            !latest ||
            (latest.tabsRevision ?? 0) !== targetRevision ||
            tabPlanSignature(latest.tabs) !== targetSignature
          ) {
            throw new Error("workspace-target-conflict")
          }
          journal = await updateSwitchState(journal!, {
            phase: "committing",
            openedCount: preparedCount,
            completedCount: preparedCount
          })
        }
      })

      throwIfSwitchIntentCancelled(intent)
      await setWorkspaceWindowBinding(windowId, {
        workspaceId: target.id,
        tabsRevision: targetRevision,
        stale: false,
        updatedAt: Date.now()
      })
      await applyWorkspacesUpdate((current) => {
        const index = current.findIndex(
          (workspace) => workspace.id === target.id
        )
        if (index < 0) return current
        const next = [...current]
        next[index] = { ...current[index], lastUsedAt: Date.now() }
        return next
      })
      await saveWorkspaceSwitchState(null)
      await clearSwitchAlarm(runId)
      return { success: true }
    })()

    currentSwitch = { runId, windowId, intent, promise: operation }
    return await operation
  } catch (error) {
    if (journal) {
      const recovered = await recoverSwitchJournal(journal)
      if (!recovered) {
        return {
          success: false,
          reason: "recovery_required",
          error: (await loadWorkspaceState()).switchState?.recoveryError
        }
      }
    }
    if (intent.cancellationReason === "superseded") {
      return supersededSwitchResult()
    }
    const message = getErrorMessage(error)
    return { success: false, reason: message, error: message }
  } finally {
    if (currentSwitch?.intent === intent) currentSwitch = null
    resumeWorkspaceWindowAutosave(
      windowId,
      discardPendingAutosave ? { discardPending: true } : undefined
    )
  }
}

export const requestCurrentWindowWorkspaceSwitch = async (
  targetId: string,
  options: WorkspaceSwitchRequestOptions = {}
) => {
  if (!targetId) return { success: false, reason: "invalid_target" }

  const requestId = ++nextSwitchRequestId
  const windowId = await resolveNormalWindowId(options.preferredWindowId)
  const latestRequestId = latestSwitchRequestIdByWindow.get(windowId) ?? 0
  if (requestId < latestRequestId) return supersededSwitchResult()
  latestSwitchRequestIdByWindow.set(windowId, requestId)

  const existing = latestSwitchIntentByWindow.get(windowId)
  if (existing) cancelSwitchIntent(existing, "superseded")

  const intent: SwitchIntent = {
    requestId,
    windowId,
    abortController: new AbortController()
  }
  latestSwitchIntentByWindow.set(windowId, intent)

  const task = switchQueue.then(async () => {
    if (
      intent.abortController.signal.aborted ||
      latestSwitchIntentByWindow.get(windowId) !== intent
    ) {
      return cancelledSwitchResult(intent)
    }

    const recovered = await recoverPendingWorkspaceSwitch()
    if (!recovered) {
      return { success: false, reason: "recovery_required" }
    }
    if (
      intent.abortController.signal.aborted ||
      latestSwitchIntentByWindow.get(windowId) !== intent
    ) {
      return cancelledSwitchResult(intent)
    }
    return runSwitch(targetId, windowId, options, intent)
  })
  switchQueue = task.then(
    () => undefined,
    () => undefined
  )

  try {
    return await task
  } finally {
    if (latestSwitchIntentByWindow.get(windowId) === intent) {
      latestSwitchIntentByWindow.delete(windowId)
    }
  }
}

export const abortCurrentWorkspaceSwitch = async (reason = "aborted") => {
  const intents = new Set(latestSwitchIntentByWindow.values())
  if (currentSwitch) intents.add(currentSwitch.intent)
  if (intents.size) {
    console.warn("[TabPlex] 中止当前窗口切换", reason)
    for (const intent of intents) cancelSwitchIntent(intent, reason)
  }
  await switchQueue.catch(() => undefined)
  return intents.size > 0
}

export const handleWorkspaceSwitchTimeoutAlarm = (alarmName: string) => {
  if (!alarmName.startsWith(SWITCH_ALARM_PREFIX)) return false
  const runId = alarmName.slice(SWITCH_ALARM_PREFIX.length)
  if (currentSwitch?.runId === runId) {
    console.warn("[TabPlex] 工作区切换超时", runId)
    cancelSwitchIntent(currentSwitch.intent, "timeout")
  } else {
    void recoverPendingWorkspaceSwitch()
  }
  return true
}

export const discardPendingWorkspaceSwitch = async (confirm: boolean) => {
  if (!confirm)
    throw new Error("workspace-switch-recovery-confirmation-required")
  const journal = (await loadWorkspaceState()).switchState
  if (!journal) return false
  await saveWorkspaceSwitchState(null)
  await clearSwitchAlarm(journal.runId)
  return true
}

export const clearCurrentWindowWorkspaceBinding = async (
  preferredWindowId?: number
) => {
  const windowId = await resolveNormalWindowId(preferredWindowId)
  await flushWorkspaceWindowAutosave(windowId)
  await removeWorkspaceWindowBinding(windowId)
}
