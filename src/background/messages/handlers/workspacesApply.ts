import type { TabSpec, Workspace } from "~core/types"
import {
  applyTabExclusion,
  hasStructuralTabChanges,
  recordSnapshot,
  sanitizeTabSpecs,
  sanitizeWorkspace
} from "~features/workspace/logic/workspaceLogic"
import {
  appendWorkspaceTabs,
  extractMovableWorkspaceTabs,
  getWorkspaceTabs,
  removeWorkspaceTab as removeTabFromWorkspace,
  replaceWorkspaceTabs,
  restoreWorkspaceTabsFromSnapshot
} from "~features/workspace/logic/workspaceTabState"
import { removeWorkspaceStateEntries } from "~lib/storageQueues"
import { applyWorkspacesUpdate } from "~lib/workspacesQueue"

import { runWorkspaceDataOperation } from "../../workspaceController"
import type { BackgroundMessageHandler } from "../types"
import { parsePreferredWindowId } from "./preferredWindowId"
import { runAsyncMessage } from "./utils"

type WorkspaceOp = Record<string, unknown>

type ApplyContext = {
  result: unknown
  deletedWorkspaceIds: Set<string>
}

type WorkspaceUpdater = (
  current: Workspace[],
  op: WorkspaceOp,
  now: number,
  context: ApplyContext
) => Workspace[]

const createWorkspace = (
  current: Workspace[],
  op: WorkspaceOp,
  _now: number,
  context: ApplyContext
) => {
  const rawWorkspace = op.workspace
  if (
    !rawWorkspace ||
    typeof rawWorkspace !== "object" ||
    Array.isArray(rawWorkspace)
  ) {
    throw new Error("invalid-workspace")
  }

  const workspace = rawWorkspace as Workspace
  if (
    typeof workspace.id !== "string" ||
    typeof workspace.name !== "string" ||
    typeof workspace.createdAt !== "number"
  ) {
    throw new Error("invalid-workspace")
  }

  const sanitized = sanitizeWorkspace(workspace)
  context.result = sanitized
  const withoutDup = current.filter((item) => item.id !== sanitized.id)
  return [sanitized, ...withoutDup]
}

const renameWorkspace = (
  current: Workspace[],
  op: WorkspaceOp,
  now: number
) => {
  const id = typeof op.id === "string" ? op.id : null
  const name = typeof op.name === "string" ? op.name : null
  if (!id || !name) throw new Error("invalid-rename")

  const index = current.findIndex((item) => item.id === id)
  if (index === -1) return current

  const next = [...current]
  next[index] = { ...next[index], name, updatedAt: now }
  return next
}

const recolorWorkspace = (
  current: Workspace[],
  op: WorkspaceOp,
  now: number
) => {
  const id = typeof op.id === "string" ? op.id : null
  const color =
    typeof op.color === "string" || op.color === null
      ? (op.color as string | null)
      : undefined
  if (!id || color === undefined) throw new Error("invalid-recolor")

  const index = current.findIndex((item) => item.id === id)
  if (index === -1) return current

  const next = [...current]
  next[index] = { ...next[index], color, updatedAt: now }
  return next
}

const updateWorkspaceEmoji = (
  current: Workspace[],
  op: WorkspaceOp,
  now: number
) => {
  const id = typeof op.id === "string" ? op.id : null
  const emoji =
    typeof op.emoji === "string" || op.emoji === null
      ? (op.emoji as string | null)
      : undefined
  if (!id || emoji === undefined) throw new Error("invalid-emoji")

  const index = current.findIndex((item) => item.id === id)
  if (index === -1) return current

  const next = [...current]
  next[index] = {
    ...next[index],
    emoji: emoji ?? undefined,
    updatedAt: now
  }
  return next
}

