import { describe, expect, it, vi } from "vitest"

import { STORAGE_KEYS } from "~core/types"

import {
  createPendingActionConsumer,
  createPendingActionMessageHandler
} from "./pendingAction"

const immediateLock = async <T>(task: () => Promise<T>) => task()

describe("pending action consumer", () => {
  it("removes only the action id the page actually handled", async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const consume = createPendingActionConsumer({
      storage: {
        get: vi.fn().mockResolvedValue({
          [STORAGE_KEYS.PENDING_ACTION]: { id: "newer" }
        }),
        remove
      } as any,
      withLock: immediateLock
    })

    await expect(consume("older")).resolves.toBe(false)
    expect(remove).not.toHaveBeenCalled()
    await expect(consume("newer")).resolves.toBe(true)
    expect(remove).toHaveBeenCalledWith(STORAGE_KEYS.PENDING_ACTION)
  })

  it("does not let a legacy id-less acknowledgement delete a newer action", async () => {
    const remove = vi.fn()
    const consume = createPendingActionConsumer({
      storage: {
        get: vi.fn().mockResolvedValue({
          [STORAGE_KEYS.PENDING_ACTION]: { id: "current" }
        }),
        remove
      } as any,
      withLock: immediateLock
    })

    await expect(consume()).resolves.toBe(false)
    expect(remove).not.toHaveBeenCalled()
  })

  it("keeps the runtime message channel alive through acknowledgement", async () => {
    const consume = vi.fn().mockResolvedValue(true)
    const handler = createPendingActionMessageHandler(consume)
    let response: unknown

    const keepAlive = handler(
      {
        _tabplex: true,
        type: "pending-action-consume",
        id: "handled"
      },
      (value) => {
        response = value
      }
    )

    expect(keepAlive).toBe(true)
    await vi.waitFor(() =>
      expect(response).toEqual({ ok: true, consumed: true })
    )
  })
})
