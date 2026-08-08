import { describe, expect, it } from "vitest"

import type { WorkspaceState } from "~core/types"

import {
  isWorkspaceSwitchInProgress,
  shouldExposeSwitchState
} from "./useWorkspaceSwitching"

const switchState = (
  overrides: Partial<NonNullable<WorkspaceState["switchState"]>> = {}
): NonNullable<WorkspaceState["switchState"]> => ({
  runId: "run-1",
  targetId: "target",
  sourceId: "source",
  windowId: 7,
  ts: 1,
  phase: "loading",
  ...overrides
})

describe("shouldExposeSwitchState", () => {
  it("expires stale progress but never hides a recovery failure", () => {
    expect(shouldExposeSwitchState(switchState(), 120_000)).toBe(false)
    expect(
      shouldExposeSwitchState(
        switchState({ phase: "recovery_failed" }),
        120_000
      )
    ).toBe(true)
  })

  it("keeps preparing and empty-workspace switches in progress", () => {
    expect(
      isWorkspaceSwitchInProgress(
        switchState({ expectedCount: 0, completedCount: 0 })
      )
    ).toBe(true)
    expect(
      isWorkspaceSwitchInProgress(
        switchState({ phase: "recovery_failed", expectedCount: 0 })
      )
    ).toBe(false)
  })
})
