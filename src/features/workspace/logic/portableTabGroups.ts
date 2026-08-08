import type { PortableTabGroup, TabSpec } from "~core/types"
import { normalizeUrlForMatch, resolveTabUrl } from "~core/utils"

const PORTABLE_GROUP_COLORS = new Set<PortableTabGroup["color"]>([
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange"
])

export const sanitizePortableTabGroup = (
  group: TabSpec["group"]
): PortableTabGroup | undefined => {
  if (!group) return undefined
  const key = group.key?.trim()
  if (!key) return undefined
  return {
    key,
    title: typeof group.title === "string" ? group.title : undefined,
    color: PORTABLE_GROUP_COLORS.has(group.color) ? group.color : undefined,
    collapsed:
      typeof group.collapsed === "boolean" ? group.collapsed : undefined
  }
}

export const preservePortableTabGroups = (
  liveTabs: TabSpec[],
  previousTabs: TabSpec[]
) => {
  const stateByUrl = new Map<
    string,
    Array<{
      group?: PortableTabGroup
      excluded?: boolean
    }>
  >()
  for (const tab of previousTabs) {
    const url = normalizeUrlForMatch(tab.url)
    if (!url) continue
    const states = stateByUrl.get(url) ?? []
    states.push({
      group: sanitizePortableTabGroup(tab.group),
      excluded: typeof tab.excluded === "boolean" ? tab.excluded : undefined
    })
    stateByUrl.set(url, states)
  }

  return liveTabs.map((tab) => {
    const url = normalizeUrlForMatch(tab.url)
    const previous = url ? stateByUrl.get(url)?.shift() : undefined
    return {
      ...tab,
      excluded:
        typeof tab.excluded === "boolean" ? tab.excluded : previous?.excluded,
      group: previous?.group ? { ...previous.group } : undefined
    }
  })
}

const matchLiveTabsToSpecs = (
  liveTabs: chrome.tabs.Tab[],
  liveSpecs: TabSpec[]
) => {
  const tabsByUrl = new Map<string, chrome.tabs.Tab[]>()
  for (const tab of liveTabs) {
    const url = normalizeUrlForMatch(resolveTabUrl(tab))
    if (!url) continue
    const current = tabsByUrl.get(url) ?? []
    current.push(tab)
    tabsByUrl.set(url, current)
  }

  return liveSpecs.map((spec) => {
    const url = normalizeUrlForMatch(spec.url)
    return url ? tabsByUrl.get(url)?.shift() : undefined
  })
}

const isRuntimeGrouped = (tab?: chrome.tabs.Tab) =>
  typeof tab?.groupId === "number" && tab.groupId >= 0

const nextGeneratedGroupKey = (usedKeys: Set<string>, ordinal: number) => {
  let candidate = `tab-group-${ordinal + 1}`
  let suffix = 2
  while (usedKeys.has(candidate)) {
    candidate = `tab-group-${ordinal + 1}-${suffix}`
    suffix += 1
  }
  usedKeys.add(candidate)
  return candidate
}

export const capturePortableTabGroups = async ({
  liveTabs,
  liveSpecs,
  previousTabs
}: {
  liveTabs: chrome.tabs.Tab[]
  liveSpecs: TabSpec[]
  previousTabs: TabSpec[]
}) => {
  const fallback = preservePortableTabGroups(liveSpecs, previousTabs)
  const matchedTabs = matchLiveTabsToSpecs(liveTabs, liveSpecs)
  const groupIds: number[] = []
  for (const tab of matchedTabs) {
    if (!isRuntimeGrouped(tab)) continue
    const groupId = tab?.groupId
    if (typeof groupId === "number" && !groupIds.includes(groupId)) {
      groupIds.push(groupId)
    }
  }

  const usedKeys = new Set(
    fallback.flatMap((tab) => (tab.group?.key ? [tab.group.key] : []))
  )
  const metadataByRuntimeId = new Map<number, PortableTabGroup>()
  if (typeof chrome.tabGroups?.get === "function") {
    await Promise.all(
      groupIds.map(async (groupId, ordinal) => {
        try {
          const liveGroup = await chrome.tabGroups.get(groupId)
          const previousKeys = new Set(
            fallback.flatMap((spec, index) =>
              matchedTabs[index]?.groupId === groupId && spec.group?.key
                ? [spec.group.key]
                : []
            )
          )
          const previousKey =
            previousKeys.size === 1 ? [...previousKeys][0] : undefined
          const key = previousKey ?? nextGeneratedGroupKey(usedKeys, ordinal)
          const portable = sanitizePortableTabGroup({
            key,
            title: liveGroup.title || undefined,
            color: liveGroup.color,
            collapsed: liveGroup.collapsed
          })
          if (portable) metadataByRuntimeId.set(groupId, portable)
        } catch {
          // Preserve prior portable metadata when Chrome closes or ungroups a
          // tab between tabs.query and tabGroups.get.
        }
      })
    )
  }

  return liveSpecs.map((spec, index) => {
    const liveTab = matchedTabs[index]
    const base = fallback[index] ?? spec
    if (!isRuntimeGrouped(liveTab)) return { ...base, group: undefined }
    const groupId = liveTab?.groupId
    const captured =
      typeof groupId === "number" ? metadataByRuntimeId.get(groupId) : undefined
    return {
      ...base,
      group: captured ? { ...captured } : fallback[index]?.group
    }
  })
}
