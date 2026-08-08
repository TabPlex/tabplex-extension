import type { TabSpec, Workspace } from "~core/types"
import { prepareTabMove } from "~lib/workspaceUtils"

type TabLocator = number | string

type WorkspaceTabMutation = {
  workspace: Workspace
  changed: boolean
  tab?: TabSpec
}

const cloneTab = (tab: TabSpec): TabSpec => ({
  ...tab,
  group: tab.group ? { ...tab.group } : undefined
})

const normalizeRevision = (value: number | undefined) =>
  Number.isSafeInteger(value) && (value ?? -1) >= 0 ? (value as number) : 0

const cloneWorkspaceTabs = (workspace: Workspace) =>
  (workspace.tabs ?? []).filter((tab) => !tab.pinned).map(cloneTab)

const sameTabs = (left: TabSpec[], right: TabSpec[]) =>
  JSON.stringify(left) === JSON.stringify(right)

export const replaceWorkspaceTabs = (
  workspace: Workspace,
  tabs: TabSpec[]
): Workspace => {
  const currentTabs = cloneWorkspaceTabs(workspace)
  const nextTabs = tabs.filter((tab) => !tab.pinned).map(cloneTab)
  if (sameTabs(currentTabs, nextTabs)) {
    return { ...workspace, tabs: currentTabs }
  }
  return {
    ...workspace,
    tabs: nextTabs,
    tabsRevision: normalizeRevision(workspace.tabsRevision) + 1
  }
}

const findTabIndex = (tabs: TabSpec[], locator: TabLocator) => {
  if (typeof locator === "number") {
    return Number.isInteger(locator) && locator >= 0 && locator < tabs.length
      ? locator
      : -1
  }
  return tabs.findIndex((tab) => tab.url === locator)
}

export const getWorkspaceTabs = (workspace: Workspace) =>
  cloneWorkspaceTabs(workspace)

export const appendWorkspaceTabs = (workspace: Workspace, tabs: TabSpec[]) =>
  replaceWorkspaceTabs(workspace, [...cloneWorkspaceTabs(workspace), ...tabs])

export const setWorkspaceTabExcluded = (
  workspace: Workspace,
  locator: TabLocator,
  excluded: boolean
): WorkspaceTabMutation => {
  const tabs = cloneWorkspaceTabs(workspace)
  const index = findTabIndex(tabs, locator)
  if (index < 0) return { workspace: { ...workspace, tabs }, changed: false }

  const tab = tabs[index]
  if (tab.excluded === excluded) {
    return { workspace: { ...workspace, tabs }, changed: false, tab }
  }

  tabs[index] = { ...tab, excluded }
  return {
    workspace: replaceWorkspaceTabs(workspace, tabs),
    changed: true,
    tab
  }
}

export const removeWorkspaceTab = (
  workspace: Workspace,
  locator: TabLocator
): WorkspaceTabMutation => {
  const tabs = cloneWorkspaceTabs(workspace)
  const index = findTabIndex(tabs, locator)
  if (index < 0) return { workspace: { ...workspace, tabs }, changed: false }

  const [tab] = tabs.splice(index, 1)
  return {
    workspace: replaceWorkspaceTabs(workspace, tabs),
    changed: true,
    tab
  }
}

export const extractMovableWorkspaceTabs = (
  workspace: Workspace,
  flatIndexes: number[]
) => {
  const currentTabs = cloneWorkspaceTabs(workspace)
  const { movingTabs, nextSourceTabs } = prepareTabMove(
    currentTabs,
    flatIndexes
  )
  return {
    workspace: movingTabs.length
      ? replaceWorkspaceTabs(workspace, nextSourceTabs)
      : { ...workspace, tabs: currentTabs },
    movingTabs
  }
}

export const restoreWorkspaceTabsFromSnapshot = (
  workspace: Workspace,
  snapshotTabs: TabSpec[]
) => replaceWorkspaceTabs(workspace, snapshotTabs)
