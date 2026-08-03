import { describe, expect, it } from "vitest"

import {
  isWorkspaceSwitchInProgressError,
  isWorkspaceSwitchTabsStillLoadingError
} from "./workspaceSwitchErrors"

describe("isWorkspaceSwitchInProgressError", () => {
  it("recognizes direct and wrapped in-progress failures", () => {
    expect(
      isWorkspaceSwitchInProgressError(
        new Error("workspace-switch-in-progress")
      )
    ).toBe(true)
    expect(
      isWorkspaceSwitchInProgressError("Error: workspace-switch-in-progress")
    ).toBe(true)
    expect(
      isWorkspaceSwitchInProgressError({
        message: "workspace-switch-in-progress"
      })
    ).toBe(true)
  })

  it("keeps real switch failures distinct", () => {
    expect(isWorkspaceSwitchInProgressError(new Error("tab-open-failed"))).toBe(
      false
    )
    expect(isWorkspaceSwitchInProgressError(null)).toBe(false)
  })
})

describe("isWorkspaceSwitchTabsStillLoadingError", () => {
  it.each([
    "workspace-window-tabs-busy",
    "workspace-autosave-tabs-changed-during-capture"
  ])("recognizes the transient switch state %s", (errorCode) => {
    expect(isWorkspaceSwitchTabsStillLoadingError(new Error(errorCode))).toBe(
      true
    )
    expect(isWorkspaceSwitchTabsStillLoadingError(`Error: ${errorCode}`)).toBe(
      true
    )
    expect(isWorkspaceSwitchTabsStillLoadingError({ message: errorCode })).toBe(
      true
    )
  })

  it("keeps unverifiable tabs and real switch failures distinct", () => {
    expect(
      isWorkspaceSwitchTabsStillLoadingError(
        new Error("workspace-window-tabs-unverifiable")
      )
    ).toBe(false)
    expect(
      isWorkspaceSwitchTabsStillLoadingError(new Error("tab-open-failed"))
    ).toBe(false)
    expect(isWorkspaceSwitchTabsStillLoadingError(null)).toBe(false)
  })
})
