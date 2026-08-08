import { beforeEach, describe, expect, it, vi } from "vitest"

import * as storageModule from "~core/storage"
import * as utilsModule from "~core/utils"

import { useWorkspaceActions } from "./useWorkspaceActions"

vi.mock("~core/storage", () => ({
  getWorkspaceWindowBinding: vi.fn(),
  loadSettings: vi.fn(),
  loadWorkspaces: vi.fn(),
  loadWorkspaceState: vi.fn()
}))

vi.mock("~core/utils", () => ({
  getCurrentWindowTabs: vi.fn(),
  normalizeUrlForMatch: vi.fn((value: string) => value),
  randomWorkspaceEmoji: vi.fn(() => "folder"),
  resolveTabUrl: vi.fn((tab: any) => tab.pendingUrl ?? tab.url ?? ""),
  uuid: vi.fn(() => "workspace-id")
}))

vi.mock("~core/utils/colors", () => ({
  colorChoices: vi.fn(() => ["#6C5CE7"])
}))

vi.mock("~lib/common", () => ({
  getNextIndexedName: vi.fn(() => "工作区 1")
}))

vi.mock("../logic/workspaceLogic", () => ({
  sanitizeTabSpecs: vi.fn((tabs) => tabs),
  sanitizeWorkspace: vi.fn((workspace) => workspace)
}))

describe("useWorkspaceActions.removeTabsFromWorkspace", () => {
  it("sends exact flat occurrence indexes instead of URL-wide deletion", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true })
    ;(globalThis as any).chrome = { runtime: { sendMessage } }

    const actions = useWorkspaceActions()
    await actions.removeTabsFromWorkspace("active-workspace", [3, 1])

    expect(sendMessage).toHaveBeenCalledWith({
      _tabplex: true,
      type: "workspaces-apply",
      op: {
        kind: "remove-tab-indexes",
        workspaceId: "active-workspace",
        tabIndexes: [3, 1]
      }
    })
  })
})

describe("useWorkspaceActions.snapshotWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends snapshot op through background message", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, result: true })
    ;(globalThis as any).chrome = {
      runtime: {
        sendMessage
      }
    }

    const actions = useWorkspaceActions()
    const result = await actions.snapshotWorkspace("workspace-1")

    expect(result).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith({
      _tabplex: true,
      type: "workspaces-apply",
      op: {
        kind: "snapshot",
        workspaceId: "workspace-1"
      }
    })
  })
})

describe("useWorkspaceActions.switchTo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("always lets the background controller resolve the latest switch intent", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true })
    ;(globalThis as any).chrome = {
      runtime: {
        sendMessage
      }
    }
    vi.mocked(storageModule.loadWorkspaceState).mockResolvedValue({
      activeWorkspaceId: "workspace-2"
    } as any)

    const actions = useWorkspaceActions()
    await actions.switchTo("workspace-2", { preferredWindowId: 9 })

    expect(storageModule.loadWorkspaceState).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledWith({
      _tabplex: true,
      type: "workspace-switch",
      workspaceId: "workspace-2",
      preferredWindowId: 9
    })
  })

  it("binds an unowned switch request to the window the user acted from", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true })
    const getCurrent = vi.fn().mockResolvedValue({ id: 17, type: "normal" })
    ;(globalThis as any).chrome = {
      runtime: {
        sendMessage
      },
      windows: {
        getCurrent
      }
    }

    const actions = useWorkspaceActions()
    await actions.switchTo("workspace-2")

    expect(getCurrent).toHaveBeenCalledWith({ populate: false })
    expect(sendMessage).toHaveBeenCalledWith({
      _tabplex: true,
      type: "workspace-switch",
      workspaceId: "workspace-2",
      preferredWindowId: 17
    })
  })
})

