import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { uuid } from "~core/utils"
import type { useWorkspaceManager } from "~hooks/useWorkspaceManager"

import {
  clearSavedNoteDraft,
  persistNoteDraft,
  type NoteDraftEntry
} from "./noteDraftJournal"
import { useNoteDraftRecovery } from "./useNoteDraftRecovery"

export const useNoteLogic = (
  selectedId: string | null,
  workspaceManager: ReturnType<typeof useWorkspaceManager>
) => {
  const { workspaceState, setWorkspaceNote } = workspaceManager
  const { t } = useTranslation()
  const translateRef = useRef(t)
  translateRef.current = t

  const [noteDraft, setNoteDraft] = useState<{
    workspaceId: string | null
    value: string
  }>({ workspaceId: null, value: "" })

  const noteDraftRef = useRef("")
  const draftByWorkspaceIdRef = useRef<Record<string, string>>({})
  const dirtyByWorkspaceIdRef = useRef<Record<string, boolean>>({})
  const noteSaveTimerRef = useRef<number | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const previousSelectedIdRef = useRef<string | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const draftOwnerRef = useRef<string | null>(null)
  if (!draftOwnerRef.current) draftOwnerRef.current = uuid()
  const recoveredDraftsRef = useRef<Record<string, NoteDraftEntry>>({})
  const journalWarningShownRef = useRef(false)

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
          toast.error(translateRef.current("home.note.saveFailed"), {
            description: translateRef.current(
              "home.note.saveFailedDescription",
              { logId }
            ),
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
      clearSavedNoteDraft(id, draftOwnerRef.current!, intendedValue)
      const recovered = recoveredDraftsRef.current[id]
      if (recovered) {
        clearSavedNoteDraft(id, recovered.ownerId, recovered.value)
        delete recoveredDraftsRef.current[id]
      }

      if (selectedIdRef.current === id) {
        noteDraftRef.current = intendedValue
        setNoteDraft({ workspaceId: id, value: intendedValue })
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
      setNoteDraft({ workspaceId: selectedId, value })
      noteDraftRef.current = value
      if (!selectedId) return
      draftByWorkspaceIdRef.current[selectedId] = value
      dirtyByWorkspaceIdRef.current[selectedId] = true
      const persisted = persistNoteDraft(
        selectedId,
        draftOwnerRef.current!,
        value
      )
      if (!persisted && !journalWarningShownRef.current) {
        journalWarningShownRef.current = true
        toast.error(translateRef.current("home.note.draftStorageFailed"), {
          duration: Infinity
        })
      } else if (persisted) {
        journalWarningShownRef.current = false
      }
      scheduleNoteSave(selectedId, value)
    },
    [scheduleNoteSave, selectedId]
  )

  const restoreDraft = useCallback(
    (entry: NoteDraftEntry) => {
      if (selectedIdRef.current !== entry.workspaceId) return
      recoveredDraftsRef.current[entry.workspaceId] = entry
      handleNoteChange(entry.value)
    },
    [handleNoteChange]
  )
  useNoteDraftRecovery(
    selectedId,
    selectedId ? (workspaceState.notes?.[selectedId] ?? "") : "",
    draftOwnerRef.current,
    restoreDraft
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
      }
      selectedIdRef.current = null
      for (const id of Object.keys(dirtyByWorkspaceIdRef.current)) {
        const value = draftByWorkspaceIdRef.current[id]
        if (typeof value === "string") void flushNoteSave(id, value)
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
      setNoteDraft({ workspaceId: currentId, value: nextNote })
      return
    }

    if (
      currentId &&
      !hasPendingSave &&
      !dirtyByWorkspaceIdRef.current[currentId]
    ) {
      if (remoteNote !== currentDraft) {
        noteDraftRef.current = remoteNote
        setNoteDraft({ workspaceId: currentId, value: remoteNote })
      }
    }
  }, [flushNoteSave, selectedId, workspaceState.notes])

  return {
    // The document identity and its draft must move together, including renders
    // that run after selection effects but before their state update commits.
    noteDraft:
      selectedId !== noteDraft.workspaceId
        ? selectedId
          ? (draftByWorkspaceIdRef.current[selectedId] ??
            workspaceState.notes?.[selectedId] ??
            "")
          : ""
        : noteDraft.value,
    handleNoteChange,
    flushPendingNotes
  }
}
