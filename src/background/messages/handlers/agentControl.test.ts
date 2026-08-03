import { describe, expect, it, vi } from "vitest"

import { createAgentControlMessageHandler } from "./agentControl"

const dispatch = async (
  action: string,
  deps = {
    sync: vi.fn(async () => ({ state: "connected" as const }))
  }
) => {
  const handler = createAgentControlMessageHandler(deps)
  let response: unknown
  const keepAlive = handler(
    { _tabplex: true, type: "agent-control", action },
    (value) => {
      response = value
    }
  )
  await vi.waitFor(() => expect(response).toBeDefined())
  return { keepAlive, response, deps }
}

describe("agent-control message handler", () => {
  it("returns the native host connection status", async () => {
    const { keepAlive, response, deps } = await dispatch("status")

    expect(keepAlive).toBe(true)
    expect(response).toEqual({ ok: true, result: { state: "connected" } })
    expect(deps.sync).toHaveBeenCalledOnce()
  })

  it("rejects unsupported actions", async () => {
    const { response, deps } = await dispatch("pair")

    expect(response).toEqual({
      ok: false,
      error: "invalid-agent-control-request"
    })
    expect(deps.sync).not.toHaveBeenCalled()
  })
})
