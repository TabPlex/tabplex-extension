import { describe, expect, it } from "vitest"

import {
  canCreatePopupWorkspace,
  clampPopupActiveIndex,
  movePopupActiveIndex,
  resolvePopupNavigationAction
} from "./popupNavigation"

describe("popupNavigation", () => {
  const workspaces = [{ name: "Research" }, { name: "产品 计划" }]

  it("only offers create for a non-empty name without an exact match", () => {
    expect(canCreatePopupWorkspace(workspaces, "")).toBe(false)
    expect(canCreatePopupWorkspace(workspaces, " research ")).toBe(false)
    expect(canCreatePopupWorkspace(workspaces, "产品　计划")).toBe(false)
    expect(canCreatePopupWorkspace(workspaces, "Research 2")).toBe(true)
  })

  it("wraps keyboard navigation and clamps stale indexes", () => {
    expect(movePopupActiveIndex(0, 3, "previous")).toBe(2)
    expect(movePopupActiveIndex(2, 3, "next")).toBe(0)
    expect(movePopupActiveIndex(0, 0, "next")).toBe(0)
    expect(clampPopupActiveIndex(3, 3)).toBe(0)
    expect(clampPopupActiveIndex(1, 3)).toBe(1)
  })

  it("resolves workspace and explicit create actions", () => {
    expect(resolvePopupNavigationAction(1, 2, true)).toEqual({
      type: "workspace",
      workspaceIndex: 1
    })
    expect(resolvePopupNavigationAction(2, 2, true)).toEqual({
      type: "create"
    })
    expect(resolvePopupNavigationAction(2, 2, false)).toBeNull()
  })
})
