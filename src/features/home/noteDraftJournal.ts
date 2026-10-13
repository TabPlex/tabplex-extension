const DRAFT_PREFIX = "tabplex.note-draft.v1:"
const DELETED_PREFIX = "tabplex.note-draft.deleted.v1:"
const deletedKey = (workspaceId: string) =>
  `${DELETED_PREFIX}${encodeURIComponent(workspaceId)}`

export type NoteDraftEntry = {
  workspaceId: string
  ownerId: string
  value: string
  updatedAt: number
}

const draftKey = (workspaceId: string, ownerId: string) =>
  `${DRAFT_PREFIX}${encodeURIComponent(workspaceId)}:${ownerId}`

const parseDraft = (raw: string | null): NoteDraftEntry | null => {
  try {
    const draft = JSON.parse(raw ?? "null")
    return draft &&
      typeof draft.workspaceId === "string" &&
      typeof draft.ownerId === "string" &&
      typeof draft.value === "string" &&
      Number.isFinite(draft.updatedAt)
      ? draft
      : null
  } catch {
    return null
  }
}

// This UI journal is synchronous so a draft survives page teardown even when
// the background save fails. Each editor owns separate keys across windows.
export const persistNoteDraft = (
  workspaceId: string,
  ownerId: string,
  value: string
) => {
  try {
    if (localStorage.getItem(deletedKey(workspaceId))) return false
    localStorage.setItem(
      draftKey(workspaceId, ownerId),
      JSON.stringify({ workspaceId, ownerId, value, updatedAt: Date.now() })
    )
    if (localStorage.getItem(deletedKey(workspaceId))) {
      localStorage.removeItem(draftKey(workspaceId, ownerId))
      return false
    }
    return true
  } catch {
    return false
  }
}

export const clearSavedNoteDraft = (
  workspaceId: string,
  ownerId: string,
  savedValue: string
) => {
  try {
    const key = draftKey(workspaceId, ownerId)
    if (parseDraft(localStorage.getItem(key))?.value === savedValue) {
      localStorage.removeItem(key)
    }
  } catch {
    // Keeping a redundant recovery copy is safer than failing a saved note.
  }
}

export const findRecoverableNoteDraft = (
  workspaceId: string,
  ownerId: string,
  savedValue?: string
): NoteDraftEntry | null => {
  try {
    if (localStorage.getItem(deletedKey(workspaceId))) return null
    let latest: NoteDraftEntry | null = null
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(DRAFT_PREFIX)) continue
      const draft = parseDraft(localStorage.getItem(key))
      if (
        draft?.workspaceId === workspaceId &&
        draft.ownerId !== ownerId &&
        draft.value !== savedValue &&
        (!latest || draft.updatedAt > latest.updatedAt)
      ) {
        latest = draft
      }
    }
    return latest
  } catch {
    return null
  }
}

export const removeWorkspaceNoteDrafts = (workspaceIds: string[]) => {
  const ids = new Set(workspaceIds)
  for (const id of ids) localStorage.setItem(deletedKey(id), "deleted")
  const prefixes = [...ids].map(
    (id) => `${DRAFT_PREFIX}${encodeURIComponent(id)}:`
  )
  const keys = Array.from({ length: localStorage.length }, (_, index) =>
    localStorage.key(index)
  )
  for (const key of keys) {
    if (key && prefixes.some((prefix) => key.startsWith(prefix)))
      localStorage.removeItem(key)
  }
}

export const allowWorkspaceNoteDrafts = (workspaceIds: string[]) => {
  for (const id of workspaceIds) localStorage.removeItem(deletedKey(id))
}
