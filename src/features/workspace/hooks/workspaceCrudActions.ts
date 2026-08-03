import { loadSettings, loadWorkspaces } from "~core/storage"
import type { Settings, TabSpec, Workspace } from "~core/types"
import {
  getCurrentWindowTabs,
  randomWorkspaceEmoji,
  resolveTabUrl,
  uuid
} from "~core/utils"
import { colorChoices } from "~core/utils/colors"
import { getNextIndexedName } from "~lib/common"

import { capturePortableTabGroups } from "../logic/portableTabGroups"
import { sanitizeTabSpecs, sanitizeWorkspace } from "../logic/workspaceLogic"
import {
  getCurrentNormalWindowId,
  requestSettingUpdate,
  requestWorkspacesApply,
  requestWorkspaceSwitch
} from "./workspaceActionRequests"

export type CreateWorkspaceOptions = {
  name?: string
  emoji?: string | null
  color?: string | null
  activate?: boolean
  tabs?: TabSpec[]
  seedFromCurrentWindow?: boolean
  preferredWindowId?: number
}

export type CreateWorkspaceResult = {
  workspace: Workspace
  activation:
    | { status: "not-requested" }
    | { status: "activated" }
    | { status: "failed"; error: string }
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "workspace-switch-failed"

export const createWorkspace = async (options: CreateWorkspaceOptions = {}) => {
  const settings = await loadSettings()
  const windowId =
    options.preferredWindowId ?? (await getCurrentNormalWindowId())
  let initialTabs = options.tabs ?? []
  if (!initialTabs.length && options.seedFromCurrentWindow !== false) {
    const liveTabs = await getCurrentWindowTabs(
      typeof windowId === "number" ? { windowId } : undefined
    )
    initialTabs = await capturePortableTabGroups({
      liveTabs,
      liveSpecs: sanitizeTabSpecs(
        liveTabs.map((tab) => ({
          url: resolveTabUrl(tab),
          pinned: tab.pinned,
          title: tab.title ?? "",
          faviconUrl: tab.favIconUrl
        }))
      ),
      previousTabs: []
    })
  }

  const palette = colorChoices(settings.accentColor)
  const color =
    options.color === undefined
      ? palette[Math.floor(Math.random() * palette.length)] ??
        settings.accentColor
      : options.color
  const emoji =
    options.emoji === undefined
      ? randomWorkspaceEmoji()
      : options.emoji || undefined
  const name =
    options.name ??
    getNextIndexedName(
      (await loadWorkspaces()).map((workspace) => workspace.name),
      "工作区"
    )
  const workspace = sanitizeWorkspace({
    id: uuid(),
    name,
    emoji,
    color,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    updatedAt: Date.now(),
    tabs: initialTabs,
    tabsRevision: 0,
    history: []
  })

  const response = await requestWorkspacesApply(
    { kind: "create", workspace },
    windowId
  )
  const created = (response.result as Workspace | undefined) ?? workspace
  if (!options.activate) {
    return {
      workspace: created,
      activation: { status: "not-requested" }
    } satisfies CreateWorkspaceResult
  }

  try {
    await requestWorkspaceSwitch(created.id, windowId)
    return {
      workspace: created,
      activation: { status: "activated" }
    } satisfies CreateWorkspaceResult
  } catch (error) {
    // The record is already durable at this point. Report partial success so
    // callers never encourage a retry that creates a duplicate workspace.
    return {
      workspace: created,
      activation: {
        status: "failed",
        error: getErrorMessage(error)
      }
    } satisfies CreateWorkspaceResult
  }
}

export const switchTo = (
  workspaceId: string,
  options?: { preferredWindowId?: number }
) => requestWorkspaceSwitch(workspaceId, options?.preferredWindowId)

export const updateSetting = <K extends keyof Settings>(
  key: K,
  value: Settings[K]
) => requestSettingUpdate(key, value)

export const renameWorkspace = (id: string, name: string) =>
  requestWorkspacesApply({ kind: "rename", id, name }).then(() => undefined)

export const recolorWorkspace = (id: string, color: string | null) =>
  requestWorkspacesApply({ kind: "recolor", id, color }).then(() => undefined)

export const updateWorkspaceEmoji = (id: string, emoji: string | null) =>
  requestWorkspacesApply({ kind: "emoji", id, emoji }).then(() => undefined)

export const setTabExcluded = (
  workspaceId: string,
  tabIndexOrUrl: number | string,
  excluded: boolean
) =>
  requestWorkspacesApply({
    kind: "exclude-tab",
    workspaceId,
    tabIndexOrUrl,
    excluded
  }).then(() => undefined)

export const removeWorkspace = (id: string) =>
  requestWorkspacesApply({ kind: "remove", id }).then(() => undefined)

export const restoreWorkspace = async (id: string) => {
  const response = await requestWorkspacesApply({ kind: "restore", id })
  return (response.result as boolean | undefined) ?? true
}

export const permanentlyDeleteWorkspace = (id: string) =>
  requestWorkspacesApply({ kind: "delete", id }).then(() => undefined)

export const emptyTrash = () =>
  requestWorkspacesApply({ kind: "empty-trash" }).then(() => undefined)
