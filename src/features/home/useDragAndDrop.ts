import { useCallback, useEffect, useRef, useState, type DragEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import type { Workspace } from "~core/types"
import type { useWorkspaceManager } from "~hooks/useWorkspaceManager"

import { setCompactTabDragImage } from "./dragPreview"
import {
  showWorkspaceFeedbackToast,
  type WorkspaceFeedback
} from "./workspaceFeedback"

type TabSelectionAnchor = {
  index: number
}

type ToggleTabIndexOptions = {
  range?: boolean
}

type ResolveNextSelectionStateInput = {
  selected: number[]
  index: number
  options?: ToggleTabIndexOptions
  anchor: TabSelectionAnchor | null
}

type ResolveNextSelectionStateOutput = {
  selected: number[]
  anchor: TabSelectionAnchor
}

const asSortedUnique = (indexes: number[]) =>
  Array.from(new Set(indexes)).sort((a, b) => a - b)

export const resolveNextSelectionState = ({
  selected,
  index,
  options,
  anchor
}: ResolveNextSelectionStateInput): ResolveNextSelectionStateOutput => {
  const nextAnchor = { index }

  if (options?.range) {
    const canExpandRange = anchor != null && Number.isInteger(anchor.index)
    if (canExpandRange) {
      const [start, end] =
        anchor.index <= index ? [anchor.index, index] : [index, anchor.index]
      const range: number[] = []
      for (let i = start; i <= end; i += 1) {
        range.push(i)
      }
      return {
        selected: range,
        anchor: nextAnchor
      }
    }

    return {
      selected: [index],
      anchor: nextAnchor
    }
  }

  const set = new Set(selected)
  if (set.has(index)) {
    set.delete(index)
  } else {
    set.add(index)
  }

  return {
    selected: asSortedUnique(Array.from(set)),
    anchor: nextAnchor
  }
}

export const useDragAndDrop = (
  selectedTag: Workspace | null,
  workspaceManager: ReturnType<typeof useWorkspaceManager>,
  options?: {
    disabled?: boolean
  }
) => {
  const { t } = useTranslation()
  const { moveTabsToWorkspace } = workspaceManager

  const disabled = options?.disabled === true

  const [tabSelectionMode, setTabSelectionMode] = useState(false)
  const [selectedTabIndexes, setSelectedTabIndexes] = useState<number[]>([])
  const [isMovingTabs, setIsMovingTabs] = useState(false)
  const [draggedTabIndexes, setDraggedTabIndexes] = useState<number[]>([])
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const dragSourceRef = useRef<{
    workspaceId: string
    indexes: number[]
  } | null>(null)
  const lastSelectedTabRef = useRef<TabSelectionAnchor | null>(null)

  const selectionCount = selectedTabIndexes.length

  const showFeedback = useCallback((feedback: WorkspaceFeedback) => {
    showWorkspaceFeedbackToast(toast, feedback)
  }, [])

  useEffect(() => {
    setSelectedTabIndexes([])
    setTabSelectionMode(false)
    setDraggedTabIndexes([])
    setDropTargetId(null)
    lastSelectedTabRef.current = null
    dragSourceRef.current = null
  }, [selectedTag?.id])

  const clearSelectionState = useCallback(() => {
    setSelectedTabIndexes([])
    setDraggedTabIndexes([])
    setDropTargetId(null)
    lastSelectedTabRef.current = null
    setTabSelectionMode(false)
  }, [])

  const handleStartSelection = useCallback(() => {
    if (!tabSelectionMode) {
      setSelectedTabIndexes([])
      lastSelectedTabRef.current = null
    }
    setDraggedTabIndexes([])
    setDropTargetId(null)
    setTabSelectionMode(true)
  }, [tabSelectionMode])

  const handleCancelSelection = useCallback(() => {
    clearSelectionState()
  }, [clearSelectionState])

  const handleToggleSelectionMode = useCallback(
    (nextState?: boolean) => {
      const shouldEnable =
        typeof nextState === "boolean" ? nextState : !tabSelectionMode
      if (shouldEnable) {
        handleStartSelection()
        return
      }
      handleCancelSelection()
    },
    [handleCancelSelection, handleStartSelection, tabSelectionMode]
  )

  const handleToggleTabIndex = useCallback(
    (index: number, options?: ToggleTabIndexOptions) => {
      setSelectedTabIndexes((prev) => {
        const next = resolveNextSelectionState({
          selected: prev,
          index,
          options,
          anchor: lastSelectedTabRef.current
        })
        lastSelectedTabRef.current = next.anchor
        return next.selected
      })
    },
    []
  )

  const performTabMove = useCallback(
    async (indexes: number[], targetId: string) => {
      if (disabled || !selectedTag || !indexes.length || !targetId) return
      const sortedIndexes = asSortedUnique(indexes)
      if (!sortedIndexes.length) return
      setIsMovingTabs(true)
      try {
        const success = await moveTabsToWorkspace(
          selectedTag.id,
          targetId,
          sortedIndexes
        )
        if (success) {
          showFeedback({
            kind: "success",
            message: t("home.workspace.banner.movedTabs", {
              count: sortedIndexes.length
            })
          })
          setSelectedTabIndexes([])
          setTabSelectionMode(false)
        } else {
          showFeedback({
            kind: "error",
            message: t("home.workspace.banner.moveFailed")
          })
        }
      } catch (err) {
        console.warn("[TabPlex] Failed to move tabs", err)
        showFeedback({
          kind: "error",
          message: t("home.workspace.banner.moveFailed")
        })
      } finally {
        setIsMovingTabs(false)
      }
    },
    [disabled, moveTabsToWorkspace, selectedTag, showFeedback, t]
  )

  const handleMoveSelectedTabsToWorkspace = useCallback(
    async (targetId: string) => {
      if (!selectionCount || isMovingTabs) return
      await performTabMove(selectedTabIndexes, targetId)
    },
    [isMovingTabs, performTabMove, selectedTabIndexes, selectionCount]
  )

  const handleTabDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, index: number) => {
      if (disabled || !selectedTag) return
      const indexes =
        tabSelectionMode &&
        selectionCount > 0 &&
        selectedTabIndexes.includes(index)
          ? selectedTabIndexes
          : [index]
      const normalizedIndexes = Array.from(new Set(indexes)).sort(
        (a, b) => a - b
      )
      dragSourceRef.current = {
        workspaceId: selectedTag.id,
        indexes: normalizedIndexes
      }
      setDraggedTabIndexes(normalizedIndexes)
      setDropTargetId(null)
      event.dataTransfer.effectAllowed = "copyMove"
      try {
        event.dataTransfer.setData(
          "application/json",
          JSON.stringify({
            workspaceId: selectedTag.id,
            indexes: normalizedIndexes
          })
        )
      } catch {}
      setCompactTabDragImage({
        dataTransfer: event.dataTransfer,
        source: event.currentTarget,
        itemCount: normalizedIndexes.length
      })
    },
    [
      disabled,
      selectedTag,
      selectionCount,
      selectedTabIndexes,
      tabSelectionMode
    ]
  )

  const handleTabDragEnd = useCallback((_event?: DragEvent<HTMLDivElement>) => {
    dragSourceRef.current = null
    setDraggedTabIndexes([])
    setDropTargetId(null)
  }, [])

  const handleWorkspaceDragOver = useCallback(
    (event: DragEvent<HTMLLIElement>, targetId: string) => {
      if (disabled) return
      const dragData = dragSourceRef.current
      if (!dragData) return
      if (dragData.workspaceId === targetId) return
      if (isMovingTabs) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "move"
      if (dropTargetId !== targetId) {
        setDropTargetId(targetId)
      }
    },
    [disabled, dropTargetId, isMovingTabs]
  )

  const handleWorkspaceDrop = useCallback(
    async (event: DragEvent<HTMLLIElement>, targetId: string) => {
      if (disabled) return
      const dragData = dragSourceRef.current
      if (!dragData) return
      if (isMovingTabs) {
        event.preventDefault()
        return
      }
      event.preventDefault()
      setDropTargetId(null)
      if (dragData.workspaceId === targetId) return
      await performTabMove(dragData.indexes, targetId)
      dragSourceRef.current = null
      setDraggedTabIndexes([])
    },
    [disabled, isMovingTabs, performTabMove]
  )

  const handleWorkspaceDragLeave = useCallback(
    (event: DragEvent<HTMLLIElement>, targetId: string) => {
      if (dropTargetId !== targetId) return
      const related = event.relatedTarget as Node | null
      if (related && event.currentTarget.contains(related)) return
      setDropTargetId(null)
    },
    [dropTargetId]
  )

  return {
    state: {
      tabSelectionMode,
      selectedTabIndexes,
      isMovingTabs,
      draggedTabIndexes,
      dropTargetId
    },
    actions: {
      handleToggleSelectionMode,
      handleToggleTabIndex,
      handleMoveSelectedTabsToWorkspace,
      handleTabDragStart,
      handleTabDragEnd,
      handleWorkspaceDragOver,
      handleWorkspaceDrop,
      handleWorkspaceDragLeave
    }
  }
}
