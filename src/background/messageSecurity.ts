export const isTrustedInternalMessageSender = (
  sender: chrome.runtime.MessageSender | undefined
) => {
  if (!sender?.id || sender.id !== chrome.runtime.id) return false
  if (typeof sender.url !== "string") return false
  const extensionOrigin = chrome.runtime.getURL("")
  return sender.url.startsWith(extensionOrigin)
}
