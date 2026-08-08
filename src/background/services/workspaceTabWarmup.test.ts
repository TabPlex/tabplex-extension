import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WORKSPACE_TAB_LOAD_PLACEHOLDER_URL } from "./workspaceTabLoadPlaceholder"
import {
  cancelWorkspaceTabWarmup,
  handleWorkspaceTabWarmupActivated,
  handleWorkspaceTabWarmupAlarm,
  handleWorkspaceTabWarmupUpdated,
  resetWorkspaceTabWarmupRuntime,
  resumeWorkspaceTabWarmups,
  startWorkspaceTabWarmup
} from "./workspaceTabWarmup"

const state = vi.hoisted(() => ({
  binding: {
    workspaceId: "target",
    tabsRevision: 1,
    updatedAt: 1
  } as {
    workspaceId: string
    tabsRevision: number
    updatedAt: number
    stale?: boolean
  } | null
}))

vi.mock("~core/storage", () => ({
  getWorkspaceWindowBinding: vi.fn(async () =>
    state.binding ? structuredClone(state.binding) : null
  )
}))

vi.mock("~core/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~core/utils")>()),
  uuid: vi.fn(() => "warmup-run")
}))

vi.mock("~lib/logger", () => ({
  logWarn: vi.fn(async () => undefined)
}))

const targetUrl = (id: number) => `https://target-${id}.example`

const startWarmup = (tabIds: number[]) =>
  startWorkspaceTabWarmup({
    windowId: 7,
    workspaceId: "target",
    targets: tabIds.map((tabId) => ({ tabId, url: targetUrl(tabId) }))
  })

const createPlaceholderTab = (
  id: number,
  overrides: Partial<chrome.tabs.Tab> = {}
): chrome.tabs.Tab => ({
  id,
  index: id,
  windowId: 7,
  url: WORKSPACE_TAB_LOAD_PLACEHOLDER_URL,
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
  status: "complete",
  ...overrides
})

const setupChrome = (initialTabs: chrome.tabs.Tab[]) => {
  let liveTabs = initialTabs.map((tab) => ({ ...tab }))
  let sessionState: Record<string, unknown> = {}
  const alarms = new Map<string, chrome.alarms.AlarmCreateInfo>()

  const tabs = {
    query: vi.fn(async ({ windowId }: { windowId: number }) =>
      liveTabs
        .filter((tab) => tab.windowId === windowId)
        .map((tab) => ({ ...tab }))
    ),
    update: vi.fn(
      async (tabId: number, properties: chrome.tabs.UpdateProperties) => {
        const index = liveTabs.findIndex((tab) => tab.id === tabId)
        if (index < 0) throw new Error("missing-tab")
        liveTabs[index] = {
          ...liveTabs[index],
          ...properties,
          pendingUrl: undefined,
          discarded: false,
          status: "loading"
        }
        return { ...liveTabs[index] }
      }
    ),
    get: vi.fn(async (tabId: number) => {
      const tab = liveTabs.find((candidate) => candidate.id === tabId)
      if (!tab) throw new Error("missing-tab")
      return { ...tab }
    }),
    discard: vi.fn(async (tabId: number) => {
      const index = liveTabs.findIndex((tab) => tab.id === tabId)
      if (index < 0) throw new Error("missing-tab")
      liveTabs[index] = {
        ...liveTabs[index],
        discarded: true,
        status: undefined
      }
      return { ...liveTabs[index] }
    })
  }

  ;(globalThis as any).chrome = {
    alarms: {
      clear: vi.fn(async (name: string) => alarms.delete(name)),
      create: vi.fn(
        async (name: string, info: chrome.alarms.AlarmCreateInfo) => {
          alarms.set(name, info)
        }
      )
    },
    storage: {
      session: {
        get: vi.fn(async (key: string) => ({ [key]: sessionState[key] })),
        set: vi.fn(async (values: Record<string, unknown>) => {
          sessionState = { ...sessionState, ...structuredClone(values) }
        })
      }
    },
    tabs
  }

  return {
    tabs,
    getJob: () =>
      (
        sessionState.workspaceTabWarmupJobs as
          | Record<
              string,
              {
                targetUrls: Record<string, string>
                pendingTabIds: number[]
                inflightTabs: Array<{ tabId: number; startedAt: number }>
                retryAt?: number
              }
            >
          | undefined
      )?.["7"],
    updateTab: (tabId: number, patch: Partial<chrome.tabs.Tab>) => {
      const index = liveTabs.findIndex((tab) => tab.id === tabId)
      if (index < 0) throw new Error("missing-tab")
      liveTabs[index] = { ...liveTabs[index], ...patch }
      return { ...liveTabs[index] }
    }
  }
}

