import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import {
  captureWorkspaceWindowTabs,
  resolveNormalWindowId
} from "./workspaceWindowTabs"

const browserWindow = (
  id: number,
  type: NonNullable<chrome.windows.Window["type"]> = "normal"
): chrome.windows.Window => ({
  id,
  type,
  focused: true,
  alwaysOnTop: false,
  incognito: false
})

type GetWindow = (
  windowId: number,
  queryOptions?: chrome.windows.QueryOptions
) => Promise<chrome.windows.Window>
type GetLastFocusedWindow = (
  queryOptions?: chrome.windows.QueryOptions
) => Promise<chrome.windows.Window>

let getWindow: Mock<GetWindow>
let getLastFocusedWindow: Mock<GetLastFocusedWindow>

describe("resolveNormalWindowId", () => {
  beforeEach(() => {
    getWindow = vi.fn<GetWindow>()
    getLastFocusedWindow = vi.fn<GetLastFocusedWindow>()
    ;(globalThis as any).chrome = {
      windows: {
        get: getWindow,
        getLastFocused: getLastFocusedWindow
      }
    }
  })

  it("uses the explicit normal window", async () => {
    getWindow.mockResolvedValue(browserWindow(7))

    await expect(resolveNormalWindowId(7)).resolves.toBe(7)
    expect(getLastFocusedWindow).not.toHaveBeenCalled()
  })

  it.each([
    { error: new Error("missing"), expected: "workspace-window-missing" },
    {
      value: browserWindow(7, "popup"),
      expected: "workspace-window-not-normal"
    }
  ])("never falls back when an explicit window is invalid", async (input) => {
    if (input.error) {
      getWindow.mockRejectedValue(input.error)
    } else {
      getWindow.mockResolvedValue(input.value!)
    }

    await expect(resolveNormalWindowId(7)).rejects.toThrow(input.expected)
    expect(getLastFocusedWindow).not.toHaveBeenCalled()
  })

  it("uses the last focused normal window only when no source was supplied", async () => {
    getLastFocusedWindow.mockResolvedValue(browserWindow(8))
    getWindow.mockResolvedValue(browserWindow(8))

    await expect(resolveNormalWindowId()).resolves.toBe(8)
  })
})

describe("captureWorkspaceWindowTabs", () => {
  it("refuses to replace saved tabs when Chrome reports a blank target tab", async () => {
    ;(globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 31,
            index: 1,
            windowId: 7,
            url: "",
            pendingUrl: undefined,
            pinned: false,
            status: "loading"
          }
        ])
      },
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://tabplex/${path}`)
      }
    }

    await expect(
      captureWorkspaceWindowTabs({
        windowId: 7,
        previousTabs: [{ url: "https://saved.example" }]
      })
    ).rejects.toThrow("workspace-window-tabs-corrupt-blank")
  })

  it("keeps other unverifiable pages on the fail-closed path", async () => {
    ;(globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 32,
            index: 1,
            windowId: 7,
            url: "chrome-error://chromewebdata/",
            pendingUrl: undefined,
            pinned: false,
            status: "complete"
          }
        ])
      },
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://tabplex/${path}`)
      }
    }

    await expect(captureWorkspaceWindowTabs({ windowId: 7 })).rejects.toThrow(
      "workspace-window-tabs-unverifiable"
    )
  })
})
