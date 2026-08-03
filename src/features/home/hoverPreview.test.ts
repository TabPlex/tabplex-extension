import { describe, expect, it, vi } from "vitest"

import { createHoverPreviewController } from "./hoverPreview"

describe("createHoverPreviewController", () => {
  it("previews on enter and returns to active after leave delay", () => {
    vi.useFakeTimers()
    const calls: string[] = []
    let activeId = "active"

    const controller = createHoverPreviewController({
      getActiveId: () => activeId,
      setSelectedId: (id) => calls.push(`select:${id ?? "null"}`),
      setFollowActive: (v) => calls.push(`follow:${v}`),
      releaseDelayMs: 80
    })

    controller.enterSidebar("w1")
    controller.leaveSidebar()

    expect(calls).toEqual(["follow:false", "select:w1"])

    vi.advanceTimersByTime(79)
    expect(calls).toEqual(["follow:false", "select:w1"])

    vi.advanceTimersByTime(1)
    expect(calls).toEqual([
      "follow:false",
      "select:w1",
      "select:active",
      "follow:true"
    ])

    controller.dispose()
    vi.useRealTimers()
  })

  it("keeps preview while detail area hovered", () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const controller = createHoverPreviewController({
      getActiveId: () => "active",
      setSelectedId: (id) => calls.push(`select:${id}`),
      setFollowActive: (v) => calls.push(`follow:${v}`),
      releaseDelayMs: 80
    })

    controller.enterSidebar("w1")
    controller.enterDetail()
    controller.leaveSidebar()
    vi.advanceTimersByTime(100)

    expect(calls).toEqual(["follow:false", "select:w1"])

    controller.leaveDetail()
    vi.advanceTimersByTime(80)
    expect(calls).toEqual([
      "follow:false",
      "select:w1",
      "select:active",
      "follow:true"
    ])

    controller.dispose()
    vi.useRealTimers()
  })

  it("cancel prevents pending release", () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const controller = createHoverPreviewController({
      getActiveId: () => "active",
      setSelectedId: (id) => calls.push(`select:${id}`),
      setFollowActive: (v) => calls.push(`follow:${v}`),
      releaseDelayMs: 80
    })

    controller.enterSidebar("w1")
    controller.leaveSidebar()
    controller.cancel()
    vi.advanceTimersByTime(80)

    expect(calls).toEqual(["follow:false", "select:w1"])

    controller.dispose()
    vi.useRealTimers()
  })
})
