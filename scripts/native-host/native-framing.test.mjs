import { describe, expect, it, vi } from "vitest"

import {
  createNativeMessageDecoder,
  encodeNativeMessage
} from "./native-framing.mjs"
import { buildAgentRequest } from "./tabplex-agent-cli.mjs"

describe("Native Messaging framing", () => {
  it("decodes framed JSON across arbitrary chunks", () => {
    const onMessage = vi.fn()
    const decode = createNativeMessageDecoder({ onMessage })
    const encoded = encodeNativeMessage({ type: "ready", protocolVersion: 1 })

    decode(encoded.subarray(0, 2))
    decode(encoded.subarray(2, 7))
    decode(encoded.subarray(7))

    expect(onMessage).toHaveBeenCalledWith({
      type: "ready",
      protocolVersion: 1
    })
  })

  it("builds a bounded CLI request without shell interpolation", () => {
    expect(
      buildAgentRequest([
        "switchWorkspace",
        '{"workspaceId":"workspace-1"}',
        "--window-id=12"
      ])
    ).toEqual({
      _tabplexAgent: true,
      protocolVersion: 1,
      command: "switchWorkspace",
      payload: { workspaceId: "workspace-1" },
      windowId: 12
    })
    expect(() => buildAgentRequest(["unknown"])).toThrow(
      "unknown-agent-command"
    )
    expect(buildAgentRequest(["--", "getState"])).toEqual({
      _tabplexAgent: true,
      protocolVersion: 1,
      command: "getState"
    })
  })
})
