import { describe, expect, it, vi } from "vitest"

import {
  createAgentBackgroundActionBridge,
  invokeAgentBackgroundHandler
} from "./agentControlInternalBridge"

describe("agent control internal bridge", () => {
  it("normalizes asynchronous handler responses", async () => {
    const handler = vi.fn((_message, sendResponse) => {
      queueMicrotask(() => sendResponse({ ok: true, created: true, tabId: 12 }))
      return true
    })

    await expect(
      invokeAgentBackgroundHandler(handler, {
        _tabplex: true,
        type: "workspace-window-operation"
      })
    ).resolves.toEqual({
      ok: true,
      result: { created: true, tabId: 12 }
    })
  })

  it("forwards the explicit control window to workspace mutations", async () => {
    const workspacesApply = vi.fn((_message, sendResponse) => {
      sendResponse({ ok: true })
      return true
    })
    const passthrough = vi.fn((_message, sendResponse) => {
      sendResponse({ ok: true })
      return true
    })
    const bridge = createAgentBackgroundActionBridge({
      workspacesApply,
      workspaceStatePatch: passthrough,
      settingsApply: passthrough,
      workspaceWindowOperation: passthrough
    })

    await bridge.applyWorkspaceOperation(
      { kind: "rename", id: "docs", name: "Research" },
      17
    )

    expect(workspacesApply).toHaveBeenCalledWith(
      {
        _tabplex: true,
        type: "workspaces-apply",
        op: { kind: "rename", id: "docs", name: "Research" },
        preferredWindowId: 17
      },
      expect.any(Function)
    )
  })

  it("fails closed when a handler neither responds nor keeps the channel alive", async () => {
    const handler = vi.fn(() => undefined)

    await expect(
      invokeAgentBackgroundHandler(handler, {
        _tabplex: true,
        type: "settings-apply"
      })
    ).resolves.toEqual({
      ok: false,
      error: "agent-control-action-failed"
    })
  })
})
