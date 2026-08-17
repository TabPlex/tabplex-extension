import { describe, expect, it } from "vitest"

import { isWorkspaceWindowLoading } from "./workspaceLoadingState"

describe("isWorkspaceWindowLoading", () => {
  const activeJob = {
    runId: "warmup-1",
    windowId: 7,
    workspaceId: "workspace-1",
    updatedAt: 123
  }

  it("recognizes a warmup job owned by the current window", () => {
    expect(isWorkspaceWindowLoading({ 7: activeJob }, 7)).toBe(true)
  })

  it("does not lock another window or malformed stale data", () => {
    expect(isWorkspaceWindowLoading({ 7: activeJob }, 8)).toBe(false)
    expect(
      isWorkspaceWindowLoading(
        { 7: { ...activeJob, runId: "", updatedAt: "invalid" } },
        7
      )
    ).toBe(false)
  })
})
