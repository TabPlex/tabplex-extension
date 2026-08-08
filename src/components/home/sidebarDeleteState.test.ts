import { describe, expect, it } from "vitest"

import { isSidebarDeleteReady } from "./sidebarDeleteState"

describe("isSidebarDeleteReady", () => {
  it("returns true only when hover matches and not dragging", () => {
    expect(
      isSidebarDeleteReady({
        hoverDeleteId: "a",
        workspaceId: "a",
        isDragging: false
      })
    ).toBe(true)
    expect(
      isSidebarDeleteReady({
        hoverDeleteId: "a",
        workspaceId: "b",
        isDragging: false
      })
    ).toBe(false)
    expect(
      isSidebarDeleteReady({
        hoverDeleteId: "a",
        workspaceId: "a",
        isDragging: true
      })
    ).toBe(false)
  })
})
