import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { uuid } from "~core/utils"

import {
  findRecoverableNoteDraft,
  type NoteDraftEntry
} from "./noteDraftJournal"

export const useNoteDraftRecovery = (
  workspaceId: string | null,
  savedValue: string,
  ownerId: string,
  onRestore: (entry: NoteDraftEntry) => void
) => {
  const { t } = useTranslation()
  const toastId = useMemo(
    () => (workspaceId ? `note-draft-recovery:${ownerId}:${uuid()}` : null),
    [workspaceId, ownerId]
  )
  useEffect(() => {
    if (!workspaceId || !toastId) return
    const draft = findRecoverableNoteDraft(workspaceId, ownerId, savedValue)
    if (!draft) {
      toast.dismiss(toastId)
      return
    }
    // Recovery is explicit: an old draft must never silently overwrite a note
    // that another window or a backup restore has since changed.
    toast.info(t("home.note.recoveryFound"), {
      id: toastId,
      description: t("home.note.recoveryDescription"),
      duration: Infinity,
      action: {
        label: t("home.note.recoverDraft"),
        onClick: () => onRestore(draft)
      }
    })
  }, [workspaceId, savedValue, ownerId, onRestore, t, toastId])

  // Updating a toast after hydration must not race a queued dismissal of the
  // same ID. Dismiss only when leaving this document or unmounting the editor.
  useEffect(() => {
    return () => {
      if (toastId) toast.dismiss(toastId)
    }
  }, [toastId])
}
