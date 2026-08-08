import { describe, expect, it, vi } from "vitest"

import { createLongHoverController } from "./longHover"

describe("createLongHoverController", () => {
  it("fires after delay and cancels on leave", () => {
    vi.useFakeTimers()
    let fired = false

    const controller = createLongHoverController({ delayMs: 200 })

    controller.enter(() => {
      fired = true
    })
    vi.advanceTimersByTime(199)
    expect(fired).toBe(false)

    vi.advanceTimersByTime(1)
    expect(fired).toBe(true)

    fired = false
    controller.enter(() => {
      fired = true
    })
    controller.leave()
    vi.advanceTimersByTime(200)
    expect(fired).toBe(false)

    controller.dispose()
    vi.useRealTimers()
  })
})
