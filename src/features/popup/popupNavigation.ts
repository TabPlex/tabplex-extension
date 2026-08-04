import type { Workspace } from "~core/types"

type NamedWorkspace = Pick<Workspace, "name">

export type PopupNavigationAction =
  { type: "workspace"; workspaceIndex: number } | { type: "create" } | null

const normalizeWorkspaceName = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim()

export const canCreatePopupWorkspace = (
  workspaces: NamedWorkspace[],
  query: string
) => {
  const normalizedQuery = normalizeWorkspaceName(query)
  if (!normalizedQuery) return false
  return !workspaces.some(
    (workspace) => normalizeWorkspaceName(workspace.name) === normalizedQuery
  )
}

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
