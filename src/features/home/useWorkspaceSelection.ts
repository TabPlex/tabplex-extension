import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { Workspace } from "~core/types"

import { createHoverPreviewController } from "./hoverPreview"

type WorkspaceSelectionInput = {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  guideWorkspaceId?: string | null
  onboardingDismissed?: boolean
}

export const useWorkspaceSelection = ({
  workspaces,
  activeWorkspaceId,
  guideWorkspaceId,
  onboardingDismissed
}: WorkspaceSelectionInput) => {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [followActive, setFollowActive] = useState(true)
  const activeWorkspaceIdRef = useRef<string | null>(activeWorkspaceId)
  const hoverPreviewRef = useRef<ReturnType<
    typeof createHoverPreviewController
  > | null>(null)

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId
  }, [activeWorkspaceId])

  if (!hoverPreviewRef.current) {
    hoverPreviewRef.current = createHoverPreviewController({
      getActiveId: () => activeWorkspaceIdRef.current,
      setSelectedId,
      setFollowActive,
      releaseDelayMs: 80
    })
  }

  useEffect(() => {
    return () => {
      hoverPreviewRef.current?.dispose()
      hoverPreviewRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!workspaces.length) {
      setSelectedId(null)
      return
    }
    const activeExists =
      !!activeWorkspaceId &&
      workspaces.some((workspace) => workspace.id === activeWorkspaceId)
    const selectedExists =
      !!selectedId &&
      workspaces.some((workspace) => workspace.id === selectedId)

    if (followActive && activeExists) {
      if (selectedId !== activeWorkspaceId) setSelectedId(activeWorkspaceId)
      return
    }
    if (!selectedExists) {
      setSelectedId(activeExists ? activeWorkspaceId : workspaces[0].id)
    }
  }, [activeWorkspaceId, followActive, selectedId, workspaces])

  useEffect(() => {
    if (selectedId || activeWorkspaceId) return
    if (!guideWorkspaceId || onboardingDismissed) return
    setSelectedId(guideWorkspaceId)
  }, [activeWorkspaceId, guideWorkspaceId, onboardingDismissed, selectedId])

  const selectedWorkspace = useMemo(
    () =>
      selectedId
        ? workspaces.find((workspace) => workspace.id === selectedId) ?? null
        : null,
    [selectedId, workspaces]
  )

  const handlePreview = useCallback((workspace: Workspace) => {
    hoverPreviewRef.current?.enterSidebar(workspace.id)
  }, [])
  const handleSidebarLeave = useCallback(() => {
    hoverPreviewRef.current?.leaveSidebar()
  }, [])
  const handleDetailEnter = useCallback(() => {
    hoverPreviewRef.current?.enterDetail()
  }, [])
  const handleDetailLeave = useCallback(() => {
    hoverPreviewRef.current?.leaveDetail()
  }, [])
  const cancelPreview = useCallback(() => {
    hoverPreviewRef.current?.cancel()
  }, [])

  return {
    selectedId,
    setSelectedId,
    selectedWorkspace,
    setFollowActive,
    cancelPreview,
    handlePreview,
    handleSidebarLeave,
    handleDetailEnter,
    handleDetailLeave
  }
}