const excludeWorkspaceTab = (
  current: Workspace[],
  op: WorkspaceOp,
  now: number
) => {
  const workspaceId = typeof op.workspaceId === "string" ? op.workspaceId : null
  const tabIndexOrUrl =
    typeof op.tabIndexOrUrl === "number" || typeof op.tabIndexOrUrl === "string"
      ? (op.tabIndexOrUrl as number | string)
      : null
  const excluded = typeof op.excluded === "boolean" ? op.excluded : null
  if (!workspaceId || tabIndexOrUrl === null || excluded === null) {
    return current
  }

  const index = current.findIndex((item) => item.id === workspaceId)
  if (index === -1) return current

  const updatedWorkspace = applyTabExclusion(
    current[index],
    tabIndexOrUrl,
    excluded
  )
  if (updatedWorkspace === current[index]) return current

  const next = [...current]
  next[index] = {
    ...updatedWorkspace,
    tabsRevision: (current[index].tabsRevision ?? 0) + 1,
    updatedAt: now
  }
  return next
}

const removeWorkspace = (
  current: Workspace[],
  op: WorkspaceOp,
  now: number,
  context: ApplyContext
) => {
  const id = typeof op.id === "string" ? op.id : null
  if (!id) throw new Error("invalid-remove")

  const index = current.findIndex((item) => item.id === id)
  if (index === -1) return current

  const tabCount = getWorkspaceTabs(current[index]).length
  if (tabCount === 0) {
    context.deletedWorkspaceIds.add(id)
    return current.filter((item) => item.id !== id)
  }

  const next = [...current]
  next[index] = {
    ...next[index],
    trashedAt: now,
    updatedAt: now
  }
  return next
}

const trashWorkspace = (current: Workspace[], op: WorkspaceOp, now: number) => {
  const id = typeof op.id === "string" ? op.id : null
  if (!id) throw new Error("invalid-trash")

  const index = current.findIndex((item) => item.id === id)
  if (index === -1) return current

  const next = [...current]
  next[index] = {
    ...next[index],
    trashedAt: now,
    updatedAt: now
  }
  return next
}

const restoreWorkspace = (
  current: Workspace[],
  op: WorkspaceOp,
  now: number,
  context: ApplyContext
) => {
  const id = typeof op.id === "string" ? op.id : null
  if (!id) throw new Error("invalid-restore")

  const index = current.findIndex((item) => item.id === id)
  if (index === -1) {
    context.result = false
    return current
  }

  const next = [...current]
  next[index] = { ...next[index], trashedAt: undefined, updatedAt: now }
  context.result = true
  return next
}

const deleteWorkspace = (
  current: Workspace[],
  op: WorkspaceOp,
  _now: number,
  context: ApplyContext
) => {
  const id = typeof op.id === "string" ? op.id : null
  if (!id) throw new Error("invalid-delete")
  if (current.some((item) => item.id === id)) {
    context.deletedWorkspaceIds.add(id)
  }
  return current.filter((item) => item.id !== id)
}

const emptyTrash = (
  current: Workspace[],
  _op: WorkspaceOp,
  _now: number,
  context: ApplyContext
) => {
  for (const workspace of current) {
    if (workspace.trashedAt) context.deletedWorkspaceIds.add(workspace.id)
  }
  return current.filter((item) => !item.trashedAt)
}

const moveWorkspaceTabs = (
  current: Workspace[],
  op: WorkspaceOp,
  now: number,
  context: ApplyContext
) => {
  const sourceId = typeof op.sourceId === "string" ? op.sourceId : null
  const targetId = typeof op.targetId === "string" ? op.targetId : null
  const tabIndexes = Array.isArray(op.tabIndexes)
    ? (op.tabIndexes as unknown[]).filter(
        (value): value is number => typeof value === "number"
      )
    : null

  if (!sourceId || !targetId || sourceId === targetId || !tabIndexes) {
    context.result = false
    return current
  }

  const sourceIndex = current.findIndex((item) => item.id === sourceId)
  const targetIndex = current.findIndex((item) => item.id === targetId)
  if (sourceIndex === -1 || targetIndex === -1) {
    context.result = false
    return current
  }

  const sourceTabs = getWorkspaceTabs(current[sourceIndex])
  const targetTabs = getWorkspaceTabs(current[targetIndex])
  const { movingTabs, workspace: nextSourceWorkspace } =
    extractMovableWorkspaceTabs(current[sourceIndex], tabIndexes)
  if (!movingTabs.length) {
    context.result = false
    return current
  }

  const next = [...current]
  const sourceWithHistory = recordSnapshot(nextSourceWorkspace, sourceTabs)
  next[sourceIndex] = {
    ...sourceWithHistory,
    tabsRevision: (current[sourceIndex].tabsRevision ?? 0) + 1,
    updatedAt: now
  }

  const targetWithMovedTabs = appendWorkspaceTabs(next[targetIndex], movingTabs)
  const targetWithHistory = recordSnapshot(targetWithMovedTabs, targetTabs)
  next[targetIndex] = {
    ...targetWithHistory,
    tabsRevision: (current[targetIndex].tabsRevision ?? 0) + 1,
    updatedAt: now
  }

  context.result = true
  return next
}

