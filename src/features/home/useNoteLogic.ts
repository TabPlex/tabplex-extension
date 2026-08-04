import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import type { useWorkspaceManager } from "~hooks/useWorkspaceManager"

export const useNoteLogic = (
  selectedId: string | null,
  workspaceManager: ReturnType<typeof useWorkspaceManager>
) => {
  const { workspaceState, setWorkspaceNote } = workspaceManager

  const [noteDraft, setNoteDraft] = useState("")

  const noteDraftRef = useRef("")
  const draftByWorkspaceIdRef = useRef<Record<string, string>>({})
  const dirtyByWorkspaceIdRef = useRef<Record<string, boolean>>({})
  const noteSaveTimerRef = useRef<number | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const previousSelectedIdRef = useRef<string | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const enqueueSave = useCallback((task: () => Promise<void>) => {
    const next = saveQueueRef.current.then(task, task)
    saveQueueRef.current = next.catch(() => {})
    return next
  }, [])

  const flushNoteSave = useCallback(
    async (id: string, value: string) => {
      const intendedValue = value
      const ok = await enqueueSave(async () => {
        await setWorkspaceNote(id, intendedValue)
      }).then(
        () => true,
        (err) => {
          console.warn("[TabPlex] Failed to save note", err)
          const logId = Date.now().toString(36).slice(-5).toUpperCase()
          toast.error("笔记保存失败", {
            description: `请稍后重试 (Log ID: ${logId})`,
            duration: 4000
          })
          return false
        }
      )

      if (!ok) return false

      const latestDraft = draftByWorkspaceIdRef.current[id]
      if (typeof latestDraft === "string" && latestDraft !== intendedValue) {
        return
      }

      delete dirtyByWorkspaceIdRef.current[id]
      delete draftByWorkspaceIdRef.current[id]

      if (selectedIdRef.current === id) {
        noteDraftRef.current = intendedValue
        setNoteDraft(intendedValue)
      }
      return true
    },
    [enqueueSave, setWorkspaceNote]
  )

  const flushPendingNotes = useCallback(async () => {
    if (noteSaveTimerRef.current) {
      window.clearTimeout(noteSaveTimerRef.current)
      noteSaveTimerRef.current = null
    }

    const currentId = selectedIdRef.current
    if (currentId && dirtyByWorkspaceIdRef.current[currentId]) {
      draftByWorkspaceIdRef.current[currentId] = noteDraftRef.current
    }

    const pending = Object.keys(dirtyByWorkspaceIdRef.current)
    for (const id of pending) {
      const value = draftByWorkspaceIdRef.current[id]
      if (typeof value !== "string") continue
      const saved = await flushNoteSave(id, value)
      if (!saved) {
        throw new Error("note-save-failed")
      }
    }
    await saveQueueRef.current
  }, [flushNoteSave])

  const scheduleNoteSave = useCallback(
    (id: string, value: string) => {
      if (noteSaveTimerRef.current) {
        window.clearTimeout(noteSaveTimerRef.current)
      }
      noteSaveTimerRef.current = window.setTimeout(() => {
        noteSaveTimerRef.current = null
        void flushNoteSave(id, value)
      }, 350)
    },
    [flushNoteSave]
  )

  const handleNoteChange = useCallback(
    (value: string) => {
      if (value === noteDraftRef.current) {
        return
      }
      setNoteDraft(value)
      noteDraftRef.current = value
      if (!selectedId) return
      draftByWorkspaceIdRef.current[selectedId] = value
      dirtyByWorkspaceIdRef.current[selectedId] = true
      scheduleNoteSave(selectedId, value)
    },
    [scheduleNoteSave, selectedId]
  )

  useEffect(() => {
    return () => {
      const currentId = selectedIdRef.current
      const pendingDraft = noteDraftRef.current
      const hadPendingTimer = noteSaveTimerRef.current !== null
      if (noteSaveTimerRef.current) {
        window.clearTimeout(noteSaveTimerRef.current)
        noteSaveTimerRef.current = null
      }
      if (
        currentId &&
        (dirtyByWorkspaceIdRef.current[currentId] || hadPendingTimer)
      ) {
        draftByWorkspaceIdRef.current[currentId] = pendingDraft
        dirtyByWorkspaceIdRef.current[currentId] = true
        selectedIdRef.current = null
        void flushNoteSave(currentId, pendingDraft)
      }
    }
  }, [flushNoteSave])

  useEffect(() => {
    const previousId = previousSelectedIdRef.current
    const currentId = selectedId
    const currentDraft = noteDraftRef.current

    const switchingWorkspace = previousId !== currentId

    if (previousId && switchingWorkspace) {
      const wasDirty = !!dirtyByWorkspaceIdRef.current[previousId]
      const hadPendingTimer = noteSaveTimerRef.current !== null
      if (wasDirty || hadPendingTimer) {
        draftByWorkspaceIdRef.current[previousId] = currentDraft
        dirtyByWorkspaceIdRef.current[previousId] = true
        if (noteSaveTimerRef.current) {
          window.clearTimeout(noteSaveTimerRef.current)
          noteSaveTimerRef.current = null
        }
        void flushNoteSave(previousId, currentDraft)
      }
    }

    previousSelectedIdRef.current = currentId
    selectedIdRef.current = currentId

    const remoteNote = currentId
      ? (workspaceState.notes?.[currentId] ?? "")
      : ""
    const hasPendingSave = noteSaveTimerRef.current !== null
    const cachedDraft =
      currentId && dirtyByWorkspaceIdRef.current[currentId]
        ? draftByWorkspaceIdRef.current[currentId]
        : undefined
    const nextNote = typeof cachedDraft === "string" ? cachedDraft : remoteNote

    if (switchingWorkspace) {
      if (noteSaveTimerRef.current) {
        window.clearTimeout(noteSaveTimerRef.current)
        noteSaveTimerRef.current = null
      }
      noteDraftRef.current = nextNote
      setNoteDraft(nextNote)
      return
    }

    if (
      currentId &&
      !hasPendingSave &&
      !dirtyByWorkspaceIdRef.current[currentId]
    ) {
      if (remoteNote !== currentDraft) {
        noteDraftRef.current = remoteNote
        setNoteDraft(remoteNote)
      }
    }
  }, [flushNoteSave, selectedId, workspaceState.notes])

  return {
    noteDraft,
    handleNoteChange,
    flushPendingNotes
  }
}
