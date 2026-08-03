import { describe, expect, it, vi } from "vitest"

import { createOnboardingMessageHandler } from "./onboarding"

const send = (
  handler: ReturnType<typeof createOnboardingMessageHandler>,
  message: Record<string, unknown>
) =>
  new Promise<unknown>((resolve) => {
    handler(
      {
        _tabplex: true,
        type: "onboarding-transition",
        ...message
      } as any,
      resolve
    )
  })

describe("onboarding message handler", () => {
  it("routes a valid claim to the coordinator", async () => {
    const coordinator = {
      claim: vi.fn(async () => ({
        claimed: true,
        state: { status: "seeding" }
      })),
      complete: vi.fn(),
      markExistingUserReady: vi.fn(),
      dismiss: vi.fn(),
      resetForDeveloper: vi.fn()
    }
    const handler = createOnboardingMessageHandler(coordinator as any)

    await expect(
      send(handler, { action: "claim", runId: "run-1", now: 123 })
    ).resolves.toEqual({
      ok: true,
      result: { claimed: true, state: { status: "seeding" } }
    })
    expect(coordinator.claim).toHaveBeenCalledWith({
      runId: "run-1",
      now: 123
    })
  })

  it("rejects malformed completion payloads before touching storage", async () => {
    const coordinator = {
      claim: vi.fn(),
      complete: vi.fn(),
      markExistingUserReady: vi.fn(),
      dismiss: vi.fn(),
      resetForDeveloper: vi.fn()
    }
    const handler = createOnboardingMessageHandler(coordinator as any)

    await expect(
      send(handler, {
        action: "complete",
        runId: "run-1",
        autoWorkspaceId: 123,
        guideWorkspaceId: null
      })
    ).resolves.toEqual({ ok: false, error: "invalid-onboarding-transition" })
    expect(coordinator.complete).not.toHaveBeenCalled()
  })
})
