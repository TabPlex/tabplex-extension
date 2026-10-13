import type { Workspace } from "~core/types"

export type WorkspaceRollbackEntry = {
  before: Workspace
  after: Workspace
}

export const captureWorkspaceRollbackEntries = (
  before: Workspace[],
  after: Workspace[],
  workspaceIds: string[]
): WorkspaceRollbackEntry[] =>
  Array.from(new Set(workspaceIds)).flatMap((id) => {
    const previous = before.find((workspace) => workspace.id === id)
    const next = after.find((workspace) => workspace.id === id)
    return previous && next && previous !== next
      ? [{ before: structuredClone(previous), after: structuredClone(next) }]
      : []
  })

const stillOwnsTabState = (current: Workspace | undefined, after: Workspace) =>
  !!current &&
  (current.tabsRevision ?? 0) === (after.tabsRevision ?? 0) &&
  JSON.stringify(current.tabs) === JSON.stringify(after.tabs) &&
  JSON.stringify(current.history) === JSON.stringify(after.history)

export const restoreWorkspaceRollbackEntries = (
  current: Workspace[],
  entries: WorkspaceRollbackEntry[]
): Workspace[] => {
  if (!entries.length) return current
  const byId = new Map(current.map((workspace) => [workspace.id, workspace]))
  // A move changes two workspaces. Roll back both or neither; restoring only
  // one side could lose or duplicate tabs after a newer edit.
  if (
    entries.some(({ after }) => !stillOwnsTabState(byId.get(after.id), after))
  ) {
    return current
  }

  const beforeById = new Map(entries.map(({ before }) => [before.id, before]))
  return current.map((workspace) => {
    const before = beforeById.get(workspace.id)
    if (!before) return workspace
    return {
      ...workspace,
      tabs: structuredClone(before.tabs),
      history: structuredClone(before.history),
      // Restoring old content is a new write, not a return to an old revision.
      tabsRevision: (workspace.tabsRevision ?? 0) + 1,
      updatedAt: Date.now()
    }
  })
}
