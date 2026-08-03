// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useWorkspaceSwitchGuard } from "./useWorkspaceSwitchGuard"

describe("useWorkspaceSwitchGuard", () => {
  it("locks immediately so a second switch cannot enter before rerender", () => {
    const { result } = renderHook(() => useWorkspaceSwitchGuard(false))

    act(() => {
      expect(result.current.acquire()).toBe(true)
      expect(result.current.acquire()).toBe(false)
    })

    expect(result.current.isLocked).toBe(true)

    act(() => result.current.release())
    expect(result.current.isLocked).toBe(false)
  })

  it("respects a switch reported by the background state", () => {
    const { result, rerender } = renderHook(
      ({ externallyLocked }) => useWorkspaceSwitchGuard(externallyLocked),
      { initialProps: { externallyLocked: false } }
    )

    rerender({ externallyLocked: true })

    expect(result.current.isLocked).toBe(true)
    expect(result.current.isLockedNow()).toBe(true)
    expect(result.current.acquire()).toBe(false)
  })

  it("lets the latest switch intent replace an in-flight switch", () => {
    const { result } = renderHook(() => useWorkspaceSwitchGuard(true))

    let firstIntent: number | null = null
    let latestIntent: number | null = null
    act(() => {
      firstIntent = result.current.acquireLatest()
      latestIntent = result.current.acquireLatest()
    })

    expect(firstIntent).not.toBeNull()
    expect(latestIntent).not.toBeNull()
    expect(result.current.isLatest(firstIntent!)).toBe(false)
    expect(result.current.isLatest(latestIntent!)).toBe(true)

    act(() => {
      expect(result.current.releaseLatest(firstIntent!)).toBe(false)
    })
    expect(result.current.isLocked).toBe(true)

    act(() => {
      expect(result.current.releaseLatest(latestIntent!)).toBe(true)
    })
  })
})
