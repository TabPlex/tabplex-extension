import type { Workspace } from "~core/types"
import { groupWorkspacesByRecency } from "~shared/logic"

type WorkspaceSortKey = "lastUsed" | "created"
type WorkspaceSwitchDirection = "prev" | "next"

const getAdjacentWorkspaceId = ({
  direction,
  workspaces,
  activeWorkspaceId,
  sortKey
}: {
  direction: WorkspaceSwitchDirection
  workspaces: Workspace[]
  activeWorkspaceId?: string | null
  sortKey: WorkspaceSortKey
}) => {
  const liveWorkspaces = workspaces.filter((workspace) => !workspace.trashedAt)
  const ordered = groupWorkspacesByRecency(liveWorkspaces, sortKey).flatMap(
    (group) => group.items
  )
  if (!ordered.length) return null

  const currentIndex = ordered.findIndex(
    (workspace) => workspace.id === activeWorkspaceId
  )
  if (currentIndex === -1) return ordered[0]?.id ?? null

  const offset = direction === "next" ? 1 : -1
  const nextIndex = (currentIndex + offset + ordered.length) % ordered.length
  const targetId = ordered[nextIndex]?.id ?? null
  return targetId && targetId !== activeWorkspaceId ? targetId : null
}

export const requestAdjacentWorkspaceSwitch = async <T>({
  direction,
  workspaces,
  activeWorkspaceId,
  sortKey,
  requestSwitch
}: {
  direction: WorkspaceSwitchDirection
  workspaces: Workspace[]
  activeWorkspaceId?: string | null
  sortKey: WorkspaceSortKey
  requestSwitch: (workspaceId: string) => Promise<T>
}): Promise<T | null> => {
  const targetId = getAdjacentWorkspaceId({
    direction,
    workspaces,
    activeWorkspaceId,
    sortKey
  })
  if (!targetId) return null

  return requestSwitch(targetId)
}
