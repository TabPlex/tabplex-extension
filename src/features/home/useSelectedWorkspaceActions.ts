import { useCallback, useEffect, useState } from "react"

import type { TabSpec, Workspace } from "~core/types"
import type { useWorkspaceManager } from "~hooks/useWorkspaceManager"

type WorkspaceManager = ReturnType<typeof useWorkspaceManager>

type SelectedWorkspaceActionsInput = {
  selectedId: string | null
  selectedWorkspace: Workspace | null
  workspaceManager: WorkspaceManager
  interactionLocked: boolean
}

export const useSelectedWorkspaceActions = ({
  selectedId,
  selectedWorkspace,
  workspaceManager,
  interactionLocked
}: SelectedWorkspaceActionsInput) => {
  const {
    workspaceState,
    renameWorkspace,
    updateWorkspaceEmoji,
    recolorWorkspace,
    openWorkspaceTab,
    removeTabFromWorkspace
  } = workspaceManager
  const [nameDraft, setNameDraft] = useState("")

  useEffect(() => {
    setNameDraft(selectedWorkspace?.name ?? "")
  }, [selectedWorkspace?.name])

  const handleRename = useCallback(async () => {
    if (!selectedWorkspace) return
    const trimmed = nameDraft.trim()
    if (!trimmed) {
      setNameDraft(selectedWorkspace.name || "")
      return
    }
    if (trimmed !== selectedWorkspace.name) {
      await renameWorkspace(selectedWorkspace.id, trimmed)
    }
  }, [nameDraft, renameWorkspace, selectedWorkspace])

  const handleEmojiSelect = useCallback(
    (emoji: string | null) => {
      if (!selectedId) return
      void updateWorkspaceEmoji(selectedId, emoji || null).catch((error) => {
        console.warn("[TabPlex] Failed to update emoji", error)
      })
    },
    [selectedId, updateWorkspaceEmoji]
  )

  const handleColorSelect = useCallback(
    (color: string | null) => {
      if (!selectedId) return
      void recolorWorkspace(selectedId, color).catch((error) => {
        console.warn("[TabPlex] Failed to update color", error)
      })
    },
    [recolorWorkspace, selectedId]
  )

  const handleOpenTab = useCallback(
    async (tab: TabSpec) => {
      const activeWorkspaceId = workspaceState.activeWorkspaceId
      if (!activeWorkspaceId) return
      try {
        await openWorkspaceTab(activeWorkspaceId, tab)
      } catch (error) {
        console.warn("[TabPlex] Failed to open tab", error)
      }
    },
    [openWorkspaceTab, workspaceState.activeWorkspaceId]
  )

  const handleRemoveTab = useCallback(
    async (tab: TabSpec, index: number) => {
      if (
        interactionLocked ||
        !selectedId ||
        !tab.url ||
        !Number.isInteger(index)
      ) {
        return
      }
      try {
        await removeTabFromWorkspace(selectedId, index)
      } catch (error) {
        console.warn("[TabPlex] Failed to remove tab", error)
      }
    },
    [interactionLocked, removeTabFromWorkspace, selectedId]
  )

  return {
    nameDraft,
    setNameDraft,
    handleRename,
    handleEmojiSelect,
    handleColorSelect,
    handleOpenTab,
    handleRemoveTab
  }
}