const removeWorkspaceTab = (
  current: Workspace[],
  op: WorkspaceOp,
  now: number
) => {
  const workspaceId = typeof op.workspaceId === "string" ? op.workspaceId : null
  const tabIndexOrUrl =
    typeof op.tabIndexOrUrl === "number" || typeof op.tabIndexOrUrl === "string"
      ? (op.tabIndexOrUrl as number | string)
      : null
  if (!workspaceId || tabIndexOrUrl === null) return current

  const index = current.findIndex((item) => item.id === workspaceId)
  if (index === -1) return current

  const next = [...current]
  const currentWorkspace = next[index]
  const currentTabs = getWorkspaceTabs(currentWorkspace)
  const mutation = removeTabFromWorkspace(currentWorkspace, tabIndexOrUrl)
  if (!mutation.changed) return current
  const workspaceWithHistory = recordSnapshot(mutation.workspace, currentTabs)

  next[index] = {
    ...workspaceWithHistory,
    tabsRevision: (currentWorkspace.tabsRevision ?? 0) + 1,
    updatedAt: now
  }
  return next
}

const removeWorkspaceTabIndexes = (
  current: Workspace[],
  op: WorkspaceOp,
  now: number
) => {
  const workspaceId = typeof op.workspaceId === "string" ? op.workspaceId : null
  const tabIndexes = Array.isArray(op.tabIndexes)
    ? (op.tabIndexes as unknown[]).filter(
        (value): value is number => typeof value === "number"
      )
    : null
  if (!workspaceId || !tabIndexes) return current

  const index = current.findIndex((item) => item.id === workspaceId)
  if (index === -1) return current

  const next = [...current]
  const currentWorkspace = next[index]
  const currentTabs = getWorkspaceTabs(currentWorkspace)
  const mutation = extractMovableWorkspaceTabs(currentWorkspace, tabIndexes)
  if (!mutation.movingTabs.length) return current
  const workspaceWithHistory = recordSnapshot(mutation.workspace, currentTabs)

  next[index] = {
    ...workspaceWithHistory,
    tabsRevision: (currentWorkspace.tabsRevision ?? 0) + 1,
    updatedAt: now
  }
  return next
}

const restoreWorkspaceSnapshot = (
  current: Workspace[],
  op: WorkspaceOp,
  now: number,
  context: ApplyContext
) => {
  const workspaceId = typeof op.workspaceId === "string" ? op.workspaceId : null
  const snapshotId = typeof op.snapshotId === "string" ? op.snapshotId : null
  if (!workspaceId || !snapshotId) {
    context.result = false
    return current
  }

  const workspaceIndex = current.findIndex((item) => item.id === workspaceId)
  if (workspaceIndex === -1) {
    context.result = false
    return current
  }

  const workspace = current[workspaceIndex]
  const snapshot = workspace.history?.find((entry) => entry.id === snapshotId)
  if (!snapshot) {
    context.result = false
    return current
  }

  const restoredWorkspace = restoreWorkspaceTabsFromSnapshot(
    workspace,
    snapshot.tabs ?? []
  )
  if ((restoredWorkspace.tabsRevision ?? 0) === (workspace.tabsRevision ?? 0)) {
    context.result = true
    return current
  }

  const currentTabs = getWorkspaceTabs(workspace)
  const workspaceWithRecoveryPoint = recordSnapshot(workspace, currentTabs)
  const restoredWorkspaceWithRecoveryPoint = restoreWorkspaceTabsFromSnapshot(
    workspaceWithRecoveryPoint,
    snapshot.tabs ?? []
  )
  const next = [...current]
  next[workspaceIndex] = {
    ...restoredWorkspaceWithRecoveryPoint,
    tabsRevision: (workspace.tabsRevision ?? 0) + 1,
    updatedAt: now
  }

  context.result = true
  return next
}