describe("useWorkspaceActions.updateTagFromCurrent", () => {
  it("passes capture and skipHistory through the ownership-gated operation", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true })
    const getCurrent = vi.fn().mockResolvedValue({ id: 9, type: "normal" })
    ;(globalThis as any).chrome = {
      runtime: {
        sendMessage
      },
      windows: {
        getCurrent
      }
    }
    vi.mocked(storageModule.getWorkspaceWindowBinding).mockResolvedValue({
      workspaceId: "workspace-1",
      tabsRevision: 0,
      updatedAt: 1
    })
    vi.mocked(utilsModule.getCurrentWindowTabs).mockResolvedValue([
      {
        url: "https://example.com",
        pinned: false,
        title: "Example",
        favIconUrl: "https://example.com/favicon.ico"
      }
    ] as any)

    const actions = useWorkspaceActions()
    await actions.updateWorkspaceFromCurrent("workspace-1", {
      skipHistory: true
    })

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        _tabplex: true,
        type: "workspace-window-operation",
        operation: "capture-tabs",
        workspaceId: "workspace-1",
        skipHistory: true
      })
    )
  })
})

describe("useWorkspaceActions.createWorkspace", () => {
  const loadSettings = vi.mocked(storageModule.loadSettings)

  beforeEach(() => {
    vi.clearAllMocks()
    loadSettings.mockResolvedValue({ accentColor: "#6C5CE7" } as any)
    vi.mocked(storageModule.loadWorkspaces).mockResolvedValue([])
  })

  it("creates an empty workspace and activates it in the explicit window", async () => {
    const created = {
      id: "workspace-created",
      name: "工作区 1",
      createdAt: 1,
      tabs: []
    }
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, result: created })
      .mockResolvedValueOnce({ ok: true })
    ;(globalThis as any).chrome = {
      runtime: { sendMessage }
    }

    const result = await useWorkspaceActions().createWorkspace({
      activate: true,
      preferredWindowId: 7,
      seedFromCurrentWindow: false
    })

    expect(utilsModule.getCurrentWindowTabs).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        _tabplex: true,
        type: "workspaces-apply",
        preferredWindowId: 7,
        op: expect.objectContaining({
          kind: "create",
          workspace: expect.objectContaining({ tabs: [] })
        })
      })
    )
    expect(sendMessage).toHaveBeenNthCalledWith(2, {
      _tabplex: true,
      type: "workspace-switch",
      workspaceId: "workspace-created",
      preferredWindowId: 7
    })
    expect(result.activation).toEqual({ status: "activated" })
  })

  it("captures only the explicit current window and ignores legacy ownership", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true })
    ;(globalThis as any).chrome = {
      runtime: {
        sendMessage
      }
    }

    vi.mocked(utilsModule.getCurrentWindowTabs).mockResolvedValueOnce([
      {
        url: "https://example.com",
        pinned: false,
        title: "Example",
        favIconUrl: "https://example.com/favicon.ico"
      }
    ] as any)

    const actions = useWorkspaceActions()
    await actions.createWorkspace({ name: "工作区A", activate: false })

    expect(utilsModule.getCurrentWindowTabs).toHaveBeenCalledTimes(1)
    expect(utilsModule.getCurrentWindowTabs).toHaveBeenCalledWith(undefined)
    expect(storageModule.loadWorkspaceState).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        _tabplex: true,
        type: "workspaces-apply",
        op: expect.objectContaining({
          kind: "create",
          workspace: expect.objectContaining({
            tabs: [
              expect.objectContaining({
                url: "https://example.com",
                pinned: false
              })
            ]
          })
        })
      })
    )
  })

  it("returns partial success when activation fails after the record is durable", async () => {
    const created = {
      id: "workspace-created",
      name: "工作区A",
      createdAt: 1,
      tabs: []
    }
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, result: created })
      .mockResolvedValueOnce({
        ok: false,
        error: "workspace-switch-in-progress"
      })
    ;(globalThis as any).chrome = {
      runtime: { sendMessage }
    }

    const result = await useWorkspaceActions().createWorkspace({
      name: "工作区A",
      activate: true,
      preferredWindowId: 7,
      seedFromCurrentWindow: false
    })

    expect(result).toEqual({
      workspace: created,
      activation: {
        status: "failed",
        error: "workspace-switch-in-progress"
      }
    })
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })
})
