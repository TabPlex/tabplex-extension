import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Settings, WorkspaceState } from "~core/types"
import {
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE_STATE,
  STORAGE_KEYS
} from "~core/types"

type StateSlot = {
  value: unknown
  setter: ReturnType<typeof vi.fn>
}

let stateSlots: StateSlot[] = []
let cleanups: Array<() => void> = []

vi.mock("react", () => ({
  useState: <T>(initial: T | (() => T)) => {
    const value =
      typeof initial === "function" ? (initial as () => T)() : initial
    const slot: StateSlot = {
      value,
      setter: vi.fn((next: T | ((prev: T) => T)) => {
        slot.value =
          typeof next === "function"
            ? (next as (prev: T) => T)(slot.value as T)
            : next
      })
    }
    stateSlots.push(slot)
    return [slot.value, slot.setter]
  },
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect()
    if (typeof cleanup === "function") cleanups.push(cleanup)
  }
}))

vi.mock("~core/storage", () => ({
  loadWorkspaces: vi.fn(),
  loadSettings: vi.fn(),
  loadWorkspaceState: vi.fn()
}))

vi.mock("~lib/common", () => ({
  readCachedThemePreference: vi.fn(() => null),
  writeCachedThemePreference: vi.fn()
}))

vi.mock("~lib/logger", () => ({
  setLoggerConsoleEnabled: vi.fn()
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("useWorkspaceData", () => {
  let onStorageChanged:
    | ((
        changes: Record<string, chrome.storage.StorageChange>,
        area: string
      ) => void)
    | null = null

  const setupChrome = () => {
    onStorageChanged = null
    ;(globalThis as any).chrome = {
      storage: {
        onChanged: {
          addListener: vi.fn((listener: typeof onStorageChanged) => {
            onStorageChanged = listener
          }),
          removeListener: vi.fn()
        }
      }
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    stateSlots = []
    cleanups = []
    setupChrome()
  })

  it("keeps latest storage value when changes happen before init settles", async () => {
    const storageModule = await import("~core/storage")
    const loadWorkspaces = vi.mocked(storageModule.loadWorkspaces)
    const loadSettings = vi.mocked(storageModule.loadSettings)
    const loadWorkspaceState = vi.mocked(storageModule.loadWorkspaceState)

    const workspacesDeferred = createDeferred<any[]>()
    const settingsDeferred = createDeferred<Settings>()
    const stateDeferred = createDeferred<WorkspaceState>()

    loadWorkspaces.mockReturnValueOnce(workspacesDeferred.promise)
    loadSettings.mockReturnValueOnce(settingsDeferred.promise)
    loadWorkspaceState.mockReturnValueOnce(stateDeferred.promise)

    const { useWorkspaceData } = await import("./useWorkspaceData")
    useWorkspaceData()

    expect(onStorageChanged).toBeTypeOf("function")

    onStorageChanged?.(
      {
        [STORAGE_KEYS.WORKSPACES]: {
          oldValue: [],
          newValue: [{ id: "live-workspace" }]
        } as chrome.storage.StorageChange
      },
      "local"
    )

    workspacesDeferred.resolve([{ id: "init-workspace" }])
    settingsDeferred.resolve({ ...DEFAULT_SETTINGS, devMode: true })
    stateDeferred.resolve({
      ...DEFAULT_WORKSPACE_STATE,
      activeWorkspaceId: "w1"
    })

    await flushPromises()

    const workspacesSetter = stateSlots[0]?.setter
    const settingsSetter = stateSlots[1]?.setter
    const hydratedSetter = stateSlots[2]?.setter
    const workspaceStateSetter = stateSlots[3]?.setter

    expect(workspacesSetter).toHaveBeenCalledTimes(1)
    expect(workspacesSetter).toHaveBeenCalledWith([{ id: "live-workspace" }])
    expect(settingsSetter).toHaveBeenCalledTimes(1)
    expect(settingsSetter).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      devMode: true
    })
    expect(workspaceStateSetter).toHaveBeenCalledTimes(1)
    expect(workspaceStateSetter).toHaveBeenCalledWith({
      ...DEFAULT_WORKSPACE_STATE,
      activeWorkspaceId: "w1"
    })
    expect(hydratedSetter).toHaveBeenCalledWith(true)
  })

  it("ignores legacy tag removal after canonical workspace migration", async () => {
    const storageModule = await import("~core/storage")
    const workspacesDeferred = createDeferred<any[]>()
    const settingsDeferred = createDeferred<Settings>()
    const stateDeferred = createDeferred<WorkspaceState>()
    vi.mocked(storageModule.loadWorkspaces).mockReturnValueOnce(
      workspacesDeferred.promise
    )
    vi.mocked(storageModule.loadSettings).mockReturnValueOnce(
      settingsDeferred.promise
    )
    vi.mocked(storageModule.loadWorkspaceState).mockReturnValueOnce(
      stateDeferred.promise
    )

    const { useWorkspaceData } = await import("./useWorkspaceData")
    useWorkspaceData()

    onStorageChanged?.(
      {
        [STORAGE_KEYS.TAGS]: {
          oldValue: [{ id: "legacy-workspace" }],
          newValue: undefined
        } as chrome.storage.StorageChange
      },
      "local"
    )

    expect(stateSlots[0]?.setter).not.toHaveBeenCalled()

    workspacesDeferred.resolve([{ id: "canonical-workspace" }])
    settingsDeferred.resolve(DEFAULT_SETTINGS)
    stateDeferred.resolve(DEFAULT_WORKSPACE_STATE)
    await flushPromises()

    expect(stateSlots[0]?.setter).toHaveBeenCalledWith([
      { id: "canonical-workspace" }
    ])
  })

  it("keeps device-local Agent settings across portable sync events", async () => {
    const storageModule = await import("~core/storage")
    const initialSettings = createDeferred<Settings>()
    vi.mocked(storageModule.loadWorkspaces).mockResolvedValueOnce([])
    vi.mocked(storageModule.loadWorkspaceState).mockResolvedValueOnce(
      DEFAULT_WORKSPACE_STATE
    )
    vi.mocked(storageModule.loadSettings)
      .mockReturnValueOnce(initialSettings.promise)
      .mockResolvedValueOnce({
        ...DEFAULT_SETTINGS,
        devMode: true,
        agentControlEnabled: true
      })
      .mockResolvedValueOnce({
        ...DEFAULT_SETTINGS,
        theme: "dark",
        devMode: true,
        agentControlEnabled: true
      })

    const { useWorkspaceData } = await import("./useWorkspaceData")
    useWorkspaceData()

    onStorageChanged?.(
      {
        [STORAGE_KEYS.LOCAL_SETTINGS]: {
          oldValue: {
            devMode: false,
            agentControlEnabled: false
          },
          newValue: {
            devMode: true,
            agentControlEnabled: true
          }
        } as chrome.storage.StorageChange
      },
      "local"
    )
    onStorageChanged?.(
      {
        [STORAGE_KEYS.SETTINGS]: {
          oldValue: { theme: "light" },
          newValue: { theme: "dark" }
        } as chrome.storage.StorageChange
      },
      "sync"
    )
    await flushPromises()

    initialSettings.resolve({
      ...DEFAULT_SETTINGS,
      devMode: false,
      agentControlEnabled: false
    })
    await flushPromises()

    expect(stateSlots[1]?.value).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "dark",
      devMode: true,
      agentControlEnabled: true
    })
  })

  it("always sets hydrated=true even when one init source rejects", async () => {
    const storageModule = await import("~core/storage")
    vi.mocked(storageModule.loadWorkspaces).mockResolvedValueOnce([])
    vi.mocked(storageModule.loadSettings).mockRejectedValueOnce(
      new Error("load failed")
    )
    vi.mocked(storageModule.loadWorkspaceState).mockResolvedValueOnce(
      DEFAULT_WORKSPACE_STATE
    )

    const { useWorkspaceData } = await import("./useWorkspaceData")
    useWorkspaceData()

    await flushPromises()

    const hydratedSetter = stateSlots[2]?.setter
    expect(hydratedSetter).toHaveBeenCalledWith(true)
  })
})
