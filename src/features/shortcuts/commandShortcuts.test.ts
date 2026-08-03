import { afterEach, describe, expect, it, vi } from "vitest"

import { loadCommandShortcuts, openShortcutsManager } from "./commandShortcuts"

describe("loadCommandShortcuts", () => {
  afterEach(() => {
    delete (globalThis as any).chrome
    vi.restoreAllMocks()
  })

  it("returns command list when commands.getAll is available", async () => {
    ;(globalThis as any).chrome = {
      commands: {
        getAll: vi.fn((callback: (items: chrome.commands.Command[]) => void) =>
          callback([
            { name: "open-quick-switcher", shortcut: "Alt+H" },
            { shortcut: "Alt+N" }
          ])
        )
      }
    }

    const result = await loadCommandShortcuts()

    expect(result.available).toBe(true)
    expect(result.commands).toEqual([
      { name: "open-quick-switcher", shortcut: "Alt+H" }
    ])
  })

  it("returns unavailable when commands.getAll is missing", async () => {
    ;(globalThis as any).chrome = {
      commands: {}
    }

    const result = await loadCommandShortcuts()

    expect(result.available).toBe(false)
    expect(result.commands).toEqual([])
  })

  it("returns available with empty list when browser has no commands", async () => {
    ;(globalThis as any).chrome = {
      commands: {
        getAll: vi.fn((callback: (items: chrome.commands.Command[]) => void) =>
          callback([])
        )
      }
    }

    const result = await loadCommandShortcuts()

    expect(result.available).toBe(true)
    expect(result.commands).toEqual([])
  })
})

describe("openShortcutsManager", () => {
  afterEach(() => {
    delete (globalThis as any).chrome
    vi.restoreAllMocks()
  })

  it("opens chrome shortcut manager page", () => {
    const create = vi.fn()
    ;(globalThis as any).chrome = {
      tabs: { create }
    }

    openShortcutsManager()

    expect(create).toHaveBeenCalledWith({
      url: "chrome://extensions/shortcuts"
    })
  })
})
