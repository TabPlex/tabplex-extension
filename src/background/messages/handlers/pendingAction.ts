import { STORAGE_KEYS } from "~core/types"
import { withAuxiliaryStorageWriteLock } from "~lib/storageQueues"

import type { BackgroundMessageHandler } from "../types"
import { runAsyncMessage } from "./utils"

type PendingActionStorage = Pick<chrome.storage.StorageArea, "get" | "remove">

type PendingActionConsumerDeps = {
  storage: PendingActionStorage
  withLock: typeof withAuxiliaryStorageWriteLock
}

export const createPendingActionConsumer = ({
  storage,
  withLock
}: PendingActionConsumerDeps) => {
  return (expectedId?: string) =>
    withLock(async () => {
      const result = await storage.get(STORAGE_KEYS.PENDING_ACTION)
      const current = result[STORAGE_KEYS.PENDING_ACTION] as
        | { id?: unknown }
        | undefined
      if (!current) return false

      if (expectedId) {
        if (current.id !== expectedId) return false
      } else if (typeof current.id === "string" && current.id) {
        return false
      }

      await storage.remove(STORAGE_KEYS.PENDING_ACTION)
      return true
    })
}

export const createPendingActionMessageHandler = (
  consume: ReturnType<typeof createPendingActionConsumer>
): BackgroundMessageHandler => {
  return (message, sendResponse) => {
    const id =
      typeof message.id === "string" && message.id.trim()
        ? message.id
        : undefined
    if (message.id !== undefined && !id) {
      sendResponse({ ok: false, error: "invalid-pending-action-id" })
      return true
    }

    return runAsyncMessage(
      "pending-action-consume",
      sendResponse,
      () => consume(id),
      {
        onSuccess: (consumed) => ({ ok: true, consumed }),
        fallbackError: "pending-action-consume failed"
      }
    )
  }
}

export const handlePendingActionMessage: BackgroundMessageHandler = (
  message,
  sendResponse
) => {
  const consumePendingAction = createPendingActionConsumer({
    storage: chrome.storage.local,
    withLock: withAuxiliaryStorageWriteLock
  })
  return createPendingActionMessageHandler(consumePendingAction)(
    message,
    sendResponse
  )
}
