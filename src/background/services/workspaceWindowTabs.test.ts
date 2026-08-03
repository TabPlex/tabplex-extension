import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveNormalWindowId } from "./workspaceWindowTabs"

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

describe("resolveNormalWindowId", () => {
  beforeEach(() => {
    ;(globalThis as any).chrome = {
      windows: {
        get: vi.fn(),
        getLastFocused: vi.fn()
      }
    }
  })

  it("uses the explicit normal window", async () => {
    vi.mocked(chrome.windows.get).mockResolvedValue(browserWindow(7))

    await expect(resolveNormalWindowId(7)).resolves.toBe(7)
    expect(chrome.windows.getLastFocused).not.toHaveBeenCalled()
  })

  it.each([
    { error: new Error("missing"), expected: "workspace-window-missing" },
    {
      value: browserWindow(7, "popup"),
      expected: "workspace-window-not-normal"
    }
  ])("never falls back when an explicit window is invalid", async (input) => {
    if (input.error) {
      vi.mocked(chrome.windows.get).mockRejectedValue(input.error)
    } else {
      vi.mocked(chrome.windows.get).mockResolvedValue(input.value!)
    }

    await expect(resolveNormalWindowId(7)).rejects.toThrow(input.expected)
    expect(chrome.windows.getLastFocused).not.toHaveBeenCalled()
  })

  it("uses the last focused normal window only when no source was supplied", async () => {
    vi.mocked(chrome.windows.getLastFocused).mockResolvedValue(browserWindow(8))
    vi.mocked(chrome.windows.get).mockResolvedValue(browserWindow(8))

    await expect(resolveNormalWindowId()).resolves.toBe(8)
  })
})
