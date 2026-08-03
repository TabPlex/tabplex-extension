import { beforeEach, describe, expect, it, vi } from "vitest"

import { handleWorkspaceSwitchMessage } from "./workspace"

const { clearCurrentWindowWorkspace, discardWorkspaceSwitchRecovery } =
  vi.hoisted(() => ({
    clearCurrentWindowWorkspace: vi.fn(),
    discardWorkspaceSwitchRecovery: vi.fn()
  }))

vi.mock("../../workspaceController", () => ({
  clearCurrentWindowWorkspace,
  discardWorkspaceSwitchRecovery,
  requestWorkspaceSwitch: vi.fn()
}))

describe("workspace switch recovery message", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("requires explicit confirmation before discarding a recovery journal", () => {
    const sendResponse = vi.fn()

    const keepAlive = handleWorkspaceSwitchMessage(
      {
        _tabplex: true,
        type: "workspace-switch",
        action: "discard-recovery",
        confirm: false
      },
      sendResponse
    )

    expect(keepAlive).toBe(true)
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: "workspace-switch-recovery-confirmation-required"
    })
    expect(discardWorkspaceSwitchRecovery).not.toHaveBeenCalled()
  })

  it("forwards a confirmed keep-tabs-and-unlock action", async () => {
    discardWorkspaceSwitchRecovery.mockResolvedValue(true)
    const sendResponse = vi.fn()

    const keepAlive = handleWorkspaceSwitchMessage(
      {
        _tabplex: true,
        type: "workspace-switch",
        action: "discard-recovery",
        confirm: true
      },
      sendResponse
    )

    expect(keepAlive).toBe(true)
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        discarded: true
      })
    )
    expect(discardWorkspaceSwitchRecovery).toHaveBeenCalledWith(true)
  })

  it("clears active ownership through the serialized controller transaction", async () => {
    clearCurrentWindowWorkspace.mockResolvedValue(undefined)
    const sendResponse = vi.fn()

    const keepAlive = handleWorkspaceSwitchMessage(
      {
        _tabplex: true,
        type: "workspace-switch",
        workspaceId: null
      },
      sendResponse
    )

    expect(keepAlive).toBe(true)
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ ok: true })
    )
    expect(clearCurrentWindowWorkspace).toHaveBeenCalledTimes(1)
  })
})
