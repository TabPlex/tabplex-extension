import {
  allowWorkspaceNoteDrafts,
  removeWorkspaceNoteDrafts
} from "~features/home/noteDraftJournal"

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    sender.id !== chrome.runtime.id ||
    message?._tabplexNoteDraftMaintenance !== true
  )
    return
  if (
    !Array.isArray(message.workspaceIds) ||
    !message.workspaceIds.every(
      (id: unknown) => typeof id === "string" && id.length > 0
    ) ||
    !["delete", "allow"].includes(message.action)
  ) {
    sendResponse({ ok: false })
    return
  }
  try {
    const operation =
      message.action === "delete"
        ? removeWorkspaceNoteDrafts
        : allowWorkspaceNoteDrafts
    operation(message.workspaceIds)
    sendResponse({ ok: true })
  } catch {
    sendResponse({ ok: false })
  }
})
