import { describe, expect, it, vi } from "vitest"

import { changeAgentControlEnabled } from "./changeAgentControlEnabled"

const createDeps = () => ({
  requestPermission: vi.fn().mockResolvedValue(true),
  removePermission: vi.fn().mockResolvedValue(true),
  hasPermission: vi.fn().mockResolvedValue(false)
})

describe("changeAgentControlEnabled", () => {
  it("requests permission before persisting the enabled setting", async () => {
    const order: string[] = []
    const deps = createDeps()
    deps.requestPermission.mockImplementation(async () => {
      order.push("permission")
      return true
    })
    const persistEnabled = vi.fn(async () => {
      order.push("setting")
    })

    await expect(
      changeAgentControlEnabled(true, persistEnabled, deps)
    ).resolves.toBe("enabled")

    expect(order).toEqual(["permission", "setting"])
    expect(persistEnabled).toHaveBeenCalledWith(true)
  })

  it("keeps Agent control off when permission is denied", async () => {
    const deps = createDeps()
    deps.requestPermission.mockResolvedValue(false)
    const persistEnabled = vi.fn()

    await expect(
      changeAgentControlEnabled(true, persistEnabled, deps)
    ).resolves.toBe("permission-denied")

    expect(persistEnabled).not.toHaveBeenCalled()
  })

  it("removes a granted permission when enabling cannot be persisted", async () => {
    const deps = createDeps()
    const error = new Error("storage failed")

    await expect(
      changeAgentControlEnabled(true, vi.fn().mockRejectedValue(error), deps)
    ).rejects.toBe(error)

    expect(deps.removePermission).toHaveBeenCalledTimes(1)
  })

  it("persists the disabled state before removing permission", async () => {
    const order: string[] = []
    const deps = createDeps()
    deps.removePermission.mockImplementation(async () => {
      order.push("permission")
      return true
    })
    const persistEnabled = vi.fn(async () => {
      order.push("setting")
    })

    await expect(
      changeAgentControlEnabled(false, persistEnabled, deps)
    ).resolves.toBe("disabled")

    expect(order).toEqual(["setting", "permission"])
    expect(persistEnabled).toHaveBeenCalledWith(false)
  })

  it("reports when Chrome retains the optional permission", async () => {
    const deps = createDeps()
    deps.removePermission.mockResolvedValue(false)
    deps.hasPermission.mockResolvedValue(true)

    await expect(changeAgentControlEnabled(false, vi.fn(), deps)).resolves.toBe(
      "permission-removal-failed"
    )
  })
})
