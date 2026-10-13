import { canCreateWorkspaceFromQuery } from "~lib/common"

export type PopupNavigationAction =
  { type: "workspace"; workspaceIndex: number } | { type: "create" } | null

export const canCreatePopupWorkspace = canCreateWorkspaceFromQuery

export const getDefaultSearchActionIndex = (
  workspaceCount: number,
  canCreate: boolean
) => (canCreate ? workspaceCount : 0)

export const clampPopupActiveIndex = (
  activeIndex: number,
  actionCount: number
) => {
  if (actionCount <= 0 || activeIndex < 0 || activeIndex >= actionCount)
    return 0
  return activeIndex
}

export const movePopupActiveIndex = (
  activeIndex: number,
  actionCount: number,
  direction: "next" | "previous"
) => {
  if (actionCount <= 0) return 0
  if (direction === "next") {
    return activeIndex >= actionCount - 1 ? 0 : activeIndex + 1
  }
  return activeIndex <= 0 ? actionCount - 1 : activeIndex - 1
}

export const resolvePopupNavigationAction = (
  activeIndex: number,
  workspaceCount: number,
  canCreate: boolean
): PopupNavigationAction => {
  const actionCount = workspaceCount + (canCreate ? 1 : 0)
  if (activeIndex < 0 || activeIndex >= actionCount) return null
  if (activeIndex < workspaceCount) {
    return { type: "workspace", workspaceIndex: activeIndex }
  }
  return canCreate ? { type: "create" } : null
}
