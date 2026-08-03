import type {
  BackgroundMessageRouter,
  BackgroundMessageValidator
} from "./types"

type ListenerOptions = {
  validator: BackgroundMessageValidator
  router: BackgroundMessageRouter
}

export const createBackgroundMessageListener = ({
  validator,
  router
}: ListenerOptions) => {
  return (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    const validation = validator(message, sender)
    if (!validation.ok) {
      const response =
        "response" in validation ? validation.response : undefined
      if (response !== undefined) {
        sendResponse(response)
        return true
      }
      return
    }

    const handler = router(validation.message.type)
    if (!handler) {
      sendResponse({ ok: false, error: "unknown-message-type" })
      return true
    }

    try {
      return handler(validation.message, sendResponse)
    } catch (err) {
      console.warn(`[TabPlex] message:${validation.message.type} failed`, err)
      sendResponse({ ok: false, error: `${validation.message.type} failed` })
      return true
    }
  }
}
