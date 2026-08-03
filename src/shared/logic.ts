import type { TabSpec, Workspace } from "~core/types"

// --- Recency grouping helpers for workspace lists ---
const startOfLocalDay = (time: number) => {
  const d = new Date(time)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const recencyBucketTitle = (ts?: number, now: number = Date.now()) => {
  if (!ts) return "home.sidebar.group.earlier"
  const startToday = startOfLocalDay(now)
  const startYesterday = startToday - 24 * 60 * 60 * 1000
  const sevenDaysAgo = startToday - 7 * 24 * 60 * 60 * 1000
  if (ts >= startToday) return "home.sidebar.group.today"
  if (ts >= startYesterday) return "home.sidebar.group.yesterday"
  if (ts >= sevenDaysAgo) return "home.sidebar.group.week"
  return "home.sidebar.group.earlier"
}

export const groupWorkspacesByRecency = (
  tags: Workspace[],
  sortKey: "lastUsed" | "created" = "lastUsed",
  now: number = Date.now()
) => {
  const groups: { title: string; items: Workspace[] }[] = []
  const map = new Map<string, Workspace[]>()
  for (const tag of tags) {
    const ts =
      sortKey === "created" ? tag.createdAt : tag.lastUsedAt ?? tag.createdAt
    const title = recencyBucketTitle(ts, now)
    const list = map.get(title)
    if (list) list.push(tag)
    else map.set(title, [tag])
  }
  // Preserve logical order
  const order = [
    "home.sidebar.group.today",
    "home.sidebar.group.yesterday",
    "home.sidebar.group.week",
    "home.sidebar.group.earlier"
  ]
  for (const groupTitle of order) {
    const items = map.get(groupTitle)
    if (items && items.length) {
      // Inside each group, order by selected key desc
      const getTs = (t: Workspace) =>
        sortKey === "created"
          ? t.createdAt ?? 0
          : t.lastUsedAt ?? t.createdAt ?? 0
      items.sort((a, b) => getTs(b) - getTs(a))
      groups.push({ title: groupTitle, items })
    }
  }
  return groups
}

const GOOGLE_HOST_RE = /(^|\.)google\.[a-z.]+$/

const decodeSearchQuery = (value: string) =>
  value.replace(/\+/g, " ").replace(/\s+/g, " ").trim()

const extractGoogleSearchQuery = (url?: string | null) => {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (!GOOGLE_HOST_RE.test(host)) return null
    const path = parsed.pathname
    const eligiblePath =
      path === "/" || path === "/webhp" || path.startsWith("/search")
    if (!eligiblePath) return null
    const raw = parsed.searchParams.get("q")
    if (!raw) return null
    const decoded = decodeSearchQuery(raw)
    return decoded || null
  } catch {
    return null
  }
}

export const getTabDisplayTitle = (
  tab: Pick<TabSpec, "title" | "url">,
  fallback?: string
) => {
  const raw = (tab.title || "").trim()
  const query = extractGoogleSearchQuery(tab.url)
  if (query) {
    return `Google 搜索：${query}`
  }
  if (raw) return raw
  if (fallback && fallback.trim()) return fallback.trim()
  return tab.url
}

export const canOpenWorkspaceTimeline = (workspace?: Workspace | null) => {
  if (!workspace) return false
  return !!workspace.history?.length
}