const snapshotWorkspace = (
  current: Workspace[],
  op: WorkspaceOp,
  now: number,
  context: ApplyContext
) => {
  const workspaceId = typeof op.workspaceId === "string" ? op.workspaceId : null
  if (!workspaceId) {
    context.result = false
    return current
  }

  const workspaceIndex = current.findIndex((item) => item.id === workspaceId)
  if (workspaceIndex === -1) {
    context.result = false
    return current
  }

  const next = [...current]
  const currentWorkspace = next[workspaceIndex]
  const currentTabs = getWorkspaceTabs(currentWorkspace)
  const workspaceWithSnapshot = recordSnapshot(currentWorkspace, currentTabs)
  next[workspaceIndex] = {
    ...workspaceWithSnapshot,
    updatedAt: now
  }

  context.result = true
  return next
}

const setWorkspaceTabs = (
  current: Workspace[],
  op: WorkspaceOp,
  now: number
) => {
  const workspaceId = typeof op.workspaceId === "string" ? op.workspaceId : null
  const tabs = Array.isArray(op.tabs) ? (op.tabs as TabSpec[]) : null
  const skipHistory = op.skipHistory === true
  if (!workspaceId || !tabs) return current

  const index = current.findIndex((item) => item.id === workspaceId)
  if (index === -1) return current

  const sanitizedTabs = sanitizeTabSpecs(tabs)
  const next = [...current]
  const previousTabs = getWorkspaceTabs(next[index])
  const nextWorkspace = replaceWorkspaceTabs(next[index], sanitizedTabs)
  if ((nextWorkspace.tabsRevision ?? 0) === (next[index].tabsRevision ?? 0)) {
    return current
  }
  const shouldRecord =
    !skipHistory &&
    hasStructuralTabChanges(previousTabs, nextWorkspace.tabs ?? [])
  const baseWorkspace = shouldRecord
    ? recordSnapshot(nextWorkspace, previousTabs)
    : nextWorkspace

  next[index] = {
    ...baseWorkspace,
    tabsRevision: nextWorkspace.tabsRevision,
    updatedAt: now
  }
  return next
}

const updaters: Record<string, WorkspaceUpdater> = {
  create: createWorkspace,
  rename: renameWorkspace,
  recolor: recolorWorkspace,
  emoji: updateWorkspaceEmoji,
  "exclude-tab": excludeWorkspaceTab,
  remove: removeWorkspace,
  trash: trashWorkspace,
  restore: restoreWorkspace,
  delete: deleteWorkspace,
  "empty-trash": emptyTrash,
  "move-tabs": moveWorkspaceTabs,
  "remove-tab": removeWorkspaceTab,
  "remove-tab-indexes": removeWorkspaceTabIndexes,
  "restore-snapshot": restoreWorkspaceSnapshot,
  snapshot: snapshotWorkspace,
  "set-tabs": setWorkspaceTabs
}

const applyWorkspaceOperation = (
  current: Workspace[],
  op: WorkspaceOp,
  context: ApplyContext
) => {
  const kind = op.kind
  if (typeof kind !== "string") {
    throw new Error("invalid-workspaces-op")
  }

  const update = updaters[kind]
  if (!update) {
    throw new Error("unknown-workspaces-op")
  }

  return update(current, op, Date.now(), context)
}

