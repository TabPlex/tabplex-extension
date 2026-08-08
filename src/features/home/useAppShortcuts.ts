import { useCallback, useEffect, useRef } from "react"

import { STORAGE_KEYS } from "~core/types"

import { isAppShortcutTargetWindow } from "./appShortcutTarget"
import type { HomeViewModel } from "./useHomeViewModel"

type AppShortcutPayload = {
  action?: string
  id?: string
  targetWindowId?: number
}

export const useAppShortcuts = (vm: HomeViewModel) => {
  const { viewState, actions, data } = vm
  const {
    createEmptyWorkspace,
    setShowTimeline,
    setShowSettings,
    setShowTrash,
    setShowCommandPalette,
    handleSwitch
  } = actions
  const sortedWorkspaces = data.workspaceManager.sortedWorkspaces || []
  const { selectedId } = viewState

  const lastHandledActionIdRef = useRef<string | null>(null)
  const pendingActionRef = useRef<AppShortcutPayload | null>(null)

  const selectAndSwitchRelative = useCallback(
    async (delta: number) => {
      const list = sortedWorkspaces
      if (!list.length) return

      const currentId =
        selectedId ||
        data.workspaceManager.workspaceState.activeWorkspaceId ||
        list[0].id
      const index = Math.max(
        0,
        list.findIndex((t) => t.id === currentId)
      )
      const nextIndex = (index + delta + list.length) % list.length
      const next = list[nextIndex]

      if (!next) return

      return handleSwitch(next)
    },
    [
      data.workspaceManager.workspaceState.activeWorkspaceId,
      handleSwitch,
      selectedId,
      sortedWorkspaces
    ]
  )

  const handleAppShortcutAction = useCallback(
    async (
      action: "goHome" | "newWorkspace" | "prevWorkspace" | "nextWorkspace"
    ) => {
      if (action === "goHome") {
        setShowTimeline(false)
        setShowSettings(false)
        setShowTrash(false)
        return true
      }
      if (action === "newWorkspace") {
        return !!(await createEmptyWorkspace())
      }
      if (action === "prevWorkspace") {
        return (await selectAndSwitchRelative(-1)) === true
      }
      if (action === "nextWorkspace") {
        return (await selectAndSwitchRelative(1)) === true
      }
      return false
    },
    [
      createEmptyWorkspace,
      selectAndSwitchRelative,
      setShowTimeline,
      setShowSettings,
      setShowTrash
    ]
  )

  const consumePendingAction = useCallback(
    async (payload?: AppShortcutPayload) => {
      const action = payload?.action as
        | "goHome"
        | "newWorkspace"
        | "prevWorkspace"
        | "nextWorkspace"
        | undefined
      if (!action) return
      if (payload?.targetWindowId !== undefined) {
        let currentWindow: chrome.windows.Window
        try {
          currentWindow = await chrome.windows.getCurrent({ populate: false })
        } catch {
          return
        }
        if (!isAppShortcutTargetWindow(payload.targetWindowId, currentWindow)) {
          return
        }
      }
      if (payload?.id && lastHandledActionIdRef.current === payload.id) {
        return
      }
      if (
        (action === "prevWorkspace" || action === "nextWorkspace") &&
        sortedWorkspaces.length === 0
      ) {
        pendingActionRef.current = {
          action,
          id: payload?.id,
          targetWindowId: payload?.targetWindowId
        }
        return
      }
      const handled = await handleAppShortcutAction(action)
      if (!handled) return
      if (payload?.id) lastHandledActionIdRef.current = payload.id
      pendingActionRef.current = null
      try {
        await chrome.runtime.sendMessage({
          _tabplex: true,
          type: "pending-action-consume",
          id: payload?.id
        })
      } catch {}
    },
    [handleAppShortcutAction, sortedWorkspaces.length]
  )

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName
      const isEditable =
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA"

      if (
        !isEditable &&
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey
      ) {
        event.preventDefault()
        setShowCommandPalette(true)
      }
    }

    window.addEventListener("keydown", handleKeydown, true)
    return () => window.removeEventListener("keydown", handleKeydown, true)
  }, [setShowCommandPalette])

  useEffect(() => {
    const onMessage = (
      msg: any,
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (r?: any) => void
    ) => {
      if (!msg || !msg._tabplex || msg.type !== "app-shortcut") return
      void consumePendingAction({
        action: msg.action,
        id: msg.id,
        targetWindowId: msg.targetWindowId
      })
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => {
      try {
        chrome.runtime.onMessage.removeListener(onMessage)
      } catch {}
    }
  }, [consumePendingAction])

  useEffect(() => {
    if (!chrome?.storage?.onChanged) return
    const handler = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== "local") return
      const entry = changes[STORAGE_KEYS.PENDING_ACTION]?.newValue
      if (!entry) return
      void consumePendingAction(entry)
    }
    chrome.storage.onChanged.addListener(handler)
    return () => {
      try {
        chrome.storage.onChanged.removeListener(handler)
      } catch {}
    }
  }, [consumePendingAction])

  useEffect(() => {
    if (!chrome?.storage?.local) return
    chrome.storage.local
      .get(STORAGE_KEYS.PENDING_ACTION)
      .then((res) => {
        void consumePendingAction(res?.[STORAGE_KEYS.PENDING_ACTION])
      })
      .catch(() => {})
  }, [consumePendingAction])

  useEffect(() => {
    const pending = pendingActionRef.current
    if (!pending || sortedWorkspaces.length === 0) return
    void consumePendingAction(pending)
  }, [consumePendingAction, sortedWorkspaces.length])
}
