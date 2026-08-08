import { getWorkspaceWindowBinding, loadWorkspaces } from "~core/storage"
import type { TabSpec } from "~core/types"

import {
  getCurrentNormalWindowId,
  requestWorkspacesApply,
  requestWorkspaceSwitch,
  requestWorkspaceWindowOperation
} from "./workspaceActionRequests"

export const moveTabsToWorkspace = async (
  sourceId: string,
  targetId: string,
  tabIndexes: number[]
) => {
  const response = await requestWorkspacesApply({
    kind: "move-tabs",
    sourceId,
    targetId,
    tabIndexes
  })
  return (response.result as boolean | undefined) ?? false
}

export const removeTabFromWorkspace = (
  workspaceId: string,
  tabIndexOrUrl: number | string
) =>
  requestWorkspacesApply({
    kind: "remove-tab",
    workspaceId,
    tabIndexOrUrl
  }).then(() => undefined)

export const removeTabsFromWorkspace = (
  workspaceId: string,
  tabIndexes: number[]
) =>
  requestWorkspacesApply({
    kind: "remove-tab-indexes",
    workspaceId,
    tabIndexes
  }).then(() => undefined)

export const openWorkspaceTab = (workspaceId: string, tab: TabSpec) =>
  requestWorkspaceWindowOperation({
    operation: "open-tab",
    workspaceId,
    tab
  }).then(() => undefined)

export const snapshotWorkspace = async (workspaceId: string) => {
  const response = await requestWorkspacesApply({
    kind: "snapshot",
    workspaceId
  })
  return (response.result as boolean | undefined) ?? true
}

export const restoreSnapshot = async (
  workspaceId: string,
  snapshotId: string
) => {
  const response = await requestWorkspacesApply({
    kind: "restore-snapshot",
    workspaceId,
    snapshotId
  })
  return (response.result as boolean | undefined) ?? false
}

export const updateWorkspaceFromCurrent = async (
  id?: string,
  options?: { skipHistory?: boolean }
) => {
  const windowId = await getCurrentNormalWindowId()
  const binding =
    id || typeof windowId !== "number"
      ? null
      : await getWorkspaceWindowBinding(windowId)
  const workspaceId = id ?? binding?.workspaceId
  if (!workspaceId) return
  await requestWorkspaceWindowOperation(
    {
      operation: "capture-tabs",
      workspaceId,
      skipHistory: options?.skipHistory === true
    },
    windowId
  )
}

export const ensureActiveWorkspace = async (id?: string) => {
  const windowId = await getCurrentNormalWindowId()
  const binding =
    typeof windowId === "number"
      ? await getWorkspaceWindowBinding(windowId)
      : null
  if (id) {
    if (binding?.workspaceId !== id) {
      await requestWorkspaceSwitch(id, windowId)
    }
    return
  }
  if (binding?.workspaceId) return

  const firstWorkspace = (await loadWorkspaces())[0]
  if (firstWorkspace) await requestWorkspaceSwitch(firstWorkspace.id, windowId)
}
