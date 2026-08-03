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
  assertNormalWindow,
  resolveNormalWindowId
} from "./services/workspaceWindowTabs"

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
let maintenanceTail: Promise<void> = Promise.resolve()
let maintenancePending = 0

const isRelevantTabUpdate = (change: chrome.tabs.TabChangeInfo) =>
  change.status === "complete" ||
  !!change.url ||
  !!change.title ||
  !!change.favIconUrl ||
  change.pinned !== undefined

const registerControllerListeners = () => {
  if (listenersRegistered) return
  listenersRegistered = true

  chrome.tabs?.onUpdated?.addListener((_tabId, change, tab) => {
    if (isRelevantTabUpdate(change)) noteWorkspaceWindowMutation(tab.windowId)
  })
  chrome.tabs?.onCreated?.addListener((tab) => {
    noteWorkspaceWindowMutation(tab.windowId)
  })
  chrome.tabs?.onRemoved?.addListener((tabId, info) => {
    unmarkTabClosing(tabId)
    noteWorkspaceWindowMutation(info.windowId)
  })
  chrome.tabs?.onMoved?.addListener((_tabId, info) => {
    noteWorkspaceWindowMutation(info.windowId)
  })
  chrome.tabs?.onDetached?.addListener((_tabId, info) => {
    noteWorkspaceWindowMutation(info.oldWindowId)
  })
  chrome.tabs?.onAttached?.addListener((_tabId, info) => {
    noteWorkspaceWindowMutation(info.newWindowId)
  })
  chrome.windows?.onRemoved?.addListener((windowId) => {
    void removeWorkspaceWindowBinding(windowId)
  })
  chrome.alarms?.onAlarm?.addListener((alarm) => {
    handleWorkspaceSwitchTimeoutAlarm(alarm.name)
  })
}

const waitForMaintenance = async () => {
  while (maintenancePending > 0) await maintenanceTail
}

export const initWorkspaceController = (gate?: Promise<unknown>) => {
  if (gate) startupGate = gate
  registerControllerListeners()
  if (initializationPromise) return initializationPromise

  initializationPromise = startupGate
    .then(async () => {
      await recoverPendingWorkspaceSwitch()
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
  await waitForMaintenance()
  return requestCurrentWindowWorkspaceSwitch(targetId, options)
}

export const abortCurrentSwitch = abortCurrentWorkspaceSwitch

export const discardWorkspaceSwitchRecovery = discardPendingWorkspaceSwitch

export const clearCurrentWindowWorkspace = async (
  preferredWindowId?: number
) => {
  await initWorkspaceController()
  await waitForMaintenance()
  return clearCurrentWindowWorkspaceBinding(preferredWindowId)
}

export const withWorkspaceControllerMaintenance = <T>(
  task: () => Promise<T>
) => {
  maintenancePending += 1
  const run = maintenanceTail.then(async () => {
    await initWorkspaceController()
    await abortCurrentWorkspaceSwitch("maintenance")
    await flushAllWorkspaceWindowAutosaves()
    return task()
  })
  maintenanceTail = run.then(
    () => undefined,
    () => undefined
  )
  return run.finally(() => {
    maintenancePending = Math.max(0, maintenancePending - 1)
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
  await waitForMaintenance()
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
      : options?.materializeWorkspaceIds ?? []
  const ids = Array.from(new Set(requestedIds))
  try {
    await materializeChangedWorkspaces(ids, options?.preferredWindowId)
  } catch (error) {
    await options?.rollbackOnMaterializeFailure?.()
    throw error
  }
  return result
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
  await waitForMaintenance()
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
  await waitForMaintenance()
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
      requestWorkspaceSwitch(workspaceId, { preferredWindowId: windowId })
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
