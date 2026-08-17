import {
  getWorkspaceWindowBinding,
  loadSettings,
  loadWorkspaces,
  removeWorkspaceWindowBinding
} from "~core/storage"
import type { WorkspaceWindowBinding } from "~core/types"
import { resolveTabUrl } from "~core/utils"

import { isTabClosing, unmarkTabClosing } from "./services/closingTabs"
import {
  flushAllWorkspaceWindowAutosaves,
  flushWorkspaceWindowAutosave,
  markOtherWorkspaceBindingsStale,
  noteWorkspaceWindowMutation
} from "./services/workspaceAutosave"
import { requestAdjacentWorkspaceSwitch } from "./services/workspaceShortcutSwitch"
import {
  abortCurrentWorkspaceSwitch,
  clearCurrentWindowWorkspaceBinding,
  discardPendingWorkspaceSwitch,
  handleWorkspaceSwitchTimeoutAlarm,
  recoverPendingWorkspaceSwitch,
  requestCurrentWindowWorkspaceSwitch,
  type WorkspaceSwitchRequestOptions
} from "./services/workspaceSwitchService"
import {
  cancelWorkspaceTabWarmup,
  handleWorkspaceTabWarmupActivated,
  handleWorkspaceTabWarmupAlarm,
  handleWorkspaceTabWarmupRemoved,
  handleWorkspaceTabWarmupUpdated,
  resumeWorkspaceTabWarmups
} from "./services/workspaceTabWarmup"
import {
  assertNormalWindow,
  resolveNormalWindowId
} from "./services/workspaceWindowTabs"
import { workspaceOperationGate } from "./workspaceOperationGate"

type WorkspaceDataOperationOptions = {
  materializeWorkspaceIds?: string[] | (() => string[])
  preferredWindowId?: number
  flushPreferredWindowAutosave?: boolean
  rollbackOnMaterializeFailure?: () => Promise<void>
}

type WorkspaceWindowScope = {
  windowId: number
  binding: WorkspaceWindowBinding
  assertStillBound: () => Promise<void>
}

let listenersRegistered = false
let initializationPromise: Promise<void> | null = null
let startupGate: Promise<unknown> = Promise.resolve()

const isRelevantTabUpdate = (change: chrome.tabs.OnUpdatedInfo) =>
  change.status === "complete" ||
  !!change.url ||
  !!change.title ||
  !!change.favIconUrl ||
  change.pinned !== undefined

const registerControllerListeners = () => {
  if (listenersRegistered) return
  listenersRegistered = true

  chrome.tabs?.onUpdated?.addListener((tabId, change, tab) => {
    handleWorkspaceTabWarmupUpdated(tabId, change, tab)
    if (isRelevantTabUpdate(change)) noteWorkspaceWindowMutation(tab.windowId)
  })
  chrome.tabs?.onActivated?.addListener(handleWorkspaceTabWarmupActivated)
  chrome.tabs?.onCreated?.addListener((tab) => {
    noteWorkspaceWindowMutation(tab.windowId)
  })
  chrome.tabs?.onRemoved?.addListener((tabId, info) => {
    unmarkTabClosing(tabId)
    handleWorkspaceTabWarmupRemoved(info.windowId)
    noteWorkspaceWindowMutation(info.windowId)
  })
  chrome.tabs?.onMoved?.addListener((_tabId, info) => {
    noteWorkspaceWindowMutation(info.windowId)
  })
  chrome.tabs?.onDetached?.addListener((_tabId, info) => {
    handleWorkspaceTabWarmupRemoved(info.oldWindowId)
    noteWorkspaceWindowMutation(info.oldWindowId)
  })
  chrome.tabs?.onAttached?.addListener((_tabId, info) => {
    noteWorkspaceWindowMutation(info.newWindowId)
  })
  chrome.windows?.onRemoved?.addListener((windowId) => {
    void cancelWorkspaceTabWarmup(windowId)
    void removeWorkspaceWindowBinding(windowId)
  })
  chrome.alarms?.onAlarm?.addListener((alarm) => {
    handleWorkspaceSwitchTimeoutAlarm(alarm.name)
    handleWorkspaceTabWarmupAlarm(alarm.name)
  })
}

export const initWorkspaceController = (gate?: Promise<unknown>) => {
  if (gate) startupGate = gate
  registerControllerListeners()
  if (initializationPromise) return initializationPromise

  initializationPromise = startupGate
    .then(async () => {
      await recoverPendingWorkspaceSwitch()
      await resumeWorkspaceTabWarmups()
    })
    .catch((error) => {
      initializationPromise = null
      throw error
    })
  return initializationPromise
}

export const requestWorkspaceSwitch = async (
  targetId: string,
  options?: WorkspaceSwitchRequestOptions
) => {
  await initWorkspaceController()
  return workspaceOperationGate.runNormal(() =>
    requestCurrentWindowWorkspaceSwitch(targetId, options)
  )
}

export const abortCurrentSwitch = abortCurrentWorkspaceSwitch

export const discardWorkspaceSwitchRecovery = discardPendingWorkspaceSwitch

