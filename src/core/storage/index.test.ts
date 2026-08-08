import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE_STATE,
  STORAGE_KEYS,
  type Workspace
} from "~core/types"

import {
  clearWorkspaceWindowBindings,
  getWorkspaceWindowBinding,
  loadSettings,
  loadWorkspaces,
  loadWorkspaceState,
  loadWorkspaceWindowBindings,
  migrateLegacyStorage,
  removeWorkspaceBindingsForWorkspace,
  removeWorkspaceWindowBinding,
  saveWorkspaces,
  saveWorkspaceState,
  saveWorkspaceStatePatch,
  saveWorkspaceSwitchState,
  setWorkspaceWindowBinding,
  splitSettingsForStorage
} from "./index"

type StorageData = Record<string, unknown>

const makeStorageArea = (initial: StorageData = {}) => {
  const data: StorageData = { ...initial }
  const get = vi.fn(async (keys?: string | string[] | null) => {
    if (keys == null) return { ...data }
    const requested = Array.isArray(keys) ? keys : [keys]
    return Object.fromEntries(
      requested.filter((key) => key in data).map((key) => [key, data[key]])
    )
  })
  const set = vi.fn(async (items: StorageData) => {
    Object.assign(data, structuredClone(items))
  })
  const remove = vi.fn(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]
  })
  return { data, get, set, remove }
}

const makeChromeStorage = () => {
  const local = {
    ...makeStorageArea(),
    QUOTA_BYTES: 1024 * 1024,
    getBytesInUse: vi.fn().mockResolvedValue(0)
  }
  return {
    local,
    sync: makeStorageArea(),
    session: makeStorageArea()
  }
}

const tab = (url: string) => ({
  url,
  pinned: false,
  title: undefined,
  faviconUrl: undefined,
  lastAccessedAt: undefined,
  excluded: undefined,
  group: undefined
})

