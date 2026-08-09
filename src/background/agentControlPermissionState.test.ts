import { describe, expect, it, vi } from "vitest"

import { reconcileAgentControlPermissionState } from "./agentControlPermissionState"

describe("reconcileAgentControlPermissionState", () => {
  it("keeps permission absent while Agent control is disabled", async () => {
    const hasPermission = vi.fn().mockResolvedValue(false)
    const removePermission = vi.fn()
    const disable = vi.fn()

    await expect(
      reconcileAgentControlPermissionState({
        isEnabled: vi.fn().mockResolvedValue(false),
        hasPermission,
        removePermission,
        disable
      })
    ).resolves.toBe(false)

    expect(hasPermission).toHaveBeenCalledTimes(1)
    expect(removePermission).not.toHaveBeenCalled()
    expect(disable).not.toHaveBeenCalled()
  })

  it("removes a permission retained from an older required manifest", async () => {
    const removePermission = vi.fn().mockResolvedValue(true)

    await expect(
      reconcileAgentControlPermissionState({
        isEnabled: vi.fn().mockResolvedValue(false),
        hasPermission: vi.fn().mockResolvedValue(true),
        removePermission,
        disable: vi.fn()
      })
    ).resolves.toBe(false)

    expect(removePermission).toHaveBeenCalledTimes(1)
  })

  it("preserves an enabled setting with permission", async () => {
    const disable = vi.fn()

    await expect(
      reconcileAgentControlPermissionState({
        isEnabled: vi.fn().mockResolvedValue(true),
        hasPermission: vi.fn().mockResolvedValue(true),
        removePermission: vi.fn(),
        disable
      })
    ).resolves.toBe(true)

    expect(disable).not.toHaveBeenCalled()
  })

  it("disables stale state after permission is removed", async () => {
    const disable = vi.fn().mockResolvedValue(undefined)

    await expect(
      reconcileAgentControlPermissionState({
        isEnabled: vi.fn().mockResolvedValue(true),
        hasPermission: vi.fn().mockResolvedValue(false),
        removePermission: vi.fn(),
        disable
      })
    ).resolves.toBe(false)

    expect(disable).toHaveBeenCalledTimes(1)
  })
})