export const clearCurrentWindowWorkspace = async (
  preferredWindowId?: number
) => {
  await initWorkspaceController()
  return workspaceOperationGate.runNormal(() =>
    clearCurrentWindowWorkspaceBinding(preferredWindowId)
  )
}

export const withWorkspaceControllerMaintenance = async <T>(
  task: () => Promise<T>
) => {
  await initWorkspaceController()
  return workspaceOperationGate.runExclusive({
    beforeDrain: () =>
      abortCurrentWorkspaceSwitch("maintenance").then(() => {}),
    task: async () => {
      await flushAllWorkspaceWindowAutosaves()
      return task()
    }
  })
}

const materializeChangedWorkspaces = async (
  workspaceIds: string[],
  preferredWindowId?: number
) => {
  const binding =
    typeof preferredWindowId === "number"
      ? await getWorkspaceWindowBinding(preferredWindowId)
      : null
  for (const workspaceId of workspaceIds) {
    await markOtherWorkspaceBindingsStale(
      workspaceId,
      binding?.workspaceId === workspaceId ? preferredWindowId : undefined
    )
  }
  if (
    typeof preferredWindowId !== "number" ||
    !binding ||
    !workspaceIds.includes(binding.workspaceId)
  ) {
    return
  }
  const result = await requestCurrentWindowWorkspaceSwitch(
    binding.workspaceId,
    {
      preferredWindowId,
      skipSourceSave: true
    }
  )
  if (!result.success) {
    throw new Error(result.error || result.reason || "workspace-reload-failed")
  }
}

export const runWorkspaceDataOperation = async <T>(
  task: () => Promise<T>,
  options?: WorkspaceDataOperationOptions
) => {
  await initWorkspaceController()
  return workspaceOperationGate.runNormal(async () => {
    if (
      typeof options?.preferredWindowId === "number" &&
      options.flushPreferredWindowAutosave !== false
    ) {
      await flushWorkspaceWindowAutosave(options.preferredWindowId)
    }

    const result = await task()
    const requestedIds =
      typeof options?.materializeWorkspaceIds === "function"
        ? options.materializeWorkspaceIds()
        : (options?.materializeWorkspaceIds ?? [])
    const ids = Array.from(new Set(requestedIds))
    try {
      await materializeChangedWorkspaces(ids, options?.preferredWindowId)
    } catch (error) {
      await options?.rollbackOnMaterializeFailure?.()
      throw error
    }
    return result
  })
}

const sameBinding = (
  left: WorkspaceWindowBinding | null | undefined,
  right: WorkspaceWindowBinding
) =>
  !!left &&
  left.workspaceId === right.workspaceId &&
  left.tabsRevision === right.tabsRevision &&
  left.stale === right.stale

export const runWorkspaceWindowOperation = async <T>(
  workspaceId: string,
  preferredWindowId: number | undefined,
  task: (scope: WorkspaceWindowScope) => Promise<T>
) => {
  await initWorkspaceController()
  return workspaceOperationGate.runNormal(async () => {
    const windowId = await resolveNormalWindowId(preferredWindowId)
    const binding = await getWorkspaceWindowBinding(windowId)
    if (!binding || binding.workspaceId !== workspaceId) {
      throw new Error("workspace-window-operation-not-active")
    }
    if (binding.stale) throw new Error("workspace-window-operation-stale")

    const assertStillBound = async () => {
      await assertNormalWindow(windowId)
      const current = await getWorkspaceWindowBinding(windowId)
      if (!sameBinding(current, binding)) {
        throw new Error("workspace-window-operation-binding-changed")
      }
    }
    return task({ windowId, binding, assertStillBound })
  })
}

export const captureWorkspaceWindowNow = (
  workspaceId: string,
  preferredWindowId?: number,
  options?: { skipHistory?: boolean }
) =>
  runWorkspaceWindowOperation(
    workspaceId,
    preferredWindowId,
    async ({ windowId, assertStillBound }) => {
      await assertStillBound()
      const result = await flushWorkspaceWindowAutosave(windowId, options)
      if (result.status === "stale") {
        throw new Error("workspace-window-operation-stale")
      }
    }
  )

export const handleWorkspaceSwitch = async (direction: "prev" | "next") => {
  await initWorkspaceController()
  return workspaceOperationGate.runNormal(async () => {
    const windowId = await resolveNormalWindowId()
    const binding = await getWorkspaceWindowBinding(windowId)
    const settings = await loadSettings()
    const workspaces = await loadWorkspaces()
    await requestAdjacentWorkspaceSwitch({
      direction,
      workspaces,
      activeWorkspaceId: binding?.workspaceId ?? null,
      sortKey: settings.workspaceSort ?? "lastUsed",
      requestSwitch: (workspaceId) =>
        requestCurrentWindowWorkspaceSwitch(workspaceId, {
          preferredWindowId: windowId
        })
    })
  })
}

export const findWorkspaceTabInCurrentWindow = async (
  windowId: number,
  exactUrl: string
) => {
  const tabs = await chrome.tabs.query({ windowId })
  return tabs.find(
    (tab) =>
      typeof tab.id === "number" &&
      !isTabClosing(tab.id) &&
      resolveTabUrl(tab).trim() === exactUrl.trim()
  )
}
