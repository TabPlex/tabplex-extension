import { loadWorkspaces, loadWorkspaceState } from "~core/storage"
import { STORAGE_KEYS, type Workspace } from "~core/types"
import { withWorkspacesWriteLock } from "~lib/storageQueues"

type WorkspaceOperation = Record<string, unknown>

type SwitchReservation = {
  release: () => void
}

const reservationsByWorkspace = new Map<string, Set<symbol>>()

const reserveWorkspaceIds = (workspaceIds: string[]) => {
  const token = Symbol("workspace-switch-reservation")
  for (const workspaceId of workspaceIds) {
    const tokens = reservationsByWorkspace.get(workspaceId) ?? new Set()
    tokens.add(token)
    reservationsByWorkspace.set(workspaceId, tokens)
  }

  let released = false
  return () => {
    if (released) return
    released = true
    for (const workspaceId of workspaceIds) {
      const tokens = reservationsByWorkspace.get(workspaceId)
      tokens?.delete(token)
      if (!tokens?.size) reservationsByWorkspace.delete(workspaceId)
    }
  }
}

export const reserveWorkspaceSwitchTargets = (options: {
  sourceId?: string | null
  targetId: string
}): Promise<SwitchReservation> =>
  withWorkspacesWriteLock(async () => {
    const workspaces = await loadWorkspaces()
    const target = workspaces.find(
      (workspace) => workspace.id === options.targetId && !workspace.trashedAt
    )
    if (!target) throw new Error("workspace_not_found")

    const workspaceIds = Array.from(
      new Set([target.id, options.sourceId].filter((id): id is string => !!id))
    )
    return {
      release: reserveWorkspaceIds(workspaceIds)
    }
  })

const readWarmupWorkspaceIds = async () => {
  if (typeof chrome === "undefined" || !chrome.storage?.session) {
    return [] as string[]
  }
  const result = await chrome.storage.session.get(
    STORAGE_KEYS.WORKSPACE_TAB_WARMUP_JOBS
  )
  const raw = result[STORAGE_KEYS.WORKSPACE_TAB_WARMUP_JOBS]
  if (!raw || typeof raw !== "object") return [] as string[]

  return Object.values(raw as Record<string, unknown>).flatMap((value) => {
    if (!value || typeof value !== "object") return []
    const workspaceId = (value as { workspaceId?: unknown }).workspaceId
    return typeof workspaceId === "string" && workspaceId ? [workspaceId] : []
  })
}

const loadBusyWorkspaceIds = async () => {
  const busyIds = new Set(reservationsByWorkspace.keys())
  const [workspaceState, warmupWorkspaceIds] = await Promise.all([
    loadWorkspaceState(),
    readWarmupWorkspaceIds()
  ])
  const switchState = workspaceState.switchState
  if (switchState?.targetId) busyIds.add(switchState.targetId)
  if (switchState?.sourceId) busyIds.add(switchState.sourceId)
  for (const workspaceId of warmupWorkspaceIds) busyIds.add(workspaceId)
  return busyIds
}

const stringField = (operation: WorkspaceOperation, key: string) => {
  const value = operation[key]
  return typeof value === "string" && value ? value : null
}

const getDeletedWorkspaceIds = (
  workspaces: Workspace[],
  operation: WorkspaceOperation
) => {
  switch (operation.kind) {
    case "remove":
    case "trash":
    case "delete": {
      const id = stringField(operation, "id")
      return id ? [id] : []
    }
    case "empty-trash":
      return workspaces
        .filter((workspace) => !!workspace.trashedAt)
        .map((workspace) => workspace.id)
    case "remove-tab":
    case "remove-tab-indexes": {
      const workspaceId = stringField(operation, "workspaceId")
      return workspaceId ? [workspaceId] : []
    }
    default:
      return []
  }
}

export const assertWorkspaceDeletionAllowed = async (
  workspaces: Workspace[],
  operation: WorkspaceOperation
) => {
  const deletingIds = getDeletedWorkspaceIds(workspaces, operation)
  if (!deletingIds.length) return
  const busyIds = await loadBusyWorkspaceIds()
  if (deletingIds.some((workspaceId) => busyIds.has(workspaceId))) {
    throw new Error("workspace-delete-busy")
  }
}

export const resetWorkspaceBusyRuntime = () => {
  reservationsByWorkspace.clear()
}
