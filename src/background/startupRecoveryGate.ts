import type { BackgroundMessageHandler } from "./messages/types"

export const createStartupRecoveryGate = <T>(recovery: Promise<T>) => {
  let succeeded = false
  const ready = recovery.then((result) => {
    succeeded = true
    return result
  })

  return {
    ready,
    hasSucceeded: () => succeeded,
    async wait() {
      try {
        await ready
        return true
      } catch {
        return false
      }
    }
  }
}

export const gateBackgroundMessageHandler = (
  startupReady: Promise<unknown>,
  handler: BackgroundMessageHandler
): BackgroundMessageHandler => {
  return (message, sendResponse) => {
    void startupReady.then(
      () => {
        try {
          handler(message, sendResponse)
        } catch (error) {
          console.warn(`[TabPlex] message:${message.type} failed`, error)
          sendResponse({ ok: false, error: `${message.type} failed` })
        }
      },
      () => sendResponse({ ok: false, error: "startup-recovery-failed" })
    )
    return true
  }
}
