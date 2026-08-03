import { loadWorkspaceState } from "~core/storage"
import type { WorkspaceLinkedResource } from "~core/types"
import {
  addWorkspaceLinkedResource,
  removeWorkspaceLinkedResource
} from "~features/context/logic/workspaceLinkedResources"

import { requestWorkspaceStatePatch } from "./workspaceActionRequests"

export const setWorkspaceNote = (id: string, note: string) =>
  requestWorkspaceStatePatch({ notes: { [id]: note } })

export const setWorkspaceNotePreview = (id: string, preview: boolean) =>
  requestWorkspaceStatePatch({ notePreview: { [id]: preview } })

export const setWorkspaceLinkedResources = (
  id: string,
  resources: WorkspaceLinkedResource[]
) => requestWorkspaceStatePatch({ linkedResources: { [id]: resources } })

export const addLinkedResourceToWorkspace = async (
  id: string,
  inputUrl: string
) => {
  const state = await loadWorkspaceState()
  const result = addWorkspaceLinkedResource(
    state.linkedResources?.[id] ?? [],
    inputUrl
  )
  if (result.kind === "added") {
    await setWorkspaceLinkedResources(id, result.resources)
  }
  return result
}

export const removeLinkedResourceFromWorkspace = async (
  id: string,
  resourceId: string
) => {
  const state = await loadWorkspaceState()
  const next = removeWorkspaceLinkedResource(
    state.linkedResources?.[id] ?? [],
    resourceId
  )
  await setWorkspaceLinkedResources(id, next)
  return next
}
