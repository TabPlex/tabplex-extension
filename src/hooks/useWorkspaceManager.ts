import { useMemo } from "react"

import { useWorkspaceActions } from "~features/workspace/hooks/useWorkspaceActions"
import type { CreateWorkspaceOptions } from "~features/workspace/hooks/workspaceCrudActions"
import { useWorkspaceDataContext } from "~features/workspace/WorkspaceDataProvider"
import { useBrowserTheme } from "~hooks/useBrowserTheme"

export type CreateOptions = CreateWorkspaceOptions

export const useWorkspaceManager = () => {
  const {
    workspaces,
    settings,
    workspaceState,
    hydrated,
    workspaceTabsLoading
  } = useWorkspaceDataContext()
  const actions = useWorkspaceActions()
  const browserTheme = useBrowserTheme()

  const sortedWorkspaces = useMemo(() => {
    const sortKey = settings.workspaceSort || "created"
    const active = workspaces.filter((t) => !t.trashedAt)
    return active.sort((a, b) => {
      if (sortKey === "created") {
        return b.createdAt - a.createdAt
      }
      const timeA = a.lastUsedAt ?? a.createdAt
      const timeB = b.lastUsedAt ?? b.createdAt
      return timeB - timeA
    })
  }, [workspaces, settings.workspaceSort])

  const trashedWorkspaces = useMemo(
    () =>
      workspaces
        .filter((t) => t.trashedAt && (t.tabs?.length ?? 0) > 0)
        .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)),
    [workspaces]
  )

  const resolvedTheme = useMemo(() => {
    if (settings.theme === "system") {
      return browserTheme
    }
    return settings.theme
  }, [settings.theme, browserTheme])

  const version = useMemo(() => chrome.runtime.getManifest().version, [])

  return useMemo(
    () => ({
      workspaces,
      sortedWorkspaces,
      trashedWorkspaces,
      settings,
      workspaceState,
      hydrated,
      workspaceTabsLoading,
      resolvedTheme,
      version,
      ...actions
    }),
    [
      actions,
      hydrated,
      resolvedTheme,
      settings,
      sortedWorkspaces,
      trashedWorkspaces,
      version,
      workspaceState,
      workspaceTabsLoading,
      workspaces
    ]
  )
}

export * from "~features/workspace/WorkspaceDataProvider"
export * from "~features/workspace/hooks/useWorkspaceActions"
