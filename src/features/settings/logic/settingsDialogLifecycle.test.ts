import { describe, expect, it, vi } from "vitest"

import { requestSettingsDialogClose } from "./settingsDialogLifecycle"

describe("requestSettingsDialogClose", () => {
  it("flushes pending settings before closing", async () => {
    const order: string[] = []
    const closed = await requestSettingsDialogClose({
      flushPendingChanges: async () => {
        order.push("flush")
      },
      close: () => order.push("close"),
      onFlushError: vi.fn()
    })

    expect(closed).toBe(true)
    expect(order).toEqual(["flush", "close"])
  })

  it("keeps the dialog open when the pending write fails", async () => {
    const close = vi.fn()
    const onFlushError = vi.fn()
    const error = new Error("settings write failed")

    const closed = await requestSettingsDialogClose({
      flushPendingChanges: async () => {
        throw error
      },
      close,
      onFlushError
    })

    expect(closed).toBe(false)
    expect(close).not.toHaveBeenCalled()
    expect(onFlushError).toHaveBeenCalledWith(error)
  })
})
