import type { TabSpec } from "~core/types"

const cloneTab = (tab: TabSpec): TabSpec => ({ ...tab })

export const prepareTabMove = (sourceTabs: TabSpec[], indexes: number[]) => {
  const uniqueIndexes = Array.from(new Set(indexes)).filter((value) =>
    Number.isInteger(value)
  )
  if (!uniqueIndexes.length) {
    return {
      movingTabs: [] as TabSpec[],
      nextSourceTabs: [...sourceTabs]
    }
  }
  const sortedIndexes = uniqueIndexes.sort((a, b) => a - b)
  const movingPairs: Array<{ index: number; tab: TabSpec }> = []
  for (const idx of sortedIndexes) {
    if (idx < 0 || idx >= sourceTabs.length) continue
    const candidate = sourceTabs[idx]
    if (!candidate || candidate.pinned) continue
    movingPairs.push({ index: idx, tab: cloneTab(candidate) })
  }
  if (!movingPairs.length) {
    return {
      movingTabs: [] as TabSpec[],
      nextSourceTabs: [...sourceTabs]
    }
  }
  const nextSourceTabs = [...sourceTabs]
  for (const pair of [...movingPairs].sort((a, b) => b.index - a.index)) {
    nextSourceTabs.splice(pair.index, 1)
  }
  return {
    movingTabs: movingPairs.map((pair) => pair.tab),
    nextSourceTabs
  }
}
