import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { TabSpec } from "~core/types"

import * as closingTabs from "./closingTabs"
import { TabOrchestrator } from "./TabOrchestrator"

vi.mock("./closingTabs", () => ({
  markTabsClosing: vi.fn(),
  unmarkTabClosing: vi.fn()
}))

const tab = (
  id: number,
  url: string,
  overrides: Partial<chrome.tabs.Tab> = {}
): chrome.tabs.Tab => ({
  id,
  index: id,
  windowId: 1,
  url,
  pinned: false,
  active: false,
  highlighted: false,
  incognito: false,
  selected: false,
  discarded: false,
  autoDiscardable: true,
  groupId: -1,
  ...overrides
})

const setupChrome = (initialTabs: chrome.tabs.Tab[]) => {
  let nextId = 10
  let liveTabs = initialTabs.map((item) => ({ ...item }))
  const tabs = {
    query: vi.fn(async ({ windowId }: { windowId: number }) =>
      liveTabs
        .filter((item) => item.windowId === windowId)
        .map((item) => ({
          ...item
        }))
    ),
    get: vi.fn(async (tabId: number) => {
      const current = liveTabs.find((item) => item.id === tabId)
      if (!current) throw new Error("No tab with id")
      return { ...current }
    }),
    create: vi.fn(async (info: chrome.tabs.CreateProperties) => {
      const created = tab(nextId++, String(info.url ?? "chrome://newtab/"), {
        windowId: info.windowId ?? 1,
        pinned: info.pinned ?? false,
        active: info.active ?? false,
        index: info.index ?? liveTabs.length
      })
      liveTabs.push(created)
      return { ...created }
    }),
    update: vi.fn(
      async (tabId: number, properties: chrome.tabs.UpdateProperties) => {
        const index = liveTabs.findIndex((item) => item.id === tabId)
        if (index < 0) throw new Error("No tab with id")
        liveTabs[index] = { ...liveTabs[index], ...properties }
        return { ...liveTabs[index] }
      }
    ),
    remove: vi.fn(async (ids: number | number[]) => {
      const removing = new Set(Array.isArray(ids) ? ids : [ids])
      liveTabs = liveTabs.filter((item) => !removing.has(item.id!))
    }),
    group: vi.fn().mockResolvedValue(500),
    ungroup: vi.fn().mockResolvedValue(undefined)
  }
  const windows = {
    update: vi.fn().mockResolvedValue(undefined)
  }
  const tabGroups = {
    update: vi.fn().mockResolvedValue(undefined)
  }
  ;(globalThis as any).chrome = {
    tabs,
    windows,
    tabGroups,
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://id/${path}`),
      getManifest: vi.fn(() => ({ version: "1.2.3" }))
    }
  }
  return {
    tabs,
    windows,
    tabGroups,
    getLiveTabs: () => liveTabs,
    updateLiveTab: (tabId: number, properties: Partial<chrome.tabs.Tab>) => {
      const index = liveTabs.findIndex((item) => item.id === tabId)
      if (index < 0) throw new Error("No tab with id")
      liveTabs[index] = { ...liveTabs[index], ...properties }
    }
  }
}

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("TabOrchestrator current-window switching", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("reuses exact targets and closes only unmatched source tabs", async () => {
    const { tabs } = setupChrome([
      tab(3, "chrome-extension://id/popup.html?mode=home", { pinned: true }),
      tab(1, "https://target.example/path?mode=exact"),
      tab(2, "https://source.example")
    ])

    await new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://target.example/path?mode=exact" }],
      {}
    )

    expect(tabs.create).not.toHaveBeenCalled()
    expect(tabs.remove).toHaveBeenCalledWith([2])
  })

  it("creates missing targets directly without a staging navigation", async () => {
    const { tabs } = setupChrome([
      tab(1, "https://target.example/path?mode=old")
    ])

    await new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://target.example/path?mode=new" }],
      {}
    )

    expect(tabs.create).toHaveBeenCalledWith({
      windowId: 1,
      url: "https://target.example/path?mode=new",
      pinned: undefined,
      active: false
    })
    expect(tabs.update).not.toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ url: expect.any(String) })
    )
  })

  it("replaces an exact loading tab instead of reusing it", async () => {
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs } = setupChrome([
      tab(1, homeUrl, { pinned: true }),
      tab(2, "https://source.example", {
        pendingUrl: "https://target.example",
        status: "loading"
      })
    ])

    await new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://target.example" }],
      {}
    )

    expect(tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://target.example" })
    )
    expect(tabs.remove).toHaveBeenCalledWith([2])
  })

  it("force closes a source tab that was loading when switching began", async () => {
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs, getLiveTabs, updateLiveTab } = setupChrome([
      tab(1, homeUrl, { pinned: true }),
      tab(2, "https://source.example", {
        pendingUrl: "https://loading.example",
        status: "loading"
      })
    ])

    await new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://target.example" }],
      {
        onBeforeCommit: () => {
          updateLiveTab(2, {
            pendingUrl: undefined,
            status: "complete",
            url: "https://redirected.example"
          })
        }
      }
    )

    expect(tabs.remove).toHaveBeenCalledWith([2])
    expect(getLiveTabs().some((item) => item.id === 2)).toBe(false)
  })

  it("starts missing targets in staggered groups of six", async () => {
    vi.useFakeTimers()
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs } = setupChrome([tab(1, homeUrl, { pinned: true })])
    const onBatchPrepared = vi.fn()
    const targets = Array.from({ length: 13 }, (_, index) => ({
      url: `https://target-${index}.example`
    }))

    const switching = new TabOrchestrator().switchWorkspace(1, targets, {
      onBatchPrepared
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(tabs.create).toHaveBeenCalledTimes(6)
    expect(onBatchPrepared).toHaveBeenLastCalledWith({
      preparedCount: 6,
      batchSize: 6,
      remainingCount: 7
    })

    await vi.advanceTimersByTimeAsync(599)
    expect(tabs.create).toHaveBeenCalledTimes(6)

    await vi.advanceTimersByTimeAsync(1)
    expect(tabs.create).toHaveBeenCalledTimes(12)
    expect(onBatchPrepared).toHaveBeenLastCalledWith({
      preparedCount: 12,
      batchSize: 6,
      remainingCount: 1
    })

    await vi.advanceTimersByTimeAsync(599)
    expect(tabs.create).toHaveBeenCalledTimes(12)

    await vi.advanceTimersByTimeAsync(1)
    await switching
    expect(tabs.create).toHaveBeenCalledTimes(13)
    expect(onBatchPrepared).toHaveBeenLastCalledWith({
      preparedCount: 13,
      batchSize: 1,
      remainingCount: 0
    })
  })

  it("cancels a pending batch gap without opening another group", async () => {
    vi.useFakeTimers()
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs, getLiveTabs } = setupChrome([
      tab(1, homeUrl, { pinned: true }),
      tab(2, "https://source.example")
    ])
    const controller = new AbortController()
    const targets = Array.from({ length: 7 }, (_, index) => ({
      url: `https://target-${index}.example`
    }))

    const switching = new TabOrchestrator().switchWorkspace(1, targets, {
      signal: controller.signal
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(tabs.create).toHaveBeenCalledTimes(6)

    controller.abort()

    await expect(switching).rejects.toThrow("workspace-switch-aborted")
    expect(tabs.create).toHaveBeenCalledTimes(6)
    expect(tabs.remove).toHaveBeenCalledWith([10, 11, 12, 13, 14, 15])
    expect(getLiveTabs().some((item) => item.id === 2)).toBe(true)
  })

  it("never closes pinned, browser-internal, or unrelated extension tabs", async () => {
    const { tabs } = setupChrome([
      tab(1, "https://pinned.example", { pinned: true }),
      tab(2, "chrome://settings"),
      tab(3, "chrome-extension://other/options.html"),
      tab(4, "https://source.example")
    ])

    await new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://target.example" }],
      {}
    )

    expect(tabs.remove).toHaveBeenCalledWith([4])
  })

  it("prepares direct target and Home tabs before destructive commit", async () => {
    const { tabs } = setupChrome([tab(1, "https://source.example")])
    const onBeforeCommit = vi.fn(() => {
      expect(tabs.create).toHaveBeenCalledTimes(2)
      expect(tabs.create.mock.calls[0][0].url).toBe("https://target.example")
      expect(tabs.create.mock.calls[1][0].url).toContain("mode=home")
      expect(tabs.remove).not.toHaveBeenCalled()
    })

    await new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://target.example" }],
      { onBeforeCommit }
    )

    expect(onBeforeCommit).toHaveBeenCalledOnce()
    expect(tabs.remove).toHaveBeenCalledWith([1])
  })

  it("keeps Home as the safe anchor for an empty collection", async () => {
    const { tabs, getLiveTabs } = setupChrome([
      tab(1, "https://source.example")
    ])

    await new TabOrchestrator().switchWorkspace(1, [], {})

    expect(tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        windowId: 1,
        url: expect.stringContaining("mode=home"),
        pinned: true
      })
    )
    expect(getLiveTabs().map((item) => item.url)).toEqual([
      expect.stringContaining("mode=home")
    ])
  })

  it("rebuilds portable tab groups after creating targets", async () => {
    const { tabs, tabGroups } = setupChrome([tab(1, "https://source.example")])
    const group: NonNullable<TabSpec["group"]> = {
      key: "research",
      title: "Research",
      color: "blue",
      collapsed: true
    }

    await new TabOrchestrator().switchWorkspace(
      1,
      [
        { url: "https://a.example", group },
        { url: "https://b.example", group }
      ],
      {}
    )

    expect(tabs.group).toHaveBeenCalledWith({
      tabIds: [10, 11],
      createProperties: { windowId: 1 }
    })
    expect(tabGroups.update).toHaveBeenCalledWith(500, {
      title: "Research",
      color: "blue",
      collapsed: true
    })
  })

  it("does not steal focus while switching the current window", async () => {
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs, windows } = setupChrome([
      tab(1, homeUrl, { pinned: true }),
      tab(2, "https://source.example")
    ])

    await new TabOrchestrator().switchWorkspace(1, [], {})

    expect(tabs.update).not.toHaveBeenCalled()
    expect(windows.update).not.toHaveBeenCalled()
  })

  it("does not close a source tab that navigates after preparation", async () => {
    const { tabs, getLiveTabs } = setupChrome([
      tab(1, "https://source.example")
    ])

    await new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://target.example" }],
      {
        onBeforeCommit: async () => {
          await chrome.tabs.update(1, {
            url: "https://user-navigation.example"
          })
        }
      }
    )

    expect(getLiveTabs().some((item) => item.id === 1)).toBe(true)
    expect(tabs.remove).not.toHaveBeenCalledWith([1])
  })

  it("rolls back created targets without touching source tabs on failure", async () => {
    const { tabs, getLiveTabs } = setupChrome([
      tab(1, "https://source.example")
    ])
    tabs.create
      .mockResolvedValueOnce(tab(10, "https://first.example"))
      .mockRejectedValueOnce(new Error("second target failed"))
    tabs.get.mockResolvedValue(tab(10, "https://first.example"))

    await expect(
      new TabOrchestrator().switchWorkspace(
        1,
        [{ url: "https://first.example" }, { url: "https://second.example" }],
        {}
      )
    ).rejects.toThrow("workspace-tab-preparation-failed")

    expect(tabs.remove).toHaveBeenCalledWith([10])
    expect(getLiveTabs().some((item) => item.id === 1)).toBe(true)
    expect(closingTabs.markTabsClosing).not.toHaveBeenCalledWith([1])
  })

  it("waits for in-flight creation before abort cleanup completes", async () => {
    const { tabs } = setupChrome([tab(1, "https://source.example")])
    const first = deferred<chrome.tabs.Tab>()
    const second = deferred<chrome.tabs.Tab>()
    tabs.create
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const controller = new AbortController()
    const switching = new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://first.example" }, { url: "https://second.example" }],
      { signal: controller.signal }
    )

    await vi.waitFor(() => expect(tabs.create).toHaveBeenCalledTimes(2))
    controller.abort()
    first.resolve(tab(10, "https://first.example"))
    second.resolve(tab(11, "https://second.example"))
    tabs.get.mockImplementation(async (tabId: number) =>
      tab(
        tabId,
        tabId === 10 ? "https://first.example" : "https://second.example"
      )
    )

    await expect(switching).rejects.toThrow("workspace-switch-aborted")
    expect(tabs.remove).toHaveBeenCalledWith([10, 11])
    expect(tabs.remove).not.toHaveBeenCalledWith([1])
  })

  it("preserves a created tab that the user takes over before rollback", async () => {
    const { tabs } = setupChrome([tab(1, "https://source.example")])
    tabs.create
      .mockResolvedValueOnce(tab(10, "https://first.example"))
      .mockRejectedValueOnce(new Error("second target failed"))
    tabs.get.mockResolvedValue(
      tab(10, "https://user-owned.example", { windowId: 9 })
    )

    await expect(
      new TabOrchestrator().switchWorkspace(
        1,
        [{ url: "https://first.example" }, { url: "https://second.example" }],
        {}
      )
    ).rejects.toThrow("workspace-tab-preparation-failed")

    expect(tabs.remove).not.toHaveBeenCalledWith([10])
  })
})
