import { describe, expect, it, vi } from "vitest"

import type { Workspace } from "~core/types"

import { requestAdjacentWorkspaceSwitch } from "./workspaceShortcutSwitch"

const workspace = (
  id: string,
  createdAt: number,
  options: Partial<Workspace> = {}
): Workspace => ({
  id,
  name: id,
  createdAt,
  tabs: [],
  ...options
})

describe("requestAdjacentWorkspaceSwitch", () => {
  it("requests the next live workspace instead of only patching active state", async () => {
    const requestSwitch = vi.fn().mockResolvedValue({ success: true })

    const result = await requestAdjacentWorkspaceSwitch({
      direction: "next",
      workspaces: [
        workspace("latest", 30),
        workspace("deleted", 25, { trashedAt: 50 }),
        workspace("middle", 20),
        workspace("oldest", 10)
      ],
      activeWorkspaceId: "latest",
      sortKey: "created",
      requestSwitch
    })

    expect(result).toEqual({ success: true })
    expect(requestSwitch).toHaveBeenCalledWith("middle")
  })

  it("wraps to the last workspace when moving previous from the first", async () => {
    const requestSwitch = vi.fn().mockResolvedValue({ success: true })

    const result = await requestAdjacentWorkspaceSwitch({
      direction: "prev",
      workspaces: [workspace("new", 20), workspace("old", 10)],
      activeWorkspaceId: "new",
      sortKey: "created",
      requestSwitch
    })

    expect(result).toEqual({ success: true })
    expect(requestSwitch).toHaveBeenCalledWith("old")
  })

  it("does nothing when there is no distinct live workspace", async () => {
    const requestSwitch = vi.fn()

    const targetId = await requestAdjacentWorkspaceSwitch({
      direction: "next",
      workspaces: [workspace("only", 1)],
      activeWorkspaceId: "only",
      sortKey: "created",
      requestSwitch
    })

    expect(targetId).toBeNull()
    expect(requestSwitch).not.toHaveBeenCalled()
  })

  it("propagates a failed switch result to the shortcut caller", async () => {
    const requestSwitch = vi
      .fn()
      .mockResolvedValue({ success: false, reason: "recovery_required" })

    const result = await requestAdjacentWorkspaceSwitch({
      direction: "next",
      workspaces: [workspace("new", 20), workspace("old", 10)],
      activeWorkspaceId: "new",
      sortKey: "created",
      requestSwitch
    })

    expect(result).toEqual({
      success: false,
      reason: "recovery_required"
    })
  })
})
