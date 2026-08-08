import type { TabSpec, WorkspaceSnapshot } from "~core/types"

export type TimelineDiffResult = {
  additions: TabSpec[]
  removals: TabSpec[]
}

export type TimelineSummaryAgainstCurrent = {
  entry: WorkspaceSnapshot
  additions: TabSpec[]
  removals: TabSpec[]
  tabCount: number
}

const normalizeForDiff = (url?: string | null) => {
  if (!url) return ""
  try {
    const parsed = new URL(url)
    parsed.hash = ""
    parsed.search = ""
    return parsed.toString()
  } catch {
    return url
  }
}

export const getTimelineDiffKey = (tab: TabSpec) => {
  if (tab.pinned || tab.excluded) return ""
  const normalized = normalizeForDiff(tab.url)
  if (!normalized) return ""
  return `${normalized}::n`
}

const groupTabsByDiffKey = (tabs: TabSpec[] = []) => {
  const bucket = new Map<string, TabSpec[]>()

  for (const tab of tabs) {
    const key = getTimelineDiffKey(tab)
    if (!key) continue

    const list = bucket.get(key)
    if (list) {
      list.push(tab)
    } else {
      bucket.set(key, [tab])
    }
  }

  return bucket
}

export const diffSnapshotAgainstCurrent = (
  currentTabs: TabSpec[] = [],
  snapshotTabs: TabSpec[] = []
): TimelineDiffResult => {
  const currentBucket = groupTabsByDiffKey(currentTabs)
  const snapshotBucket = groupTabsByDiffKey(snapshotTabs)

  const additions: TabSpec[] = []
  const removals: TabSpec[] = []

  snapshotBucket.forEach((tabs, key) => {
    const current = currentBucket.get(key) ?? []
    if (tabs.length > current.length) {
      additions.push(...tabs.slice(current.length))
    }
  })

  currentBucket.forEach((tabs, key) => {
    const snapshot = snapshotBucket.get(key) ?? []
    if (tabs.length > snapshot.length) {
      removals.push(...tabs.slice(snapshot.length))
    }
  })

  return { additions, removals }
}

export const buildTimelineSummariesAgainstCurrent = (
  history: WorkspaceSnapshot[] = [],
  currentTabs: TabSpec[] = []
): TimelineSummaryAgainstCurrent[] => {
  const seenSeconds = new Set<number>()
  const summaries: TimelineSummaryAgainstCurrent[] = []

  for (const entry of history) {
    const diff = diffSnapshotAgainstCurrent(currentTabs, entry.tabs ?? [])
    if (!diff.additions.length && !diff.removals.length) continue

    const bucket = Math.floor(entry.createdAt / 1000)
    if (seenSeconds.has(bucket)) continue
    seenSeconds.add(bucket)

    summaries.push({
      entry,
      additions: diff.additions,
      removals: diff.removals,
      tabCount: (entry.tabs ?? []).filter((tab) => !tab.pinned).length
    })
  }

  return summaries
}
