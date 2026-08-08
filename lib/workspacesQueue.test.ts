import { beforeEach, describe, expect, it, vi } from "vitest"

import * as storageModule from "~core/storage"
import { withGlobalStorageWriteBarrier } from "~lib/storageQueues"
import { applyWorkspacesUpdate } from "~lib/workspacesQueue"

vi.mock("~core/storage", () => ({
  loadWorkspaces: vi.fn(),
  saveWorkspaces: vi.fn()
}))

describe("workspacesQueue", () => {
  const loadWorkspaces = vi.mocked(storageModule.loadWorkspaces)
  const saveWorkspaces = vi.mocked(storageModule.saveWorkspaces)

  beforeEach(() => {
    vi.clearAllMocks()
    loadWorkspaces.mockResolvedValue([])
  })

  it("should serialize updates", async () => {
    const executionOrder: number[] = []

    const update1 = vi.fn(async (workspaces) => {
      executionOrder.push(1)
      await new Promise((resolve) => setTimeout(resolve, 10))
      return workspaces
    })

    const update2 = vi.fn(async (workspaces) => {
      executionOrder.push(2)
      return workspaces
    })

    await Promise.all([
      applyWorkspacesUpdate(update1),
      applyWorkspacesUpdate(update2)
    ])

    expect(executionOrder).toEqual([1, 2])
  })

  it("should pass updated workspaces to updater", async () => {
    const initialWorkspaces = [{ id: "w1" }] as any
    loadWorkspaces.mockResolvedValue(initialWorkspaces)

    const update = vi.fn((workspaces) => {
      return [...workspaces, { id: "new-id" }]
    })

    await applyWorkspacesUpdate(update)

    expect(update).toHaveBeenCalledWith(initialWorkspaces)
  })

  it("should save updated workspaces", async () => {
    const newWorkspaces = [{ id: "w1" }] as any
    const update = vi.fn(() => newWorkspaces)

    await applyWorkspacesUpdate(update)

    expect(saveWorkspaces).toHaveBeenCalledWith(newWorkspaces)
  })

  it("should skip storage writes when updater returns the current reference", async () => {
    const currentWorkspaces = [{ id: "w1" }] as any
    loadWorkspaces.mockResolvedValue(currentWorkspaces)

    const result = await applyWorkspacesUpdate((current) => current)

    expect(result).toBe(currentWorkspaces)
    expect(saveWorkspaces).not.toHaveBeenCalled()
  })

  it("should preserve concurrent queued writes against the latest saved state", async () => {
    let storedWorkspaces: Array<{ id: string }> = []
    loadWorkspaces.mockImplementation(async () => storedWorkspaces as any)
    saveWorkspaces.mockImplementation(async (next) => {
      storedWorkspaces = next as Array<{ id: string }>
    })

    await Promise.all([
      applyWorkspacesUpdate(async (current) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return [...current, { id: "first" } as any]
      }),
      applyWorkspacesUpdate((current) => [...current, { id: "second" } as any])
    ])

    expect(storedWorkspaces.map((workspace) => workspace.id)).toEqual([
      "first",
      "second"
    ])
  })

  it("should block new workspace writes while a global barrier is active", async () => {
    let releaseBarrier: () => void = () => undefined
    const barrierHold = new Promise<void>((resolve) => {
      releaseBarrier = resolve
    })
    const events: string[] = []
    const barrier = withGlobalStorageWriteBarrier(async () => {
      events.push("barrier-start")
      await barrierHold
      events.push("barrier-end")
    })

    await vi.waitFor(() => expect(events).toEqual(["barrier-start"]))
    const update = applyWorkspacesUpdate((current) => {
      events.push("workspace-update")
      return current
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events).toEqual(["barrier-start"])

    releaseBarrier()
    await Promise.all([barrier, update])
    expect(events).toEqual(["barrier-start", "barrier-end", "workspace-update"])
  })
})
