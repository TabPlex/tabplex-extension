import { beforeEach, describe, expect, it, vi } from "vitest"

import { handleWorkspaceWindowOperationMessage } from "./workspaceWindow"

const controller = vi.hoisted(() => ({
  captureWorkspaceWindowNow: vi.fn(),
  findWorkspaceTabInCurrentWindow: vi.fn(),
  runWorkspaceWindowOperation: vi.fn()
}))

vi.mock("../../workspaceController", () => controller)

const dispatch = async (message: Record<string, unknown>) => {
  let response: unknown
  const keepAlive = handleWorkspaceWindowOperationMessage(
    {
      _tabplex: true,
      type: "workspace-window-operation",
      ...message
    } as any,
    (value) => {
      response = value
    }
  )
  await vi.waitFor(() => expect(response).toBeDefined())
  return { keepAlive, response }
}

const setupChrome = () => {
  const chromeMock = {
    tabs: {
      create: vi.fn(),
      get: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
      update: vi.fn()
    },
    windows: {
      update: vi.fn()
    }
  }
  ;(globalThis as any).chrome = chromeMock
  return chromeMock
}

describe("workspace window message handler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupChrome()
    controller.captureWorkspaceWindowNow.mockResolvedValue(undefined)
    controller.findWorkspaceTabInCurrentWindow.mockResolvedValue(undefined)
    controller.runWorkspaceWindowOperation.mockImplementation(
      async (_workspaceId, _windowId, task) =>
        task({
          windowId: 7,
          assertStillBound: vi.fn().mockResolvedValue(undefined)
        })
    )
  })

  it("creates a safe tab only in the explicit source window", async () => {
    const chromeMock = setupChrome()
    chromeMock.tabs.create.mockResolvedValue({ id: 21, windowId: 7 })

    const { response } = await dispatch({
      operation: "open-tab",
      workspaceId: "workspace-a",
      preferredWindowId: 7,
      tab: { url: "https://open.example" }
    })

    expect(controller.runWorkspaceWindowOperation).toHaveBeenCalledWith(
      "workspace-a",
      7,
      expect.any(Function)
    )
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      windowId: 7,
      url: "https://open.example",
      active: true
    })
    expect(response).toEqual({ ok: true, created: true, tabId: 21 })
  })

  it("removes a newly created tab if the window binding changes", async () => {
    const chromeMock = setupChrome()
    chromeMock.tabs.create.mockResolvedValue({ id: 21, windowId: 7 })
    controller.runWorkspaceWindowOperation.mockImplementation(
      async (_workspaceId, _windowId, task) =>
        task({
          windowId: 7,
          assertStillBound: vi
            .fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("binding-changed"))
        })
    )
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    try {
      const { response } = await dispatch({
        operation: "open-tab",
        workspaceId: "workspace-a",
        preferredWindowId: 7,
        tab: { url: "https://open.example" }
      })

      expect(chromeMock.tabs.remove).toHaveBeenCalledWith(21)
      expect(response).toEqual({
        ok: false,
        error: "workspace-window-operation failed"
      })
    } finally {
      warn.mockRestore()
    }
  })

  it("focuses an exact existing tab after revalidating it", async () => {
    const chromeMock = setupChrome()
    controller.findWorkspaceTabInCurrentWindow.mockResolvedValue({ id: 9 })
    chromeMock.tabs.get.mockResolvedValue({
      id: 9,
      windowId: 7,
      url: "https://open.example"
    })

    const { response } = await dispatch({
      operation: "open-tab",
      workspaceId: "workspace-a",
      preferredWindowId: 7,
      tab: { url: "https://open.example" }
    })

    expect(chromeMock.tabs.update).toHaveBeenCalledWith(9, { active: true })
    expect(chromeMock.windows.update).toHaveBeenCalledWith(7, { focused: true })
    expect(response).toEqual({ ok: true, created: false, tabId: 9 })
  })

  it.each([
    {
      tab: { url: "javascript:alert(1)" },
      error: "invalid-workspace-window-tab"
    },
    {
      tab: { url: "https://open.example" },
      preferredWindowId: -1,
      error: "invalid-workspace-window-id"
    }
  ])("rejects invalid input before entering the window gate", async (input) => {
    const { response } = await dispatch({
      operation: "open-tab",
      workspaceId: "workspace-a",
      ...input
    })

    expect(response).toEqual({ ok: false, error: input.error })
    expect(controller.runWorkspaceWindowOperation).not.toHaveBeenCalled()
  })

  it("captures only the bound current window", async () => {
    const { response } = await dispatch({
      operation: "capture-tabs",
      workspaceId: "workspace-a",
      preferredWindowId: 7,
      skipHistory: true
    })

    expect(controller.captureWorkspaceWindowNow).toHaveBeenCalledWith(
      "workspace-a",
      7,
      { skipHistory: true }
    )
    expect(response).toEqual({ ok: true })
  })
})
