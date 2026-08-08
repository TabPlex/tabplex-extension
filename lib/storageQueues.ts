import {
  loadSettings,
  loadWorkspaces,
  loadWorkspaceState,
  removeWorkspaceBindingsForWorkspace,
  saveSettings,
  saveWorkspaces,
  saveWorkspaceStatePatch
} from "~core/storage"
import type { Settings, Workspace, WorkspaceState } from "~core/types"
import { logWarn } from "~lib/logger"

let globalStorageBarrier: Promise<void> = Promise.resolve()

const enqueue = <T>(
  queueRef: { current: Promise<void> },
  task: () => Promise<T>,
  onError?: (error: unknown) => void
) => {
  const barrier = globalStorageBarrier
  const run = Promise.all([queueRef.current, barrier]).then(task)
  queueRef.current = run.then(
    () => undefined,
    (error) => {
      onError?.(error)
      return undefined
    }
  )
  return run
}

const workspacesQueue = { current: Promise.resolve() }
const workspaceStateQueue = { current: Promise.resolve() }
const settingsQueue = { current: Promise.resolve() }
const auxiliaryStorageQueue = { current: Promise.resolve() }

export const withAuxiliaryStorageWriteLock = <T>(task: () => Promise<T>) =>
  enqueue(auxiliaryStorageQueue, task)

export const withGlobalStorageWriteBarrier = async <T>(
  task: () => Promise<T>
) => {
  const previousBarrier = globalStorageBarrier
  const pendingWrites = [
    workspacesQueue.current,
    workspaceStateQueue.current,
    settingsQueue.current,
    auxiliaryStorageQueue.current
  ]
  let releaseBarrier: () => void = () => undefined
  const hold = new Promise<void>((resolve) => {
    releaseBarrier = resolve
  })
  globalStorageBarrier = previousBarrier.then(() => hold)

  await previousBarrier
  await Promise.all(pendingWrites)
  try {
    return await task()
  } finally {
    releaseBarrier()
  }
}

export const applyWorkspacesUpdate = (
  updater: (current: Workspace[]) => Promise<Workspace[]> | Workspace[]
) =>
  enqueue(workspacesQueue, async () => {
    const current = await loadWorkspaces()
    const next = await updater(current)
    if (next !== current) {
      await saveWorkspaces(next)
    }
    return next
  })

const logWorkspaceStateWriteFailure = (error: unknown) => {
  void logWarn("workspace-state-queue", "工作区状态写入失败", error)
}

export const applyWorkspaceStatePatchWithMerge = (
  patch: Partial<WorkspaceState>
) =>
  enqueue(
    workspaceStateQueue,
    async () => {
      const needsMerge =
        !!patch.notes || !!patch.notePreview || !!patch.linkedResources
      if (!needsMerge) {
        await saveWorkspaceStatePatch(patch)
        return
      }

      const current = await loadWorkspaceState()
      const next: Partial<WorkspaceState> = { ...patch }
      if (patch.notes) {
        next.notes = { ...(current.notes ?? {}), ...patch.notes }
      }
      if (patch.notePreview) {
        next.notePreview = {
          ...(current.notePreview ?? {}),
          ...patch.notePreview
        }
      }
      if (patch.linkedResources) {
        next.linkedResources = {
          ...(current.linkedResources ?? {}),
          ...patch.linkedResources
        }
      }

      await saveWorkspaceStatePatch(next)
    },
    logWorkspaceStateWriteFailure
  )

const removeRecordEntries = <T>(
  record: Record<string, T> | undefined,
  removingIds: Set<string>
) =>
  Object.fromEntries(
    Object.entries(record ?? {}).filter(
      ([workspaceId]) => !removingIds.has(workspaceId)
    )
  ) as Record<string, T>

export const removeWorkspaceStateEntries = async (workspaceIds: string[]) => {
  const removingIds = new Set(
    workspaceIds.filter((workspaceId) => workspaceId.trim().length > 0)
  )
  if (!removingIds.size) return

  await enqueue(
    workspaceStateQueue,
    async () => {
      const current = await loadWorkspaceState()
      await saveWorkspaceStatePatch({
        activeWorkspaceId:
          current.activeWorkspaceId &&
          removingIds.has(current.activeWorkspaceId)
            ? null
            : current.activeWorkspaceId,
        notes: removeRecordEntries(current.notes, removingIds),
        notePreview: removeRecordEntries(current.notePreview, removingIds),
        linkedResources: removeRecordEntries(
          current.linkedResources,
          removingIds
        )
      })
    },
    logWorkspaceStateWriteFailure
  )
  for (const workspaceId of removingIds) {
    await removeWorkspaceBindingsForWorkspace(workspaceId)
  }
}

export const applySettingsUpdate = (
  updater: (current: Settings) => Promise<Settings> | Settings
) =>
  enqueue(settingsQueue, async () => {
    const current = await loadSettings()
    const next = await updater(current)
    await saveSettings(next)
    return next
  })
