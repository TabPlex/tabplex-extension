import {
  addLinkedResourceToWorkspace,
  removeLinkedResourceFromWorkspace,
  setWorkspaceLinkedResources,
  setWorkspaceNote,
  setWorkspaceNotePreview
} from "./workspaceContextActions"
import {
  createWorkspace,
  emptyTrash,
  permanentlyDeleteWorkspace,
  recolorWorkspace,
  removeWorkspace,
  renameWorkspace,
  restoreWorkspace,
  setTabExcluded,
  switchTo,
  updateSetting,
  updateWorkspaceEmoji
} from "./workspaceCrudActions"
import {
  ensureActiveWorkspace,
  moveTabsToWorkspace,
  openWorkspaceTab,
  removeTabFromWorkspace,
  removeTabsFromWorkspace,
  restoreSnapshot,
  snapshotWorkspace,
  updateWorkspaceFromCurrent
} from "./workspaceTabActions"

const workspaceActions = Object.freeze({
  createWorkspace,
  switchTo,
  updateSetting,
  renameWorkspace,
  recolorWorkspace,
  updateWorkspaceEmoji,
  setTabExcluded,
  removeWorkspace,
  restoreWorkspace,
  permanentlyDeleteWorkspace,
  emptyTrash,
  setWorkspaceNote,
  setWorkspaceNotePreview,
  setWorkspaceLinkedResources,
  addLinkedResourceToWorkspace,
  removeLinkedResourceFromWorkspace,
  moveTabsToWorkspace,
  removeTabFromWorkspace,
  removeTabsFromWorkspace,
  openWorkspaceTab,
  snapshotWorkspace,
  restoreSnapshot,
  updateWorkspaceFromCurrent,
  ensureActiveWorkspace,
  pickEmoji: () => "📁" as const
})

export const useWorkspaceActions = () => workspaceActions
