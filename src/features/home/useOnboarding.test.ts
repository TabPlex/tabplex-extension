import { describe, expect, it } from "vitest"

import type { OnboardingState } from "~core/types"

import { shouldStartOnboardingSeed } from "./useOnboarding"

const createSeedingState = (
  overrides: Partial<OnboardingState> = {}
): OnboardingState => ({
  version: 1,
  status: "seeding",
  dismissed: false,
  seededAt: 1_000,
  autoWorkspaceId: null,
  guideWorkspaceId: null,
  seedRunId: "seed-other",
  ...overrides
})

describe("shouldStartOnboardingSeed", () => {
  it("does not start another seed while a fresh seed is owned by another page", () => {
    expect(
      shouldStartOnboardingSeed({
        state: createSeedingState(),
        localSeedRunId: null,
        now: 2_000,
        staleMs: 30_000
      })
    ).toBe(false)
  })

  it("allows takeover when another seed is stale", () => {
    expect(
      shouldStartOnboardingSeed({
        state: createSeedingState(),
        localSeedRunId: null,
        now: 40_000,
        staleMs: 30_000
      })
    ).toBe(true)
  })
})
