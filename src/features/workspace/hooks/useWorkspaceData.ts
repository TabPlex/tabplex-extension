import { useEffect, useState } from "react"

import {
  getWorkspaceWindowBinding,
  loadSettings,
  loadWorkspaces,
  loadWorkspaceState
} from "~core/storage"
import {
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE_STATE,
  STORAGE_KEYS,
  type Settings,
  type Workspace,
  type WorkspaceState
} from "~core/types"
import {
  readCachedThemePreference,
  writeCachedThemePreference
} from "~lib/common"
import { setLoggerConsoleEnabled } from "~lib/logger"

type CurrentWindowProjection =
  | { status: "pending" | "unavailable" }
  | { status: "ready"; windowId: number; workspaceId: string | null }

const workspaceIdFromBindings = (value: unknown, windowId: number) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const binding = (value as Record<string, { workspaceId?: unknown }>)[
    String(windowId)
  ]
  return typeof binding?.workspaceId === "string" ? binding.workspaceId : null
}

const projectWorkspaceState = (
  state: WorkspaceState,
  projection: CurrentWindowProjection
): WorkspaceState => {
  if (projection.status !== "ready") return state
  return {
    ...state,
    activeWorkspaceId: projection.workspaceId,
    switchState:
      !state.switchState || state.switchState.windowId === projection.windowId
        ? state.switchState
        : null
  }
}