describe("core/storage", () => {
  beforeEach(() => {
    ;(globalThis as any).chrome = { storage: makeChromeStorage() }
  })

  it("returns an empty workspace list when Chrome storage is unavailable", async () => {
    const original = (globalThis as any).chrome
    delete (globalThis as any).chrome
    try {
      await expect(loadWorkspaces()).resolves.toEqual([])
    } finally {
      ;(globalThis as any).chrome = original
    }
  })

  it("loads canonical flat tabs and normalizes tabsRevision", async () => {
    const local = globalThis.chrome.storage.local as any
    local.data[STORAGE_KEYS.WORKSPACES] = [
      {
        id: "w1",
        name: "Workspace",
        createdAt: 1,
        tabsRevision: -3,
        tabs: [
          { url: "https://a.example" },
          { url: "https://pinned.example", pinned: true }
        ]
      }
    ]

    await expect(loadWorkspaces()).resolves.toEqual([
      {
        id: "w1",
        name: "Workspace",
        createdAt: 1,
        color: undefined,
        emoji: undefined,
        tabsRevision: 0,
        tabs: [tab("https://a.example")],
        history: []
      }
    ])
  })

  it("treats an explicit empty local workspace array as authoritative", async () => {
    const storage = globalThis.chrome.storage as any
    storage.local.data[STORAGE_KEYS.WORKSPACES] = []
    storage.local.data[STORAGE_KEYS.TAGS] = [{ id: "stale", name: "Stale" }]
    storage.sync.data[STORAGE_KEYS.WORKSPACES] = [
      { id: "remote", name: "Remote" }
    ]

    await expect(loadWorkspaces()).resolves.toEqual([])
    expect(storage.sync.get).not.toHaveBeenCalled()
  })

  it("flattens legacy windowSlots by order without deduplicating tabs", async () => {
    const local = globalThis.chrome.storage.local as any
    local.data[STORAGE_KEYS.WORKSPACES] = [
      {
        id: "legacy",
        name: "Legacy",
        createdAt: 1,
        tabs: [{ url: "https://ignored.example" }],
        windowSlots: [
          {
            order: 2,
            tabs: [{ url: "https://duplicate.example" }]
          },
          {
            order: 0,
            tabs: [
              {
                url: "https://first.example",
                group: {
                  key: " research ",
                  color: "blue",
                  groupId: 99
                }
              },
              { url: "https://duplicate.example" }
            ]
          }
        ]
      }
    ]

    const [workspace] = await loadWorkspaces()

    expect(workspace).not.toHaveProperty("windowSlots")
    expect(workspace.tabs.map((item) => item.url)).toEqual([
      "https://first.example",
      "https://duplicate.example",
      "https://duplicate.example"
    ])
    expect(workspace.tabs[0].group).toEqual({
      key: "research",
      color: "blue"
    })

    await migrateLegacyStorage()
    const [persisted] = local.data[STORAGE_KEYS.WORKSPACES] as Workspace[]
    expect(persisted).not.toHaveProperty("windowSlots")
    expect(persisted.tabs.map((item) => item.url)).toEqual([
      "https://first.example",
      "https://duplicate.example",
      "https://duplicate.example"
    ])
  })

  it("flattens legacy layouts by virtual-window order", async () => {
    const local = globalThis.chrome.storage.local as any
    local.data[STORAGE_KEYS.WORKSPACES] = [
      { id: "w1", name: "Workspace", createdAt: 1, tabs: [] }
    ]
    local.data.workspaceVirtualWindowLayouts = {
      w1: [
        {
          virtualWindowId: "window-2",
          tabs: [{ url: "https://second.example" }]
        },
        {
          virtualWindowId: "window-1",
          tabs: [
            { url: "https://first.example" },
            { url: "https://first.example" }
          ]
        }
      ]
    }
    local.data.virtualWindows = [
      { virtualWindowId: "window-1", order: 0 },
      { virtualWindowId: "window-2", order: 1 }
    ]

    const [workspace] = await loadWorkspaces()

    expect(workspace.tabs.map((item) => item.url)).toEqual([
      "https://first.example",
      "https://first.example",
      "https://second.example"
    ])
  })

  it("keeps legacy reads side-effect free and migrates only explicitly", async () => {
    const local = globalThis.chrome.storage.local as any
    local.data[STORAGE_KEYS.TAGS] = [
      { id: "legacy", name: "Legacy", createdAt: 1, tabs: [] }
    ]

    await loadWorkspaces()
    expect(local.set).not.toHaveBeenCalled()

    await migrateLegacyStorage()

    expect(local.data[STORAGE_KEYS.WORKSPACES]).toEqual([
      expect.objectContaining({
        id: "legacy",
        tabs: [],
        tabsRevision: 0
      })
    ])
    expect(local.data).not.toHaveProperty(STORAGE_KEYS.TAGS)
  })

  it("normalizes workspaces before saving", async () => {
    const local = globalThis.chrome.storage.local as any
    await saveWorkspaces([
      {
        id: "w1",
        name: "Workspace",
        createdAt: 1,
        tabsRevision: Number.NaN,
        tabs: [
          { url: "https://a.example" },
          { url: "https://pinned.example", pinned: true }
        ]
      } as Workspace
    ])

    expect(local.data[STORAGE_KEYS.WORKSPACES]).toEqual([
      expect.objectContaining({
        tabsRevision: 0,
        tabs: [tab("https://a.example")]
      })
    ])
  })

  it("does not enforce chrome.storage.local's nominal quota before saving", async () => {
    const local = globalThis.chrome.storage.local as any
    local.QUOTA_BYTES = 1
    local.getBytesInUse.mockResolvedValue(1)

    await saveWorkspaces([
      {
        id: "w1",
        name: "Workspace",
        createdAt: 1,
        tabs: [{ url: "https://example.com" }]
      } as Workspace
    ])

    expect(local.getBytesInUse).not.toHaveBeenCalled()
    expect(local.data[STORAGE_KEYS.WORKSPACES]).toHaveLength(1)
  })

  it("normalizes session bindings and ignores invalid entries", async () => {
    const session = globalThis.chrome.storage.session as any
    session.data[STORAGE_KEYS.WINDOW_BINDINGS] = {
      7: {
        workspaceId: " workspace-1 ",
        tabsRevision: 4,
        stale: true,
        updatedAt: 10
      },
      nope: { workspaceId: "workspace-2", tabsRevision: 1, updatedAt: 1 },
      9: { workspaceId: "", tabsRevision: 1, updatedAt: 1 }
    }

    await expect(loadWorkspaceWindowBindings()).resolves.toEqual({
      7: {
        workspaceId: "workspace-1",
        tabsRevision: 4,
        stale: true,
        updatedAt: 10
      }
    })
  })

  it("serializes concurrent session binding updates without losing a window", async () => {
    await Promise.all([
      setWorkspaceWindowBinding(11, {
        workspaceId: "workspace-a",
        tabsRevision: 1,
        updatedAt: 10
      }),
      setWorkspaceWindowBinding(22, {
        workspaceId: "workspace-b",
        tabsRevision: 3,
        updatedAt: 20
      })
    ])

    await expect(loadWorkspaceWindowBindings()).resolves.toEqual({
      11: {
        workspaceId: "workspace-a",
        tabsRevision: 1,
        updatedAt: 10
      },
      22: {
        workspaceId: "workspace-b",
        tabsRevision: 3,
        updatedAt: 20
      }
    })
    await expect(getWorkspaceWindowBinding(22)).resolves.toEqual({
      workspaceId: "workspace-b",
      tabsRevision: 3,
      updatedAt: 20
    })
  })

  it("removes bindings by window, workspace, or all windows", async () => {
    await setWorkspaceWindowBinding(1, {
      workspaceId: "shared",
      tabsRevision: 1,
      updatedAt: 1
    })
    await setWorkspaceWindowBinding(2, {
      workspaceId: "shared",
      tabsRevision: 1,
      updatedAt: 1
    })
    await setWorkspaceWindowBinding(3, {
      workspaceId: "other",
      tabsRevision: 1,
      updatedAt: 1
    })

    await removeWorkspaceWindowBinding(1)
    await removeWorkspaceBindingsForWorkspace("shared")
    await expect(loadWorkspaceWindowBindings()).resolves.toEqual({
      3: {
        workspaceId: "other",
        tabsRevision: 1,
        updatedAt: 1
      }
    })

    await clearWorkspaceWindowBindings()
    await expect(loadWorkspaceWindowBindings()).resolves.toEqual({})
  })

  it("ignores retired settings and loads local security flags", async () => {
    const storage = globalThis.chrome.storage as any
    storage.sync.data[STORAGE_KEYS.SETTINGS] = {
      theme: "dark",
      tabRestoreMode: "soft",
      singleClickSwitch: false,
      ensureHomePinned: false,
      agentControlEnabled: true,
      devMode: false
    }
    storage.local.data[STORAGE_KEYS.LOCAL_SETTINGS] = {
      agentControlEnabled: false,
      devMode: true,
      workspaceTabLoadConcurrency: "all"
    }

    const result = await loadSettings()

    expect(result).toMatchObject({
      theme: "dark",
      agentControlEnabled: false,
      devMode: true
    })
    expect(result).not.toHaveProperty("workspaceTabLoadConcurrency")
    expect(result).not.toHaveProperty("singleClickSwitch")
    expect(result).not.toHaveProperty("ensureHomePinned")
    expect(result).not.toHaveProperty("tabRestoreMode")
  })

  it("persists only allowlisted synced settings", () => {
    const result = splitSettingsForStorage({
      ...DEFAULT_SETTINGS,
      devMode: true,
      agentControlEnabled: true,
      workspaceTabLoadConcurrency: 4,
      replacePinned: true,
      tabRestoreMode: "soft",
      switchMode: "replaceCurrentWindow",
      singleClickSwitch: true,
      ensureHomePinned: true,
      defaultHomeUrl: "popup.html?mode=home",
      unknownLegacyFlag: "unsafe"
    } as typeof DEFAULT_SETTINGS & Record<string, unknown>)

    expect(result.localSettings).toEqual({
      devMode: true,
      agentControlEnabled: true
    })
    expect(result.portableSettings).not.toHaveProperty("devMode")
    expect(result.portableSettings).not.toHaveProperty("agentControlEnabled")
    expect(result.portableSettings).not.toHaveProperty(
      "workspaceTabLoadConcurrency"
    )
    expect(result.portableSettings).not.toHaveProperty("replacePinned")
    expect(result.portableSettings).not.toHaveProperty("tabRestoreMode")
    expect(result.portableSettings).not.toHaveProperty("switchMode")
    expect(result.portableSettings).not.toHaveProperty("singleClickSwitch")
    expect(result.portableSettings).not.toHaveProperty("ensureHomePinned")
    expect(result.portableSettings).not.toHaveProperty("defaultHomeUrl")
    expect(result.portableSettings).not.toHaveProperty("unknownLegacyFlag")
  })

  it("loads runtime state without legacy managed-window fields", async () => {
    const local = globalThis.chrome.storage.local as any
    local.data[STORAGE_KEYS.STATE] = {
      activeWorkspaceId: "workspace-1",
      notes: { "workspace-1": "note" },
      hibernated: { "workspace-1": 1 },
      lastAutoSaveAt: 2,
      controller: { id: "old", ts: 3 },
      managedWindowId: 99,
      managedWindows: [{ windowId: 99, workspaceId: "workspace-1" }]
    }

    const result = await loadWorkspaceState()

    expect(result.activeWorkspaceId).toBe("workspace-1")
    expect(result.notes).toEqual({ "workspace-1": "note" })
    expect(result).not.toHaveProperty("hibernated")
    expect(result).not.toHaveProperty("lastAutoSaveAt")
    expect(result).not.toHaveProperty("controller")
    expect(result).not.toHaveProperty("managedWindowId")
    expect(result).not.toHaveProperty("managedWindows")
  })

  it("normalizes switch state and drops legacy multi-window fields", async () => {
    const local = globalThis.chrome.storage.local as any
    local.data[STORAGE_KEYS.SWITCH_STATE] = {
      runId: "run-1",
      targetId: "workspace-2",
      sourceId: "workspace-1",
      windowId: 7,
      sourceTabsRevision: 3,
      ts: 10,
      phase: "opening",
      tabRestoreMode: "soft",
      sourceSnapshot: {
        id: "workspace-1",
        tabs: [
          { url: "https://kept.example" },
          { url: "https://pinned.example", pinned: true }
        ],
        sourceManagedWindows: [{ windowId: 7 }]
      },
      sourceManagedWindows: [{ windowId: 7 }],
      targetManagedWindows: [{ windowId: 8 }]
    }

    const result = await loadWorkspaceState()

    expect(result.switchState).toMatchObject({
      runId: "run-1",
      targetId: "workspace-2",
      sourceId: "workspace-1",
      windowId: 7,
      sourceTabsRevision: 3,
      sourceSnapshot: {
        id: "workspace-1",
        tabs: [tab("https://kept.example")]
      }
    })
    expect(result.switchState).not.toHaveProperty("sourceManagedWindows")
    expect(result.switchState).not.toHaveProperty("targetManagedWindows")
    expect(result.switchState).not.toHaveProperty("tabRestoreMode")
    expect(result.switchState?.sourceSnapshot).not.toHaveProperty(
      "sourceManagedWindows"
    )
  })

  it("recovers a legacy switch window from its only source session", async () => {
    const local = globalThis.chrome.storage.local as any
    local.data[STORAGE_KEYS.SWITCH_STATE] = {
      runId: "legacy-run",
      targetId: "workspace-2",
      sourceId: "workspace-1",
      ts: 10,
      sourceManagedWindows: [{ windowId: 7 }],
      sourceSnapshot: {
        id: "workspace-1",
        tabs: [{ url: "https://source.example" }]
      }
    }

    await expect(loadWorkspaceState()).resolves.toMatchObject({
      switchState: {
        runId: "legacy-run",
        windowId: 7,
        sourceSnapshot: {
          tabs: [tab("https://source.example")]
        }
      }
    })
  })

  it("migrates a legacy switch journal using the main managed window", async () => {
    const local = globalThis.chrome.storage.local as any
    local.data[STORAGE_KEYS.STATE] = {
      activeWorkspaceId: "workspace-1",
      hibernated: { "workspace-1": 1 },
      lastAutoSaveAt: 2,
      controller: { id: "old", ts: 3 },
      managedWindowId: 9,
      managedWindows: [
        {
          windowId: 9,
          workspaceId: "workspace-1",
          slotId: "primary",
          isFocused: true
        }
      ]
    }
    local.data[STORAGE_KEYS.SWITCH_STATE] = {
      runId: "legacy-run",
      targetId: "workspace-2",
      sourceId: "workspace-1",
      ts: 10,
      sourceSnapshot: {
        id: "workspace-1",
        tabs: [{ url: "https://source.example" }]
      }
    }

    await migrateLegacyStorage()

    expect(local.data[STORAGE_KEYS.STATE]).not.toHaveProperty("managedWindowId")
    expect(local.data[STORAGE_KEYS.STATE]).not.toHaveProperty("managedWindows")
    expect(local.data[STORAGE_KEYS.STATE]).not.toHaveProperty("hibernated")
    expect(local.data[STORAGE_KEYS.STATE]).not.toHaveProperty("lastAutoSaveAt")
    expect(local.data[STORAGE_KEYS.STATE]).not.toHaveProperty("controller")
    expect(local.data[STORAGE_KEYS.SWITCH_STATE]).toMatchObject({
      runId: "legacy-run",
      windowId: 9,
      sourceSnapshot: {
        tabs: [tab("https://source.example")]
      }
    })
  })

  it("preserves an ambiguous legacy journal for controller recovery", async () => {
    const local = globalThis.chrome.storage.local as any
    local.data[STORAGE_KEYS.SWITCH_STATE] = {
      runId: "ambiguous-run",
      targetId: "workspace-2",
      sourceId: "workspace-1",
      ts: 10,
      sourceManagedWindows: [{ windowId: 7 }, { windowId: 8 }],
      sourceSnapshot: {
        id: "workspace-1",
        tabs: [{ url: "https://recover.example" }]
      }
    }

    await expect(loadWorkspaceState()).resolves.toMatchObject({
      switchState: {
        runId: "ambiguous-run",
        windowId: -1,
        phase: "recovery_failed",
        recoveryError: "legacy-window-identity-ambiguous",
        sourceSnapshot: {
          tabs: [tab("https://recover.example")]
        }
      }
    })
  })

  it("migration removes legacy window storage and rewrites managed runtime state", async () => {
    const local = globalThis.chrome.storage.local as any
    local.data[STORAGE_KEYS.WORKSPACES] = []
    local.data[STORAGE_KEYS.STATE] = {
      activeWorkspaceId: "workspace-1",
      notes: {},
      managedWindowId: 9,
      managedWindows: [{ windowId: 9, workspaceId: "workspace-1" }]
    }
    local.data.virtualWindows = [{ virtualWindowId: "legacy" }]
    local.data.virtualWindowBindings = { legacy: 9 }
    local.data.workspaceVirtualWindowLayouts = { "workspace-1": [] }

    await migrateLegacyStorage()

    expect(local.data[STORAGE_KEYS.STATE]).toEqual(
      expect.objectContaining({ activeWorkspaceId: "workspace-1" })
    )
    expect(local.data[STORAGE_KEYS.STATE]).not.toHaveProperty("managedWindowId")
    expect(local.data[STORAGE_KEYS.STATE]).not.toHaveProperty("managedWindows")
    expect(local.data).not.toHaveProperty("virtualWindows")
    expect(local.data).not.toHaveProperty("virtualWindowBindings")
    expect(local.data).not.toHaveProperty("workspaceVirtualWindowLayouts")
  })

  it("state writers strip legacy managed fields and preserve switch separation", async () => {
    const local = globalThis.chrome.storage.local as any
    const unsafeState = {
      ...DEFAULT_WORKSPACE_STATE,
      activeWorkspaceId: "workspace-1",
      hibernated: { "workspace-1": 1 },
      lastAutoSaveAt: 2,
      controller: { id: "old", ts: 3 },
      managedWindowId: 9,
      managedWindows: [{ windowId: 9 }],
      switchState: null
    }

    await saveWorkspaceState(unsafeState as any)
    expect(local.data[STORAGE_KEYS.STATE]).not.toHaveProperty("managedWindowId")
    expect(local.data[STORAGE_KEYS.STATE]).not.toHaveProperty("managedWindows")
    expect(local.data[STORAGE_KEYS.STATE]).not.toHaveProperty("hibernated")
    expect(local.data[STORAGE_KEYS.STATE]).not.toHaveProperty("lastAutoSaveAt")
    expect(local.data[STORAGE_KEYS.STATE]).not.toHaveProperty("controller")
    expect(local.data[STORAGE_KEYS.SWITCH_STATE]).toBeNull()

    await saveWorkspaceStatePatch({ notes: { "workspace-1": "note" } })
    expect(local.data[STORAGE_KEYS.STATE]).toMatchObject({
      activeWorkspaceId: "workspace-1",
      notes: { "workspace-1": "note" }
    })

    await saveWorkspaceSwitchState(null)
    expect(local.data[STORAGE_KEYS.SWITCH_STATE]).toBeNull()
  })
})
