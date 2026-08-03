import { useState } from "react"

import type { TabSpec } from "~core/types"
import { useLocalStorageUsage } from "~features/settings/hooks/useLocalStorageUsage"
import { useWorkspaceManager } from "~hooks/useWorkspaceManager"
import { useWorkspaceSwitching } from "~hooks/useWorkspaceSwitching"

import { useDragAndDrop } from "./useDragAndDrop"
import { useHomeNotice } from "./useHomeNotice"
import { useHomeOverlayState } from "./useHomeOverlayState"
import { useHomeWorkspaceLifecycle } from "./useHomeWorkspaceLifecycle"
import { useNoteLogic } from "./useNoteLogic"
import { useOnboarding } from "./useOnboarding"
import { useSelectedWorkspaceActions } from "./useSelectedWorkspaceActions"
import { useWorkspaceSearchProjection } from "./useWorkspaceSearchProjection"
import { useWorkspaceSelection } from "./useWorkspaceSelection"

export type HomeViewModel = ReturnType<typeof useHomeViewModel>

const EMPTY_TABS: TabSpec[] = []

export const useHomeViewModel = () => {
  const workspaceManager = useWorkspaceManager()
  const switching = useWorkspaceSwitching()
  const storageUsage = useLocalStorageUsage()
  const onboarding = useOnboarding(workspaceManager)
  const overlays = useHomeOverlayState()
  const notices = useHomeNotice()
  const [query, setQuery] = useState("")

  const selection = useWorkspaceSelection({
    workspaces: workspaceManager.sortedWorkspaces,
    activeWorkspaceId: workspaceManager.workspaceState.activeWorkspaceId,
    guideWorkspaceId: onboarding.state?.guideWorkspaceId,
    onboardingDismissed: onboarding.state?.dismissed
  })
  const search = useWorkspaceSearchProjection({
    query,
    workspaces: workspaceManager.sortedWorkspaces,
    settings: workspaceManager.settings,
    workspaceState: workspaceManager.workspaceState
  })
  const lifecycle = useHomeWorkspaceLifecycle({
    workspaceManager,
    query,
    setQuery,
    selectedId: selection.selectedId,
    setSelectedId: selection.setSelectedId,
    setFollowActive: selection.setFollowActive,
    cancelPreview: selection.cancelPreview,
    switchActive: switching.isSwitching,
    guideWorkspaceId: onboarding.state?.guideWorkspaceId,
    showWorkspaceTrashed: notices.showWorkspaceTrashed
  })
  const selectedActions = useSelectedWorkspaceActions({
    selectedId: selection.selectedId,
    selectedWorkspace: selection.selectedWorkspace,
    workspaceManager,
    interactionLocked: lifecycle.switchLocked
  })
  const note = useNoteLogic(selection.selectedId, workspaceManager)
  const dnd = useDragAndDrop(selection.selectedWorkspace, workspaceManager, {
    disabled: lifecycle.switchLocked
  })
  const visibleTabs = selection.selectedWorkspace?.tabs ?? EMPTY_TABS

  return {
    viewState: {
      query,
      selectedId: selection.selectedId,
      nameDraft: selectedActions.nameDraft,
      noteDraft: note.noteDraft,
      ...overlays.state,
      trashPending: lifecycle.trashPending,
      createPending: lifecycle.createPending,
      interactionLocked: lifecycle.switchLocked,
      ...search,
      selectedWorkspace: selection.selectedWorkspace,
      visibleTabs,
      onboarding: onboarding.state,
      notice: notices.notice
    },
    actions: {
      setQuery,
      setSelectedId: selection.setSelectedId,
      setNameDraft: selectedActions.setNameDraft,
      handleNoteChange: note.handleNoteChange,
      flushPendingNotes: note.flushPendingNotes,
      ...overlays.actions,
      quickCreate: lifecycle.quickCreate,
      createEmptyWorkspace: lifecycle.createEmptyWorkspace,
      updateSetting: workspaceManager.updateSetting,
      handleRename: selectedActions.handleRename,
      handleDelete: lifecycle.handleDelete,
      showTimelineRestoreNotice: notices.showTimelineRestore,
      handleEmojiSelect: selectedActions.handleEmojiSelect,
      handleColorSelect: selectedActions.handleColorSelect,
      handleSwitch: lifecycle.handleSwitch,
      handlePreview: selection.handlePreview,
      handleSidebarLeave: selection.handleSidebarLeave,
      handleDetailEnter: selection.handleDetailEnter,
      handleDetailLeave: selection.handleDetailLeave,
      handleOpenTab: selectedActions.handleOpenTab,
      handleRemoveTab: selectedActions.handleRemoveTab,
      handleOpenGuideWorkspace: lifecycle.handleOpenGuideWorkspace,
      dismissOnboarding: onboarding.dismiss
    },
    dnd,
    data: {
      workspaceManager,
      localStorageBytes: storageUsage.bytes
    }
  }
}
