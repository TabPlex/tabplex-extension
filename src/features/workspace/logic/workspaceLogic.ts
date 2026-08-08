import type { TabSpec, Workspace, WorkspaceSnapshot } from "~core/types"
import { isSafeTabUrl, normalizeEmoji, resolveTabUrl, uuid } from "~core/utils"
import { normalizeWorkspaceColor } from "~core/utils/colors"

import { sanitizePortableTabGroup } from "./portableTabGroups"
import { setWorkspaceTabExcluded } from "./workspaceTabState"

const normalizeTabsRevision = (value: number | undefined) =>
  Number.isSafeInteger(value) && (value ?? -1) >= 0 ? (value as number) : 0

export const sanitizeTabSpecs = (tabs: TabSpec[] = []) => {
  return tabs
    .filter((spec): spec is TabSpec => !!spec && typeof spec === "object")
    .filter((spec) => isSafeTabUrl(spec.url))
    .map((spec) => ({
      url: spec.url,
      pinned: spec.pinned,
      title: spec.title,
      faviconUrl: spec.faviconUrl,
      lastAccessedAt: spec.lastAccessedAt,
      excluded: typeof spec.excluded === "boolean" ? spec.excluded : undefined,
      group: sanitizePortableTabGroup(spec.group)
    }))
}

export const buildTabSpecsFromTabs = (tabs: chrome.tabs.Tab[] = []) =>
  sanitizeTabSpecs(
    tabs.map((tab) => ({
      url: resolveTabUrl(tab),
      pinned: tab.pinned,
      title: tab.title ?? "",
      faviconUrl: tab.favIconUrl ?? ""
    }))
  )

const filterRecordableTabs = (tabs: TabSpec[] = []) =>
  sanitizeTabSpecs(tabs).filter((tab) => !tab.pinned && !tab.excluded)

const sanitizeHistoryTabs = (tabs: TabSpec[] = []) => filterRecordableTabs(tabs)

const sanitizeHistory = (history?: WorkspaceSnapshot[]) =>
  history?.map((entry) => ({
    ...entry,
    tabs: sanitizeHistoryTabs(entry.tabs)
  })) ?? []

export const sanitizeWorkspace = (tag: Workspace): Workspace => {
  const workspace = { ...tag } as Workspace & { excluded?: unknown }
  delete workspace.excluded

  const normalizedEmoji = normalizeEmoji(workspace.emoji) || undefined
  const normalizedColor =
    workspace.color === undefined
      ? undefined
      : (normalizeWorkspaceColor(workspace.color) ?? null)

  return {
    ...workspace,
    color: normalizedColor,
    emoji: normalizedEmoji,
    tabs: sanitizeTabSpecs(workspace.tabs)
      .filter((tab) => !tab.pinned)
      .map((tab) => ({ ...tab, pinned: false })),
    tabsRevision: normalizeTabsRevision(workspace.tabsRevision),
    history: sanitizeHistory(workspace.history)
  }
}

export const recordSnapshot = (tag: Workspace, tabs: TabSpec[]): Workspace => {
  const entry: WorkspaceSnapshot = {
    id: uuid(),
    createdAt: Date.now(),
    tabs: sanitizeHistoryTabs(tabs)
  }
  const history = [entry, ...(tag.history ?? [])].slice(0, 15)
  return { ...tag, history }
}

const tabStructuralKey = (tab: TabSpec) => {
  const url = tab.url || ""
  if (tab.pinned) return null
  // 如果 URL 为空，直接忽略，避免空字符串导致的误判
  if (!url) return null

  try {
    // 严格使用 Origin (协议+域名+端口) 作为唯一标识
    // 这样可以确保同一网站下的路径、参数、Hash 变化（如 SPA 跳转）不会被视为结构性变化
    // 从而避免被记录到时间线历史中
    return `${new URL(url).origin}`
  } catch {
    // 如果 URL 解析失败（例如非标准 URL），直接返回 null 忽略该标签页
    // 绝不使用完整 URL 兜底，否则路径变化会被误记录
    return null
  }
}

const countStructuralKeys = (tabs: TabSpec[]) => {
  const counts = new Map<string, number>()
  for (const tab of filterRecordableTabs(tabs)) {
    const key = tabStructuralKey(tab)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

// 判断是否发生了结构性变化，决定是否需要记录到工作区历史中。
// 我们有意忽略同一 Origin 下的路径或参数变化，以避免
// SPA 应用的内部跳转（如 /settings -> /settings/mfa）产生大量无意义的历史记录。
export const hasStructuralTabChanges = (
  previous: TabSpec[] = [],
  next: TabSpec[] = []
) => {
  const prevCounts = countStructuralKeys(previous)
  const nextCounts = countStructuralKeys(next)
  if (prevCounts.size !== nextCounts.size) return true
  for (const [key, value] of prevCounts) {
    if ((nextCounts.get(key) ?? 0) !== value) return true
  }
  return false
}

export const applyTabExclusion = (
  workspace: Workspace,
  tabIndexOrUrl: number | string,
  excluded: boolean
) => {
  const result = setWorkspaceTabExcluded(workspace, tabIndexOrUrl, excluded)
  if (!result.changed || !result.tab) return workspace

  const history = excluded
    ? (workspace.history ?? []).map((entry) => ({
        ...entry,
        tabs: entry.tabs.filter((tab) => tab.url !== result.tab?.url)
      }))
    : (workspace.history ?? [])
  return { ...result.workspace, history }
}
