import { describe, expect, it, vi } from "vitest"

import type { OnboardingState } from "~core/types"

import { createOnboardingCoordinator } from "./onboardingCoordinator"

const createStore = (initial: OnboardingState | null = null) => {
  let state = initial
  return {
    load: vi.fn(async () => state),
    save: vi.fn(async (next: OnboardingState) => {
      state = next
    }),
    current: () => state
  }
}

describe("onboardingCoordinator", () => {
  it("serializes concurrent claims so only one popup can seed", async () => {
    const store = createStore()
    const coordinator = createOnboardingCoordinator(store)

    const [first, second] = await Promise.all([
      coordinator.claim({ runId: "run-a", now: 1_000 }),
      coordinator.claim({ runId: "run-b", now: 1_001 })
    ])

    expect(first.claimed).toBe(true)
    expect(second.claimed).toBe(false)
    expect(store.current()?.seedRunId).toBe("run-a")
  })

  it("allows a stale claim to be taken over", async () => {
    const store = createStore({
      version: 1,
      status: "seeding",
      dismissed: false,
      seededAt: 1_000,
      seedRunId: "stale",
      autoWorkspaceId: null,
      guideWorkspaceId: null
    })
    const coordinator = createOnboardingCoordinator(store, {
      staleMs: 30_000
    })

    const result = await coordinator.claim({ runId: "fresh", now: 31_001 })

    expect(result.claimed).toBe(true)
    expect(store.current()?.seedRunId).toBe("fresh")
  })

  it("only lets the current owner complete a seed", async () => {
    const store = createStore()
    const coordinator = createOnboardingCoordinator(store)
    await coordinator.claim({ runId: "owner", now: 1_000 })

    const rejected = await coordinator.complete({
      runId: "other",
      autoWorkspaceId: "auto-other",
      guideWorkspaceId: "guide-other"
    })
    const accepted = await coordinator.complete({
      runId: "owner",
      autoWorkspaceId: "auto",
      guideWorkspaceId: "guide"
    })

    expect(rejected.completed).toBe(false)
    expect(accepted.completed).toBe(true)
    expect(store.current()).toMatchObject({
      status: "ready",
      seedRunId: null,
      autoWorkspaceId: "auto",
      guideWorkspaceId: "guide"
    })
  })

  it("marks an existing user ready without overwriting an active claim", async () => {
    const store = createStore()
    const coordinator = createOnboardingCoordinator(store)

    const initialized = await coordinator.markExistingUserReady(1_000)
    const ignored = await coordinator.markExistingUserReady(2_000)

    expect(initialized.changed).toBe(true)
    expect(ignored.changed).toBe(false)
    expect(store.current()).toMatchObject({
      status: "ready",
      dismissed: true,
      seededAt: 1_000
    })
  })

  it("dismisses ready onboarding without losing seeded ids", async () => {
    const store = createStore({
      version: 1,
      status: "ready",
      dismissed: false,
      seededAt: 1_000,
      autoWorkspaceId: "auto",
      guideWorkspaceId: "guide"
    })
    const coordinator = createOnboardingCoordinator(store)

    const result = await coordinator.dismiss()

    expect(result.changed).toBe(true)
    expect(store.current()).toMatchObject({
      dismissed: true,
      autoWorkspaceId: "auto",
      guideWorkspaceId: "guide"
    })
  })

  it("makes a developer reset immediately claimable without waiting", async () => {
    const store = createStore({
      version: 1,
      status: "ready",
      dismissed: true,
      seededAt: 1_000,
      seedRunId: null,
      autoWorkspaceId: "old-auto",
      guideWorkspaceId: "old-guide"
    })
    const coordinator = createOnboardingCoordinator(store, { staleMs: 100 })

    await coordinator.resetForDeveloper(1_000)
    const claim = await coordinator.claim({ runId: "rerun", now: 1_000 })

    expect(claim.claimed).toBe(true)
    expect(store.current()).toMatchObject({
      status: "seeding",
      dismissed: false,
      seedRunId: "rerun",
      autoWorkspaceId: null,
      guideWorkspaceId: null
    })
  })
})
