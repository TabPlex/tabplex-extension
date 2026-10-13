const DOCUMENT_PATH = "tabs/note-draft-maintenance.html"

type DraftMaintenanceAction = "delete" | "allow"
type DraftMaintenanceDependencies = {
  hasDocument: () => Promise<boolean>
  createDocument: () => Promise<void>
  send: (
    action: DraftMaintenanceAction,
    workspaceIds: string[]
  ) => Promise<{ ok?: boolean } | undefined>
  closeDocument: () => Promise<void>
}

export const createNoteDraftMaintenance = (
  dependencies: DraftMaintenanceDependencies
) => {
  let tail: Promise<void> = Promise.resolve()
  return (action: DraftMaintenanceAction, workspaceIds: string[]) => {
    if (!workspaceIds.length) return Promise.resolve()
    const run = tail
      .then(async () => {
        if (!(await dependencies.hasDocument()))
          await dependencies.createDocument()
        try {
          const response = await dependencies.send(action, [
            ...new Set(workspaceIds)
          ])
          if (response?.ok !== true)
            throw new Error("note-draft-cleanup-failed")
        } finally {
          await dependencies
            .closeDocument()
            .catch((error) =>
              console.warn(
                "[TabPlex] Could not close draft maintenance document",
                error
              )
            )
        }
      })
      .catch(() => {
        throw new Error("note-draft-cleanup-failed")
      })
    tail = run.catch(() => {})
    return run
  }
}

const hasMaintenanceDocument = async () => {
  const url = chrome.runtime.getURL(DOCUMENT_PATH)
  if (typeof chrome.runtime.getContexts === "function") {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [url]
    })
    return contexts.length > 0
  }
  const worker = globalThis as unknown as {
    clients: { matchAll(): Promise<Array<{ url: string }>> }
  }
  return (await worker.clients.matchAll()).some((client) => client.url === url)
}

const maintainNoteDrafts = createNoteDraftMaintenance({
  hasDocument: hasMaintenanceDocument,
  createDocument: () =>
    chrome.offscreen.createDocument({
      url: DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.LOCAL_STORAGE],
      justification:
        "Remove local note drafts when workspaces are permanently deleted."
    }),
  send: (action, workspaceIds) =>
    chrome.runtime.sendMessage({
      _tabplexNoteDraftMaintenance: true,
      action,
      workspaceIds
    }),
  closeDocument: () => chrome.offscreen.closeDocument()
})

export const removePersistedWorkspaceNoteDrafts = (workspaceIds: string[]) =>
  maintainNoteDrafts("delete", workspaceIds)
export const allowPersistedWorkspaceNoteDrafts = (workspaceIds: string[]) =>
  maintainNoteDrafts("allow", workspaceIds)
