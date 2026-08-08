import type { BackgroundMessageHandler } from "../types"
import { runAsyncMessage } from "./utils"

type HomeHandlerDeps = {
  openAndPinHomeInCurrentWindow: (activate: boolean) => Promise<void>
  openAndPinHomeInWindow: (windowId: number, activate: boolean) => Promise<void>
}

const createOpenHomeHandler = (
  deps: HomeHandlerDeps
): BackgroundMessageHandler => {
  return (message, sendResponse) => {
    return runAsyncMessage(
      message.type,
      sendResponse,
      () => {
        const windowId =
          typeof message.preferredWindowId === "number"
            ? message.preferredWindowId
            : undefined
        return typeof windowId === "number"
          ? deps.openAndPinHomeInWindow(windowId, !!message.activate)
          : deps.openAndPinHomeInCurrentWindow(!!message.activate)
      },
      {
        onSuccess: () => ({ ok: true }),
        fallbackError: `${message.type} failed`
      }
    )
  }
}

export const createHomeMessageHandlers = (deps: HomeHandlerDeps) => {
  const openHome = createOpenHomeHandler(deps)

  return {
    "ensure-home": openHome,
    "open-home": openHome
  } satisfies Record<string, BackgroundMessageHandler>
}
