import { describe, expect, it, vi } from "vitest"

import {
  dedupeAndPinHome,
  getCurrentNormalWindowId,
  isHomeUrl,
  openAndPinHomeInWindow,
  openPinnedHomeAfterInstall,
  registerHomeNavigationListener
} from "./homeTabService"

describe("isHomeUrl", () => {
  it("matches only the explicit Home mode", () => {
    const base = "chrome-extension://id/popup.html"

    expect(isHomeUrl(`${base}?mode=home&v=1`, base)).toBe(true)
    expect(isHomeUrl(base, base)).toBe(false)
    expect(isHomeUrl(`${base}?mode=other`, base)).toBe(false)
  })

  it("does not rewrite another extension route while ensuring Home", async () => {
    const base = "chrome-extension://id/popup.html"
    const otherRoute = `${base}?mode=other`
    const tabs = {
      query: vi
        .fn()
        .mockResolvedValue([
          { id: 9, windowId: 1, url: otherRoute, pinned: false }
        ]),
      update: vi.fn(),
      remove: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 10, windowId: 1 })
    }
    ;(globalThis as any).chrome = {
      tabs,
      windows: { update: vi.fn() }
    }

    await dedupeAndPinHome(1, base, `${base}?mode=home&v=1`, false)

    expect(tabs.update).not.toHaveBeenCalledWith(
      9,
      expect.objectContaining({ url: expect.any(String) })
    )
    expect(tabs.remove).not.toHaveBeenCalledWith(expect.arrayContaining([9]))
    expect(tabs.create).toHaveBeenCalledWith({
      windowId: 1,
      url: `${base}?mode=home&v=1`,
      pinned: true,
      active: false
    })
  })

  it("does not mutate an up-to-date pinned Home during an inactive ensure", async () => {
    const base = "chrome-extension://id/popup.html"
    const homeUrl = `${base}?mode=home&v=1`
    const tabs = {
      query: vi.fn().mockResolvedValue([
        {
          id: 9,
          windowId: 1,
          url: homeUrl,
          pinned: true,
          active: true
        }
      ]),
      update: vi.fn(),
      remove: vi.fn(),
      create: vi.fn()
    }
    ;(globalThis as any).chrome = {
      runtime: { getManifest: () => ({ version: "1" }) },
      tabs,
      windows: { update: vi.fn() }
    }

    await dedupeAndPinHome(1, base, homeUrl, false)

    expect(tabs.update).not.toHaveBeenCalled()
    expect(tabs.create).not.toHaveBeenCalled()
  })

  it("repairs Home without deactivating the current tab", async () => {
    const base = "chrome-extension://id/popup.html"
    const homeUrl = `${base}?mode=home&v=1`
    const tabs = {
      query: vi.fn().mockResolvedValue([
        {
          id: 9,
          windowId: 1,
          url: homeUrl,
          pinned: false,
          active: true
        }
      ]),
      update: vi.fn().mockResolvedValue({ id: 9 }),
      remove: vi.fn(),
      create: vi.fn()
    }
    ;(globalThis as any).chrome = {
      runtime: { getManifest: () => ({ version: "1" }) },
      tabs,
      windows: { update: vi.fn() }
    }

    await dedupeAndPinHome(1, base, homeUrl, false)

    expect(tabs.update).toHaveBeenCalledWith(9, { pinned: true })
  })

  it("creates a background Home only on first install", async () => {
    const openHome = vi.fn().mockResolvedValue(undefined)

    await expect(
      openPinnedHomeAfterInstall({ reason: "install" }, openHome)
    ).resolves.toBe(true)
    await expect(
      openPinnedHomeAfterInstall({ reason: "update" }, openHome)
    ).resolves.toBe(false)

    expect(openHome).toHaveBeenCalledTimes(1)
    expect(openHome).toHaveBeenCalledWith(false)
  })
})

describe("current-window Home boundary", () => {
  it("resolves only the last focused normal window", async () => {
    const getLastFocused = vi.fn().mockResolvedValue({ id: 7, type: "normal" })
    ;(globalThis as any).chrome = { windows: { getLastFocused } }

    await expect(getCurrentNormalWindowId()).resolves.toBe(7)
    expect(getLastFocused).toHaveBeenCalledWith({
      populate: false,
      windowTypes: ["normal"]
    })
  })

  it("rejects explicit non-normal window targets", async () => {
    const query = vi.fn()
    ;(globalThis as any).chrome = {
      tabs: { query },
      windows: {
        get: vi.fn().mockResolvedValue({ id: 9, type: "popup" })
      }
    }

    await expect(openAndPinHomeInWindow(9, true)).rejects.toThrow(
      "home-window-not-normal"
    )
    expect(query).not.toHaveBeenCalled()
  })

  it("cleans removed Home state without auto-replenishing tabs", () => {
    const addUpdatedListener = vi.fn()
    const addRemovedListener = vi.fn()
    const create = vi.fn()
    ;(globalThis as any).chrome = {
      tabs: {
        onUpdated: { addListener: addUpdatedListener },
        onRemoved: { addListener: addRemovedListener },
        create
      }
    }

    registerHomeNavigationListener()

    expect(addUpdatedListener).toHaveBeenCalledTimes(1)
    expect(addRemovedListener).toHaveBeenCalledTimes(1)
    const handleRemoved = addRemovedListener.mock.calls[0]?.[0]
    handleRemoved?.(23, { isWindowClosing: false, windowId: 7 })
    expect(create).not.toHaveBeenCalled()
  })
})
