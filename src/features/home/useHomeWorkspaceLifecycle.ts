import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import type { Workspace } from "~core/types"
import { useWorkspaceSwitchGuard } from "~features/workspace/hooks/useWorkspaceSwitchGuard"
import type { CreateWorkspaceResult } from "~features/workspace/hooks/workspaceCrudActions"
import {
  isWorkspaceSwitchInProgressError,
  isWorkspaceSwitchTabsStillLoadingError
} from "~features/workspace/logic/workspaceSwitchErrors"
import type { useWorkspaceManager } from "~hooks/useWorkspaceManager"

import { showWorkspaceFeedbackToast } from "./workspaceFeedback"

type WorkspaceManager = ReturnType<typeof useWorkspaceManager>

type HomeWorkspaceLifecycleInput = {
  workspaceManager: WorkspaceManager
  query: string
  setQuery: Dispatch<SetStateAction<string>>
  selectedId: string | null
  setSelectedId: Dispatch<SetStateAction<string | null>>
  setFollowActive: Dispatch<SetStateAction<boolean>>
  cancelPreview: () => void
  switchActive: boolean
  guideWorkspaceId?: string | null
  showWorkspaceTrashed: (name: string | null) => void
}

export const useHomeWorkspaceLifecycle = ({
  workspaceManager,
  query,
  setQuery,
  selectedId,
  setSelectedId,
  setFollowActive,
  cancelPreview,
  switchActive,
  guideWorkspaceId,
  showWorkspaceTrashed
}: HomeWorkspaceLifecycleInput) => {
  const { t } = useTranslation()
  const {
    sortedWorkspaces,
    createWorkspace,
    removeWorkspace: moveWorkspaceToTrash,
    switchTo
  } = workspaceManager
  const [trashPending, setTrashPending] = useState(false)
  const [createPending, setCreatePending] = useState(false)
  const createPendingRef = useRef(false)
  const {
    isLocked: switchLocked,
    isLockedNow,
    acquire: acquireExclusiveSwitch,
    release: releaseExclusiveSwitch,
    acquireLatest: acquireLatestSwitch,
    isLatest: isLatestSwitch,
    releaseLatest: releaseLatestSwitch
  } = useWorkspaceSwitchGuard(switchActive)

  const showSwitchBlocked = useCallback(() => {
    showWorkspaceFeedbackToast(toast, {
      kind: "info",
      message: t("home.workspace.switchBlocked")
    })
  }, [t])

  const quickCreate = useCallback(
    async (requestedName?: string, seedFromCurrentWindow?: boolean) => {
      const name = (requestedName ?? query).trim()
      if (!name) return
      try {
        const result = await createWorkspace({
          activate: true,
          name,
          seedFromCurrentWindow
        })
        setSelectedId(result.workspace.id)
        setQuery("")
        if (result.activation.status === "failed") {
          showWorkspaceFeedbackToast(toast, {
            kind: "info",
            message: t("home.create.popup.partialSuccess")
          })
        }
      } catch (error) {
        console.warn("[TabPlex] Quick create failed", error)
      }
    },
    [createWorkspace, query, setQuery, setSelectedId, t]
  )

  const createEmptyWorkspace = useCallback(async () => {
    if (createPendingRef.current || !acquireExclusiveSwitch()) {
      showSwitchBlocked()
      return null
    }

    createPendingRef.current = true
    setCreatePending(true)
    cancelPreview()
    setFollowActive(false)

    try {
      const currentWindow = await chrome.windows.getCurrent({
        populate: false
      })
      const result = await createWorkspace({
        activate: true,
        preferredWindowId: currentWindow.id,
        seedFromCurrentWindow: false
      })
      setSelectedId(result.workspace.id)
      setQuery("")
      if (result.activation.status === "failed") {
        showWorkspaceFeedbackToast(toast, {
          kind: "info",
          message: t("home.create.popup.partialSuccess")
        })
      }
      return result
    } catch (error) {
      console.warn("[TabPlex] Failed to create empty workspace", error)
      showWorkspaceFeedbackToast(toast, {
        kind: "error",
        message: t("home.create.popup.error")
      })
      return null
    } finally {
      createPendingRef.current = false
      setCreatePending(false)
      setFollowActive(true)
      releaseExclusiveSwitch()
    }
  }, [
    acquireExclusiveSwitch,
    cancelPreview,
    createWorkspace,
    releaseExclusiveSwitch,
    setFollowActive,
    setQuery,
    setSelectedId,
    showSwitchBlocked,
    t
  ]) satisfies () => Promise<CreateWorkspaceResult | null>

  const handleDelete = useCallback(
    async (workspace: Workspace) => {
      if (isLockedNow()) {
        showSwitchBlocked()
        return
      }
      if (trashPending) return
      setTrashPending(true)
      try {
        await moveWorkspaceToTrash(workspace.id)
        showWorkspaceTrashed(workspace.name || null)
        if (selectedId === workspace.id) setSelectedId(null)
      } catch (error) {
        console.warn("[TabPlex] Failed to move workspace to trash", error)
      } finally {
        setTrashPending(false)
      }
    },
    [
      moveWorkspaceToTrash,
      selectedId,
      setSelectedId,
      showSwitchBlocked,
      showWorkspaceTrashed,
      isLockedNow,
      trashPending
    ]
  )

  const handleSwitch = useCallback(
    async (workspace: Workspace) => {
      const switchIntent = acquireLatestSwitch()
      if (switchIntent === null) {
        showSwitchBlocked()
        return false
      }
      cancelPreview()
      setFollowActive(false)
      try {
        const currentWindow = await chrome.windows.getCurrent({
          populate: false
        })
        if (!isLatestSwitch(switchIntent)) return false
        setSelectedId(workspace.id)
        await switchTo(workspace.id, {
          preferredWindowId: currentWindow.id
        })
        return true
      } catch (error) {
        if (!isLatestSwitch(switchIntent)) return false
        console.warn("[TabPlex] Failed to switch workspace", error)
        const switchWasBlocked = isWorkspaceSwitchInProgressError(error)
        const tabsStillLoading = isWorkspaceSwitchTabsStillLoadingError(error)
        showWorkspaceFeedbackToast(toast, {
          kind: switchWasBlocked || tabsStillLoading ? "info" : "error",
          message: t(
            switchWasBlocked
              ? "home.workspace.switchBlocked"
              : tabsStillLoading
                ? "home.workspace.tabsStillLoading"
                : "common.switchFailed"
          )
        })
        return false
      } finally {
        if (releaseLatestSwitch(switchIntent)) {
          setFollowActive(true)
        }
      }
    },
    [
      cancelPreview,
      acquireLatestSwitch,
      isLatestSwitch,
      releaseLatestSwitch,
      setFollowActive,
      setSelectedId,
      showSwitchBlocked,
      switchTo,
      t
    ]
  )

  const handleOpenGuideWorkspace = useCallback(async () => {
    if (!guideWorkspaceId) return
    const target = sortedWorkspaces.find(
      (workspace) => workspace.id === guideWorkspaceId
    )
    if (!target) {
      setSelectedId(guideWorkspaceId)
      return
    }
    setFollowActive(false)
    try {
      setSelectedId(target.id)
      await switchTo(target.id)
    } finally {
      setFollowActive(true)
    }
  }, [
    guideWorkspaceId,
    setFollowActive,
    setSelectedId,
    sortedWorkspaces,
    switchTo
  ])

  return {
    trashPending,
    createPending,
    switchLocked,
    quickCreate,
    createEmptyWorkspace,
    handleDelete,
    handleSwitch,
    handleOpenGuideWorkspace
  }
}