const getMaterializedWorkspaceIds = (op: WorkspaceOp) => {
  if (op.kind === "move-tabs") {
    return [op.sourceId, op.targetId].filter(
      (value): value is string => typeof value === "string"
    )
  }
  if (
    op.kind === "remove-tab" ||
    op.kind === "remove-tab-indexes" ||
    op.kind === "restore-snapshot" ||
    op.kind === "set-tabs"
  ) {
    return typeof op.workspaceId === "string" ? [op.workspaceId] : []
  }
  return []
}

type WorkspaceRollbackEntry = {
  id: string
  index: number
  workspace: Workspace | null
}

const captureWorkspaceRollbackEntries = (
  current: Workspace[],
  workspaceIds: string[]
): WorkspaceRollbackEntry[] =>
  Array.from(new Set(workspaceIds)).map((id) => {
    const index = current.findIndex((workspace) => workspace.id === id)
    return {
      id,
      index,
      workspace: index >= 0 ? structuredClone(current[index]) : null
    }
  })

const restoreWorkspaceRollbackEntries = (
  current: Workspace[],
  entries: WorkspaceRollbackEntry[]
) => {
  const affectedIds = new Set(entries.map((entry) => entry.id))
  const next = current.filter((workspace) => !affectedIds.has(workspace.id))
  for (const entry of [...entries].sort(
    (left, right) => left.index - right.index
  )) {
    if (!entry.workspace) continue
    const insertAt = Math.min(Math.max(entry.index, 0), next.length)
    next.splice(insertAt, 0, structuredClone(entry.workspace))
  }
  return next
}

export const handleWorkspacesApplyMessage: BackgroundMessageHandler = (
  message,
  sendResponse
) => {
  const rawOp = message.op
  if (!rawOp || typeof rawOp !== "object" || Array.isArray(rawOp)) {
    sendResponse({ ok: false, error: "invalid-workspaces-op" })
    return true
  }

  const op = rawOp as WorkspaceOp
  const preferredWindow = parsePreferredWindowId(message.preferredWindowId)
  if (!preferredWindow.ok) {
    sendResponse({ ok: false, error: "invalid-workspace-window-id" })
    return true
  }

  return runAsyncMessage(
    "workspaces-apply",
    sendResponse,
    async () => {
      const materializedWorkspaceIds = getMaterializedWorkspaceIds(op)
      const changedMaterializedWorkspaceIds = new Set<string>()
      let rollbackEntries: WorkspaceRollbackEntry[] = []
      return runWorkspaceDataOperation(
        async () => {
          const context: ApplyContext = {
            result: undefined,
            deletedWorkspaceIds: new Set()
          }
          await applyWorkspacesUpdate((current) => {
            rollbackEntries = captureWorkspaceRollbackEntries(
              current,
              materializedWorkspaceIds
            )
            const next = applyWorkspaceOperation(current, op, context)
            for (const workspaceId of materializedWorkspaceIds) {
              if (
                current.find((workspace) => workspace.id === workspaceId) !==
                next.find((workspace) => workspace.id === workspaceId)
              ) {
                changedMaterializedWorkspaceIds.add(workspaceId)
              }
            }
            return next
          })
          if (context.deletedWorkspaceIds.size > 0) {
            await removeWorkspaceStateEntries([...context.deletedWorkspaceIds])
          }
          return context.result
        },
        {
          materializeWorkspaceIds: () => [...changedMaterializedWorkspaceIds],
          preferredWindowId: preferredWindow.value,
          // Creating a new record does not mutate the currently bound
          // workspace. Its optional activation switch owns source capture and
          // already tolerates transient loading/capture races.
          flushPreferredWindowAutosave: op.kind !== "create",
          rollbackOnMaterializeFailure: async () => {
            if (!rollbackEntries.length) return
            await applyWorkspacesUpdate((current) =>
              restoreWorkspaceRollbackEntries(current, rollbackEntries)
            )
          }
        }
      )
    },
    {
      onSuccess: (result) => ({ ok: true, result }),
      fallbackError: "workspaces-apply failed"
    }
  )
}