export const useWorkspaceData = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [settings, setSettings] = useState<Settings>(() => {
    const cachedTheme = readCachedThemePreference()
    return {
      ...DEFAULT_SETTINGS,
      ...(cachedTheme ? { theme: cachedTheme } : {})
    }
  })
  const [hydrated, setHydrated] = useState(false)
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(
    DEFAULT_WORKSPACE_STATE
  )

  useEffect(() => {
    let alive = true
    let currentWindow: CurrentWindowProjection = { status: "pending" }
    let latestBindingsValue: unknown
    let bindingsChangeGeneration = 0
    const loadState = {
      workspacesLoaded: false,
      settingsLoaded: false,
      workspaceStateLoaded: false
    }

    const markLoaded = (key: keyof typeof loadState) => {
      loadState[key] = true
    }

    const shouldApplyInitialValue = (key: keyof typeof loadState) => {
      return !loadState[key]
    }

    let settingsRefreshGeneration = 0
    const applyLoadedSettings = (nextSettings: Settings) => {
      writeCachedThemePreference(nextSettings.theme)
      setSettings(nextSettings)
      setLoggerConsoleEnabled(!!nextSettings.devMode)
    }
    const refreshSettings = () => {
      markLoaded("settingsLoaded")
      const generation = ++settingsRefreshGeneration
      void loadSettings()
        .then((nextSettings) => {
          if (!alive || generation !== settingsRefreshGeneration) return
          applyLoadedSettings(nextSettings)
        })
        .catch((error) => {
          console.warn("[TabPlex] 刷新设置失败", error)
        })
    }

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === "session" && changes[STORAGE_KEYS.WINDOW_BINDINGS]) {
        latestBindingsValue = changes[STORAGE_KEYS.WINDOW_BINDINGS].newValue
        bindingsChangeGeneration += 1
        if (currentWindow.status !== "ready") return
        currentWindow = {
          ...currentWindow,
          workspaceId: workspaceIdFromBindings(
            latestBindingsValue,
            currentWindow.windowId
          )
        }
        setWorkspaceState((previous) =>
          projectWorkspaceState(previous, currentWindow)
        )
        return
      }
      if (areaName === "local") {
        const canonicalWorkspacesChange = changes[STORAGE_KEYS.WORKSPACES]
        const legacyTagsChange = changes[STORAGE_KEYS.TAGS]
        if (canonicalWorkspacesChange) {
          markLoaded("workspacesLoaded")
          setWorkspaces(
            (canonicalWorkspacesChange.newValue as Workspace[] | undefined) ??
              []
          )
        } else if (legacyTagsChange?.newValue !== undefined) {
          markLoaded("workspacesLoaded")
          setWorkspaces(legacyTagsChange.newValue as Workspace[])
        }

        if (changes[STORAGE_KEYS.LOCAL_SETTINGS]) {
          refreshSettings()
        }

        const stateChanged = !!changes[STORAGE_KEYS.STATE]
        const switchChanged = !!changes[STORAGE_KEYS.SWITCH_STATE]
        if (stateChanged || switchChanged) {
          markLoaded("workspaceStateLoaded")
          const nextMain = stateChanged
            ? ((changes[STORAGE_KEYS.STATE].newValue as
                WorkspaceState | undefined) ?? DEFAULT_WORKSPACE_STATE)
            : null
          const rawNextSwitch = switchChanged
            ? (changes[STORAGE_KEYS.SWITCH_STATE].newValue ?? null)
            : undefined
          let nextSwitch: WorkspaceState["switchState"] | undefined
          if (rawNextSwitch && typeof rawNextSwitch === "object") {
            const storedSwitch = rawNextSwitch as NonNullable<
              WorkspaceState["switchState"]
            >
            nextSwitch = {
              ...storedSwitch,
              completedCount:
                storedSwitch.completedCount ?? storedSwitch.openedCount ?? 0,
              failedCount: storedSwitch.failedCount ?? 0,
              updatedAt: storedSwitch.updatedAt ?? storedSwitch.ts ?? Date.now()
            }
          } else {
            nextSwitch = rawNextSwitch as null | undefined
          }

          setWorkspaceState((prev) => {
            const base = nextMain
              ? { ...DEFAULT_WORKSPACE_STATE, ...nextMain }
              : prev
            return projectWorkspaceState(
              {
                ...base,
                switchState:
                  nextSwitch === undefined
                    ? (prev.switchState ?? null)
                    : nextSwitch
              },
              currentWindow
            )
          })
        }
      }
      if (areaName === "sync") {
        if (changes[STORAGE_KEYS.SETTINGS]) {
          refreshSettings()
        }
      }
    }

    chrome.storage.onChanged.addListener(listener)

    const resolveCurrentWindow = async () => {
      try {
        const window = await chrome.windows.getCurrent({ populate: false })
        if (
          typeof window.id !== "number" ||
          (window.type && window.type !== "normal")
        ) {
          currentWindow = { status: "unavailable" }
          return
        }

        const bindingGeneration = bindingsChangeGeneration
        const binding = await getWorkspaceWindowBinding(window.id)
        const workspaceId =
          bindingGeneration === bindingsChangeGeneration
            ? (binding?.workspaceId ?? null)
            : workspaceIdFromBindings(latestBindingsValue, window.id)
        currentWindow = { status: "ready", windowId: window.id, workspaceId }

        if (alive && loadState.workspaceStateLoaded) {
          setWorkspaceState((previous) =>
            projectWorkspaceState(previous, currentWindow)
          )
        }
      } catch {
        currentWindow = { status: "unavailable" }
      }
    }

    const init = async () => {
      try {
        const initialLoad = Promise.allSettled([
          loadWorkspaces(),
          loadSettings(),
          loadWorkspaceState()
        ] as const)

        await resolveCurrentWindow()

        const [workspacesResult, settingsResult, workspaceStateResult] =
          await initialLoad

        if (!alive) return

        if (
          workspacesResult.status === "fulfilled" &&
          shouldApplyInitialValue("workspacesLoaded")
        ) {
          markLoaded("workspacesLoaded")
          setWorkspaces(workspacesResult.value)
        }

        if (
          settingsResult.status === "fulfilled" &&
          shouldApplyInitialValue("settingsLoaded")
        ) {
          markLoaded("settingsLoaded")
          applyLoadedSettings(settingsResult.value)
        }

        if (
          workspaceStateResult.status === "fulfilled" &&
          shouldApplyInitialValue("workspaceStateLoaded")
        ) {
          markLoaded("workspaceStateLoaded")
          setWorkspaceState(
            projectWorkspaceState(workspaceStateResult.value, currentWindow)
          )
        }
      } catch (err) {
        console.warn("[TabPlex] 初始化工作区数据失败", err)
      } finally {
        if (alive) {
          setHydrated(true)
        }
      }
    }

    void init()

    return () => {
      alive = false
      chrome.storage.onChanged.removeListener(listener)
    }
  }, [])

  return { workspaces, settings, workspaceState, hydrated }
}
