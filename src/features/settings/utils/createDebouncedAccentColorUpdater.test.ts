import { describe, expect, it, vi } from "vitest"

import { createDebouncedAccentColorUpdater } from "./createDebouncedAccentColorUpdater"

describe("createDebouncedAccentColorUpdater", () => {
  it("debounces updates and normalizes hex color", async () => {
    vi.useFakeTimers()
    const updateSetting = vi.fn().mockResolvedValue(undefined)

    const updater = createDebouncedAccentColorUpdater(updateSetting, 120)

    const first = updater.enqueue("#abc")
    const second = updater.enqueue("#123456")

    expect(first).toBe("#AABBCC")
    expect(second).toBe("#123456")

    await vi.advanceTimersByTimeAsync(120)

    expect(updateSetting).toHaveBeenCalledTimes(1)
    expect(updateSetting).toHaveBeenCalledWith("#123456")

    vi.useRealTimers()
  })
})
