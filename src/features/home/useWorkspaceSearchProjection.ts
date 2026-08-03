import { useMemo } from "react"

import {
  DEFAULT_SETTINGS,
  type Settings,
  type Workspace,
  type WorkspaceState
} from "~core/types"
import { groupWorkspacesByRecency } from "~shared/logic"

import { searchWorkspaces } from "./logic/workspaceSearch"

type WorkspaceSearchProjectionInput = {
  query: string
  workspaces: Workspace[]
  settings: Settings
  workspaceState: WorkspaceState
}

export const useWorkspaceSearchProjection = ({
  query,
  workspaces,
  settings,
  workspaceState
}: WorkspaceSearchProjectionInput) => {
  const matches = useMemo(() => {
    if (!query.trim()) return []
    return searchWorkspaces(workspaces, query, {
      notes: workspaceState.notes
    })
  }, [query, workspaces, workspaceState.notes])

  const searchMatchByWorkspaceId = useMemo(
    () => new Map(matches.map((match) => [match.workspaceId, match])),
    [matches]
  )

  const filteredWorkspaces = useMemo(() => {
    if (!query.trim()) return workspaces
    const byId = new Map(
      workspaces.map((workspace) => [workspace.id, workspace])
    )
    return matches
      .map((match) => byId.get(match.workspaceId))
      .filter((workspace): workspace is Workspace => !!workspace)
  }, [matches, query, workspaces])

  const groupedWorkspaces = useMemo(() => {
    if (query.trim()) {
      return [
        {
          title: "home.sidebar.group.results",
          items: filteredWorkspaces
        }
      ]
    }
    const sortKey =
      settings.workspaceSort ?? DEFAULT_SETTINGS.workspaceSort ?? "lastUsed"
    return groupWorkspacesByRecency(filteredWorkspaces, sortKey)
  }, [filteredWorkspaces, query, settings.workspaceSort])

  return {
    filteredWorkspaces,
    groupedWorkspaces,
    searchMatchByWorkspaceId
  }
}
