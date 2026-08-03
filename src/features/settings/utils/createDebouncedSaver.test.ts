import { describe, expect, it, vi } from "vitest"

import { createDebouncedSaver } from "./createDebouncedSaver"

describe("createDebouncedSaver", () => {
  it("coalesces rapid updates and only persists the latest value", async () => {
    vi.useFakeTimers()
    const persist = vi.fn().mockResolvedValue(undefined)
    const saver = createDebouncedSaver<string>(persist, 300)

    saver.enqueue("#111111")
    saver.enqueue("#222222")
    saver.enqueue("#333333")

    await vi.advanceTimersByTimeAsync(299)
    expect(persist).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith("#333333")

    vi.useRealTimers()
  })

  it("flush persists immediately and cancels delayed timer", async () => {
    vi.useFakeTimers()
    const persist = vi.fn().mockResolvedValue(undefined)
    const saver = createDebouncedSaver<string>(persist, 300)

    saver.enqueue("#ABCDEF")
    await saver.flush()

    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith("#ABCDEF")

    await vi.advanceTimersByTimeAsync(300)
    expect(persist).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it("cancel drops pending value", async () => {
    vi.useFakeTimers()
    const persist = vi.fn().mockResolvedValue(undefined)
    const saver = createDebouncedSaver<string>(persist, 300)

    saver.enqueue("#123456")
    saver.cancel()

    await vi.advanceTimersByTimeAsync(300)
    expect(persist).not.toHaveBeenCalled()

    vi.useRealTimers()
  })
})
