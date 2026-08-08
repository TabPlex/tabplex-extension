import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { TabSpec } from "~core/types"

import * as closingTabs from "./closingTabs"
import { TabOrchestrator } from "./TabOrchestrator"
import { WORKSPACE_TAB_LOAD_PLACEHOLDER_URL } from "./workspaceTabLoadPlaceholder"

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
  frozen: false,
  autoDiscardable: true,
  groupId: -1,
  lastAccessed: 0,
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
    discard: vi.fn(async (tabId: number) => {
      const index = liveTabs.findIndex((item) => item.id === tabId)
      if (index < 0) throw new Error("No tab with id")
      if (liveTabs[index].active) return undefined
      liveTabs[index] = {
        ...liveTabs[index],
        discarded: true,
        status: undefined
      }
      return { ...liveTabs[index] }
    }),
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

  it("creates lightweight placeholders without starting target navigation", async () => {
    const { tabs, getLiveTabs } = setupChrome([
      tab(1, "https://source.example")
    ])
    const onTabPrepared = vi.fn()

    await new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://target.example" }],
      {
        createdTabPlaceholderUrl: WORKSPACE_TAB_LOAD_PLACEHOLDER_URL,
        onTabPrepared
      }
    )

    expect(tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: WORKSPACE_TAB_LOAD_PLACEHOLDER_URL,
        active: false
      })
    )
    expect(tabs.update).not.toHaveBeenCalledWith(
      10,
      expect.objectContaining({ url: "https://target.example" })
    )
    expect(getLiveTabs().find((item) => item.id === 10)?.url).toBe(
      WORKSPACE_TAB_LOAD_PLACEHOLDER_URL
    )
    expect(onTabPrepared).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10 }),
      "https://target.example",
      "created"
    )
  })

  it("waits for a placeholder URL to commit before exposing it to warmup", async () => {
    vi.useFakeTimers()
    const { tabs, updateLiveTab } = setupChrome([
      tab(1, "https://source.example")
    ])
    const defaultCreate = tabs.create.getMockImplementation()!
    const onTabPrepared = vi.fn()
    tabs.create.mockImplementationOnce(async (info) => {
      const created = await defaultCreate(info)
      updateLiveTab(created.id!, {
        url: "",
        pendingUrl: WORKSPACE_TAB_LOAD_PLACEHOLDER_URL,
        status: "loading"
      })
      return {
        ...created,
        url: "",
        pendingUrl: WORKSPACE_TAB_LOAD_PLACEHOLDER_URL,
        status: "loading"
      }
    })

    const switching = new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://target.example" }],
      {
        createdTabPlaceholderUrl: WORKSPACE_TAB_LOAD_PLACEHOLDER_URL,
        onTabPrepared
      }
    )

    await vi.advanceTimersByTimeAsync(49)
    expect(onTabPrepared).not.toHaveBeenCalled()

    updateLiveTab(10, {
      url: WORKSPACE_TAB_LOAD_PLACEHOLDER_URL,
      pendingUrl: undefined,
      status: "loading"
    })
    await vi.advanceTimersByTimeAsync(1)
    await switching

    expect(onTabPrepared).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 10,
        url: WORKSPACE_TAB_LOAD_PLACEHOLDER_URL,
        status: "loading"
      }),
      "https://target.example",
      "created"
    )
  })

  it("discards newly created targets after their URL is committed", async () => {
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs } = setupChrome([tab(1, homeUrl, { pinned: true })])

    await new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://target.example" }],
      { discardCreatedTabs: true }
    )

    expect(tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://target.example",
        active: false
      })
    )
    expect(tabs.discard).toHaveBeenCalledWith(10)
  })

  it("waits for a safe pending target URL to commit before discarding", async () => {
    vi.useFakeTimers()
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs, updateLiveTab } = setupChrome([
      tab(1, homeUrl, { pinned: true })
    ])
    const defaultCreate = tabs.create.getMockImplementation()!
    tabs.create.mockImplementationOnce(async (info) => {
      const created = await defaultCreate(info)
      updateLiveTab(created.id!, {
        url: "",
        pendingUrl: String(info.url),
        status: "loading"
      })
      return {
        ...created,
        url: "",
        pendingUrl: String(info.url),
        status: "loading"
      }
    })

    const switching = new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://target.example" }],
      { discardCreatedTabs: true }
    )

    await vi.advanceTimersByTimeAsync(49)
    expect(tabs.discard).not.toHaveBeenCalled()

    updateLiveTab(10, {
      url: "https://target.example",
      pendingUrl: undefined,
      status: "loading"
    })
    await vi.advanceTimersByTimeAsync(1)
    await switching
    expect(tabs.discard).toHaveBeenCalledWith(10)
  })

  it("restores a target URL that Chrome loses while discarding", async () => {
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs, getLiveTabs, updateLiveTab } = setupChrome([
      tab(1, homeUrl, { pinned: true }),
      tab(2, "https://source.example")
    ])
    tabs.discard.mockImplementationOnce(async (tabId) => {
      updateLiveTab(tabId, {
        url: "",
        pendingUrl: undefined,
        discarded: true,
        status: undefined
      })
      return tabs.get(tabId)
    })

    await new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://target.example" }],
      { discardCreatedTabs: true }
    )

    expect(tabs.update).toHaveBeenCalledWith(10, {
      url: "https://target.example"
    })
    expect(getLiveTabs().find((item) => item.id === 10)?.url).toBe(
      "https://target.example"
    )
    expect(getLiveTabs().some((item) => item.id === 2)).toBe(false)
  })

  it("retries until Chrome confirms that a new target is discarded", async () => {
    vi.useFakeTimers()
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs } = setupChrome([tab(1, homeUrl, { pinned: true })])
    tabs.discard.mockResolvedValueOnce(undefined)

    const switching = new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://target.example" }],
      { discardCreatedTabs: true }
    )

    await vi.advanceTimersByTimeAsync(74)
    expect(tabs.discard).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await switching
    expect(tabs.discard).toHaveBeenCalledTimes(2)
  })

  it("keeps the slot when discard returns stale success before Chrome confirms it", async () => {
    vi.useFakeTimers()
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs, updateLiveTab } = setupChrome([
      tab(1, homeUrl, { pinned: true })
    ])
    const defaultCreate = tabs.create.getMockImplementation()!
    tabs.create.mockImplementation(async (info) => {
      const created = await defaultCreate(info)
      updateLiveTab(created.id!, { status: "loading" })
      return { ...created, status: "loading" }
    })
    tabs.discard.mockImplementation(async (tabId) => ({
      ...(await tabs.get(tabId)),
      discarded: true,
      status: undefined
    }))

    const switching = new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://first.example" }, { url: "https://second.example" }],
      { discardCreatedTabs: true, maxConcurrentTabLoads: 1 }
    )

    await vi.advanceTimersByTimeAsync(274)
    expect(tabs.create).toHaveBeenCalledTimes(1)

    updateLiveTab(10, { status: "complete" })
    await vi.advanceTimersByTimeAsync(1)
    expect(tabs.create).toHaveBeenCalledTimes(2)

    updateLiveTab(11, { status: "complete" })
    await vi.advanceTimersByTimeAsync(225)
    await switching
  })

  it("keeps a restored target navigation in its preparation slot", async () => {
    vi.useFakeTimers()
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs, updateLiveTab } = setupChrome([
      tab(1, homeUrl, { pinned: true })
    ])
    tabs.discard.mockImplementationOnce(async (tabId) => {
      updateLiveTab(tabId, {
        url: "",
        pendingUrl: undefined,
        discarded: true,
        status: undefined
      })
      return tabs.get(tabId)
    })
    tabs.update.mockImplementationOnce(async (tabId, properties) => {
      updateLiveTab(tabId, {
        ...properties,
        pendingUrl: String(properties.url),
        discarded: false,
        status: "loading"
      })
      return tabs.get(tabId)
    })

    const switching = new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://first.example" }, { url: "https://second.example" }],
      { discardCreatedTabs: true, maxConcurrentTabLoads: 1 }
    )

    await vi.advanceTimersByTimeAsync(49)
    expect(tabs.create).toHaveBeenCalledTimes(1)

    updateLiveTab(10, { pendingUrl: undefined, status: "complete" })
    await vi.advanceTimersByTimeAsync(1)
    await switching
    expect(tabs.create).toHaveBeenCalledTimes(2)
  })

  it("keeps a preparation slot until an undiscarded page finishes", async () => {
    vi.useFakeTimers()
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs, updateLiveTab } = setupChrome([
      tab(1, homeUrl, { pinned: true })
    ])
    const defaultCreate = tabs.create.getMockImplementation()!
    tabs.create.mockImplementation(async (info) => {
      const created = await defaultCreate(info)
      updateLiveTab(created.id!, { status: "loading" })
      return { ...created, status: "loading" }
    })
    tabs.discard
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)

    const switching = new TabOrchestrator().switchWorkspace(
      1,
      [{ url: "https://first.example" }, { url: "https://second.example" }],
      { discardCreatedTabs: true, maxConcurrentTabLoads: 1 }
    )

    await vi.advanceTimersByTimeAsync(274)
    expect(tabs.create).toHaveBeenCalledTimes(1)

    updateLiveTab(10, { status: "complete" })
    await vi.advanceTimersByTimeAsync(1)
    await switching

    expect(tabs.create).toHaveBeenCalledTimes(2)
    expect(tabs.discard).toHaveBeenCalledTimes(5)
  })

  it("re-pins an existing Home tab during a workspace switch", async () => {
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs, getLiveTabs } = setupChrome([
      tab(1, homeUrl, { pinned: false }),
      tab(2, "https://source.example")
    ])

    await new TabOrchestrator().switchWorkspace(1, [], {})

    expect(tabs.update).toHaveBeenCalledWith(1, { pinned: true })
    expect(getLiveTabs().find((item) => item.id === 1)?.pinned).toBe(true)
    expect(tabs.remove).toHaveBeenCalledWith([2])
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

  it("fills the next preparation slot as soon as one target finishes", async () => {
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs } = setupChrome([tab(1, homeUrl, { pinned: true })])
    const onPreparationProgress = vi.fn()
    const targets = Array.from({ length: 5 }, (_, index) => ({
      url: `https://target-${index}.example`
    }))
    const gates = targets.map(() => deferred())
    const defaultCreate = tabs.create.getMockImplementation()!
    tabs.create.mockImplementation(async (info) => {
      const index = targets.findIndex((target) => target.url === info.url)
      if (index >= 0) await gates[index].promise
      return defaultCreate(info)
    })

    const switching = new TabOrchestrator().switchWorkspace(1, targets, {
      maxConcurrentTabLoads: 3,
      onPreparationProgress
    })

    await vi.waitFor(() => expect(tabs.create).toHaveBeenCalledTimes(3))

    gates[1].resolve(undefined)
    await vi.waitFor(() => expect(tabs.create).toHaveBeenCalledTimes(4))
    expect(onPreparationProgress).toHaveBeenLastCalledWith({
      preparedCount: 1,
      justPreparedCount: 1,
      remainingCount: 4
    })

    gates[0].resolve(undefined)
    await vi.waitFor(() => expect(tabs.create).toHaveBeenCalledTimes(5))
    for (const gate of gates) gate.resolve(undefined)
    await switching
    expect(tabs.create).toHaveBeenCalledTimes(5)
    expect(onPreparationProgress).toHaveBeenLastCalledWith({
      preparedCount: 5,
      justPreparedCount: 1,
      remainingCount: 0
    })
  })

  it("stops a rolling queue after abort without opening another target", async () => {
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs, getLiveTabs } = setupChrome([
      tab(1, homeUrl, { pinned: true }),
      tab(2, "https://source.example")
    ])
    const controller = new AbortController()
    const targets = Array.from({ length: 3 }, (_, index) => ({
      url: `https://target-${index}.example`
    }))
    const gates = [deferred(), deferred()]
    const defaultCreate = tabs.create.getMockImplementation()!
    tabs.create.mockImplementation(async (info) => {
      const index = targets.findIndex((target) => target.url === info.url)
      if (index >= 0 && index < gates.length) await gates[index].promise
      return defaultCreate(info)
    })

    const switching = new TabOrchestrator().switchWorkspace(1, targets, {
      maxConcurrentTabLoads: 2,
      signal: controller.signal
    })

    await vi.waitFor(() => expect(tabs.create).toHaveBeenCalledTimes(2))

    controller.abort()
    for (const gate of gates) gate.resolve(undefined)

    await expect(switching).rejects.toThrow("workspace-switch-aborted")
    expect(tabs.create).toHaveBeenCalledTimes(2)
    expect(tabs.remove).toHaveBeenCalledWith([10, 11])
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

  it("cleans up corrupt blank tabs left by an older switch", async () => {
    const homeUrl = "chrome-extension://id/popup.html?mode=home"
    const { tabs, getLiveTabs } = setupChrome([
      tab(1, homeUrl, { pinned: true }),
      tab(2, "", {
        active: true,
        discarded: false,
        status: "complete"
      }),
      tab(3, "chrome://newtab/", { discarded: true, status: undefined })
    ])

    await new TabOrchestrator().switchWorkspace(1, [], {})

    expect(tabs.remove).toHaveBeenCalledWith([2])
    expect(getLiveTabs().some((item) => item.id === 2)).toBe(false)
    expect(getLiveTabs().some((item) => item.id === 3)).toBe(true)
  })

  it("cleans up a placeholder left by an interrupted load queue", async () => {
    const { tabs, getLiveTabs } = setupChrome([
      tab(1, "https://source.example"),
      tab(2, WORKSPACE_TAB_LOAD_PLACEHOLDER_URL)
    ])

    await new TabOrchestrator().switchWorkspace(1, [], {})

    expect(tabs.remove).toHaveBeenCalledWith([1, 2])
    expect(getLiveTabs().map((item) => item.url)).toEqual([
      expect.stringContaining("mode=home")
    ])
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
