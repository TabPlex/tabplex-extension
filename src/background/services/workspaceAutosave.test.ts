import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TabSpec, Workspace, WorkspaceWindowBindingMap } from "~core/types"

import {
  flushAllWorkspaceWindowAutosaves,
  flushWorkspaceWindowAutosave,
  noteWorkspaceWindowMutation,
  resetWorkspaceAutosaveRuntime,
  resumeWorkspaceWindowAutosave,
  suppressWorkspaceWindowAutosave
} from "./workspaceAutosave"
import { captureWorkspaceWindowTabs } from "./workspaceWindowTabs"

const state = vi.hoisted(() => ({
  bindings: {} as WorkspaceWindowBindingMap,
  liveTabs: new Map<number, TabSpec[]>(),
  workspaces: [] as Workspace[]
}))

vi.mock("~core/storage", () => ({
  getWorkspaceWindowBinding: vi.fn(async (windowId: number) =>
    structuredClone(state.bindings[String(windowId)] ?? null)
  ),
  loadWorkspaceWindowBindings: vi.fn(async () =>
    structuredClone(state.bindings)
  ),
  setWorkspaceWindowBinding: vi.fn(),
  updateWorkspaceWindowBindings: vi.fn(async (updater) => {
    state.bindings = await updater(structuredClone(state.bindings))
    return structuredClone(state.bindings)
  })
}))

vi.mock("~lib/workspacesQueue", () => ({
  loadWorkspacesSnapshot: vi.fn(async () => structuredClone(state.workspaces)),
  applyWorkspacesUpdate: vi.fn(async (updater) => {
    const next = await updater(state.workspaces)
    state.workspaces = next
    return next
  })
}))

vi.mock("./workspaceWindowTabs", () => ({
  captureWorkspaceWindowTabs: vi.fn(async ({ windowId }) =>
    structuredClone(state.liveTabs.get(windowId) ?? [])
  )
}))

const workspace = (tabs: TabSpec[]): Workspace => ({
  id: "shared",
  name: "Shared",
  createdAt: 1,
  tabs,
  tabsRevision: 0,
  history: []
})

describe("workspaceAutosave", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWorkspaceAutosaveRuntime()
    state.workspaces = [workspace([{ url: "https://old.example" }])]
    state.bindings = {
      "7": {
        workspaceId: "shared",
        tabsRevision: 0,
        updatedAt: 1
      },
      "8": {
        workspaceId: "shared",
        tabsRevision: 0,
        updatedAt: 1
      }
    }
    state.liveTabs = new Map([
      [7, [{ url: "https://from-a.example" }]],
      [8, [{ url: "https://from-b.example" }]]
    ])
  })

  it("saves only the changed window and makes other copies stale", async () => {
    await expect(flushWorkspaceWindowAutosave(7)).resolves.toEqual({
      status: "saved",
      workspaceId: "shared"
    })

    expect(state.workspaces[0].tabs).toEqual([
      expect.objectContaining({ url: "https://from-a.example" })
    ])
    expect(state.workspaces[0].tabsRevision).toBe(1)
    expect(state.bindings["7"]).toMatchObject({
      workspaceId: "shared",
      tabsRevision: 1,
      stale: false
    })
    expect(state.bindings["8"]).toMatchObject({
      workspaceId: "shared",
      tabsRevision: 0,
      stale: true
    })
  })

  it("never lets a stale window overwrite the canonical collection", async () => {
    state.workspaces[0] = {
      ...state.workspaces[0],
      tabs: [{ url: "https://newest.example" }],
      tabsRevision: 1
    }
    state.bindings["8"].stale = true

    await expect(flushWorkspaceWindowAutosave(8)).resolves.toEqual({
      status: "stale",
      workspaceId: "shared"
    })

    expect(state.workspaces[0].tabs).toEqual([
      { url: "https://newest.example" }
    ])
    expect(captureWorkspaceWindowTabs).not.toHaveBeenCalled()
  })

  it("revalidates the canonical revision after capturing outside the write queue", async () => {
    vi.mocked(captureWorkspaceWindowTabs).mockImplementationOnce(async () => {
      state.workspaces[0] = {
        ...state.workspaces[0],
        tabs: [{ url: "https://newer.example" }],
        tabsRevision: 1
      }
      return [{ url: "https://captured.example" }] as Awaited<
        ReturnType<typeof captureWorkspaceWindowTabs>
      >
    })

    await expect(flushWorkspaceWindowAutosave(7)).resolves.toEqual({
      status: "stale",
      workspaceId: "shared"
    })

    expect(state.workspaces[0].tabs).toEqual([{ url: "https://newer.example" }])
    expect(state.bindings["7"].stale).toBe(true)
  })

  it("does not stale another window when nothing changed", async () => {
    state.liveTabs.set(7, [{ url: "https://old.example" }])

    await expect(flushWorkspaceWindowAutosave(7)).resolves.toEqual({
      status: "unchanged",
      workspaceId: "shared"
    })

    expect(state.bindings["8"].stale).toBeUndefined()
    expect(state.workspaces[0].tabsRevision).toBe(0)
  })

  it("requeues a suppressed mutation after a capture race", async () => {
    let firstCapture = true
    vi.mocked(captureWorkspaceWindowTabs).mockImplementation(
      async ({ windowId }) => {
        if (firstCapture) {
          firstCapture = false
          noteWorkspaceWindowMutation(windowId)
        }
        return structuredClone(state.liveTabs.get(windowId) ?? []) as Awaited<
          ReturnType<typeof captureWorkspaceWindowTabs>
        >
      }
    )

    suppressWorkspaceWindowAutosave(7)
    await expect(flushWorkspaceWindowAutosave(7)).rejects.toThrow(
      "workspace-autosave-tabs-changed-during-capture"
    )

    resumeWorkspaceWindowAutosave(7)
    await flushAllWorkspaceWindowAutosaves()

    expect(state.workspaces[0].tabs).toEqual([
      expect.objectContaining({ url: "https://from-a.example" })
    ])
    expect(state.workspaces[0].tabsRevision).toBe(1)
    expect(state.bindings["7"]).toMatchObject({
      tabsRevision: 1,
      stale: false
    })
  })

  it("does not warn while window tabs are intentionally busy", async () => {
    vi.mocked(captureWorkspaceWindowTabs).mockRejectedValueOnce(
      new Error("workspace-window-tabs-busy")
    )
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    try {
      noteWorkspaceWindowMutation(7)
      await vi.waitFor(() =>
        expect(captureWorkspaceWindowTabs).toHaveBeenCalledTimes(1)
      )
      await Promise.resolve()
      await Promise.resolve()

      expect(warn).not.toHaveBeenCalled()
      expect(state.workspaces[0].tabs).toEqual([{ url: "https://old.example" }])
    } finally {
      warn.mockRestore()
    }
  })
})