describe("workspaceTabWarmup", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    vi.clearAllMocks()
    resetWorkspaceTabWarmupRuntime()
    state.binding = {
      workspaceId: "target",
      tabsRevision: 1,
      updatedAt: 1
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts every placeholder immediately and removes the job after all targets finish", async () => {
    const { tabs, getJob, updateTab } = setupChrome(
      [1, 2, 3, 4, 5, 6].map((tabId) => createPlaceholderTab(tabId))
    )

    await startWarmup([1, 2, 3, 4, 5, 6])
    expect(tabs.update.mock.calls.map(([tabId]) => tabId)).toEqual([
      1, 2, 3, 4, 5, 6
    ])
    expect(getJob()).toMatchObject({
      pendingTabIds: [],
      inflightTabs: [
        { tabId: 1 },
        { tabId: 2 },
        { tabId: 3 },
        { tabId: 4 },
        { tabId: 5 },
        { tabId: 6 }
      ]
    })

    for (const tabId of [1, 2, 3, 4, 5, 6]) {
      const completed = updateTab(tabId, { status: "complete" })
      handleWorkspaceTabWarmupUpdated(tabId, { status: "complete" }, completed)
    }
    await resumeWorkspaceTabWarmups()
    expect(getJob()).toBeUndefined()
  })

  it("waits for a fresh tab read to confirm target navigation", async () => {
    const { tabs, getJob, updateTab } = setupChrome([
      createPlaceholderTab(1),
      createPlaceholderTab(2)
    ])
    tabs.update.mockImplementationOnce(async (tabId, properties) => ({
      ...(await tabs.get(tabId)),
      ...properties,
      discarded: false,
      status: "loading"
    }))

    const starting = startWarmup([1, 2])

    await vi.advanceTimersByTimeAsync(49)
    expect(getJob()).toMatchObject({
      pendingTabIds: [],
      inflightTabs: [{ tabId: 1 }, { tabId: 2 }]
    })

    updateTab(1, {
      url: targetUrl(1),
      discarded: false,
      status: "loading"
    })
    await vi.advanceTimersByTimeAsync(1)
    await starting
    expect(tabs.update).toHaveBeenCalledTimes(2)
  })

  it("cleans up timed-out accounting without stopping slow pages", async () => {
    const { tabs, getJob } = setupChrome(
      [1, 2, 3].map((tabId) => createPlaceholderTab(tabId))
    )
    await startWarmup([1, 2, 3])

    vi.setSystemTime(11_001)
    expect(handleWorkspaceTabWarmupAlarm("tabplex-workspace-warmup:7")).toBe(
      true
    )
    await resumeWorkspaceTabWarmups()

    expect(tabs.discard).not.toHaveBeenCalled()
    expect(tabs.update.mock.calls.map(([tabId]) => tabId)).toEqual([1, 2, 3])
    expect(getJob()).toBeUndefined()
  })

  it("keeps a failed target queued and retries it", async () => {
    const { tabs, getJob } = setupChrome(
      [1, 2, 3].map((tabId) => createPlaceholderTab(tabId))
    )
    tabs.update.mockRejectedValueOnce(new Error("temporary-navigation-failure"))
    await startWarmup([1, 2, 3])

    expect(getJob()).toMatchObject({
      pendingTabIds: [1],
      inflightTabs: [{ tabId: 2 }, { tabId: 3 }],
      retryAt: 2_000
    })

    await vi.advanceTimersByTimeAsync(1_000)
    await resumeWorkspaceTabWarmups()
    expect(tabs.update.mock.calls.map(([tabId]) => tabId)).toEqual([1, 2, 3, 1])
    expect(getJob()).toMatchObject({
      pendingTabIds: [],
      inflightTabs: [{ tabId: 2 }, { tabId: 3 }, { tabId: 1 }]
    })
  })

  it("persists target URLs and resumes after the service worker runtime resets", async () => {
    const { tabs, getJob, updateTab } = setupChrome([
      createPlaceholderTab(1),
      createPlaceholderTab(2)
    ])
    await startWarmup([1, 2])

    expect(getJob()?.targetUrls).toEqual({
      "1": targetUrl(1),
      "2": targetUrl(2)
    })
    resetWorkspaceTabWarmupRuntime()
    updateTab(1, { status: "complete" })
    await resumeWorkspaceTabWarmups()

    expect(tabs.update.mock.calls.map(([tabId]) => tabId)).toEqual([1, 2])
    expect(getJob()).toMatchObject({
      pendingTabIds: [],
      inflightTabs: [{ tabId: 2 }]
    })
  })

  it("navigates a legacy discarded target through a distinct placeholder", async () => {
    const { tabs } = setupChrome([
      createPlaceholderTab(1, {
        url: targetUrl(1),
        discarded: true,
        status: undefined
      })
    ])

    await startWarmup([1])

    expect(tabs.update).toHaveBeenNthCalledWith(1, 1, {
      url: WORKSPACE_TAB_LOAD_PLACEHOLDER_URL
    })
    expect(tabs.update).toHaveBeenNthCalledWith(2, 1, { url: targetUrl(1) })
  })

  it("releases in-flight accounting when a tab becomes active", async () => {
    const { tabs, getJob, updateTab } = setupChrome([
      createPlaceholderTab(1),
      createPlaceholderTab(2)
    ])
    await startWarmup([1, 2])

    updateTab(1, { active: true, status: "loading" })
    handleWorkspaceTabWarmupActivated({ tabId: 1, windowId: 7 })
    await resumeWorkspaceTabWarmups()

    expect(tabs.update.mock.calls.map(([tabId]) => tabId)).toEqual([1, 2])
    expect(getJob()).toMatchObject({
      pendingTabIds: [],
      inflightTabs: [{ tabId: 2 }]
    })
  })

  it("stops the old queue when a new switch cancels it", async () => {
    const { tabs, getJob, updateTab } = setupChrome(
      [1, 2, 3].map((tabId) => createPlaceholderTab(tabId))
    )
    await startWarmup([1, 2, 3])
    await cancelWorkspaceTabWarmup(7)

    const completed = updateTab(1, { status: "complete" })
    handleWorkspaceTabWarmupUpdated(1, { status: "complete" }, completed)
    await resumeWorkspaceTabWarmups()

    expect(tabs.update.mock.calls.map(([tabId]) => tabId)).toEqual([1, 2, 3])
    expect(getJob()).toBeUndefined()
  })

  it("drops a persisted job after its window binding changes", async () => {
    const { tabs, getJob } = setupChrome(
      [1, 2, 3].map((tabId) => createPlaceholderTab(tabId))
    )
    await startWarmup([1, 2, 3])

    state.binding = {
      workspaceId: "other",
      tabsRevision: 2,
      updatedAt: 2
    }
    await resumeWorkspaceTabWarmups()

    expect(tabs.update.mock.calls.map(([tabId]) => tabId)).toEqual([1, 2, 3])
    expect(getJob()).toBeUndefined()
  })
})
