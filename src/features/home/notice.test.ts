import { describe, expect, it, vi } from "vitest"

import { createNoticeController } from "./notice"

describe("createNoticeController", () => {
  it("shows notice and clears after ttl", () => {
    vi.useFakeTimers()
    const controller = createNoticeController({ ttlMs: 2500 })
    let current: any = null
    controller.subscribe((value) => {
      current = value
    })

    controller.show({ kind: "workspace-trashed", name: "Alpha" })
    expect(current?.name).toBe("Alpha")

    vi.advanceTimersByTime(2499)
    expect(current?.name).toBe("Alpha")

    vi.advanceTimersByTime(1)
    expect(current).toBe(null)
    controller.dispose()
    vi.useRealTimers()
  })

  it("resets ttl on subsequent show", () => {
    vi.useFakeTimers()
    const controller = createNoticeController({ ttlMs: 2500 })
    let current: any = null
    controller.subscribe((value) => {
      current = value
    })

    controller.show({ kind: "workspace-trashed", name: "A" })
    vi.advanceTimersByTime(2000)
    controller.show({ kind: "workspace-trashed", name: "B" })
    vi.advanceTimersByTime(2000)
    expect(current?.name).toBe("B")

    vi.advanceTimersByTime(500)
    expect(current).toBe(null)
    controller.dispose()
    vi.useRealTimers()
  })

  it("clears timeline-restored notice after ttl", () => {
    vi.useFakeTimers()
    const controller = createNoticeController({ ttlMs: 2500 })
    let current: any = null
    controller.subscribe((value) => {
      current = value
    })

    controller.show({
      kind: "timeline-restored",
      restoredAt: 1700000000000,
      addedCount: 2,
      removedCount: 1
    })
    expect(current?.kind).toBe("timeline-restored")

    vi.advanceTimersByTime(2500)
    expect(current).toBe(null)
    controller.dispose()
    vi.useRealTimers()
  })
})
