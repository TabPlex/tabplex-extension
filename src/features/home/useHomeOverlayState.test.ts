// @vitest-environment jsdom

import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useHomeOverlayState } from "./useHomeOverlayState"

describe("useHomeOverlayState", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/")
  })

  it("opens settings when requested by the Home URL", () => {
    window.history.replaceState({}, "", "/?panel=settings")

    const { result } = renderHook(() => useHomeOverlayState())

    expect(result.current.state.showSettings).toBe(true)
  })
})
