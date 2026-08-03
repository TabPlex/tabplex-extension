const closingTabs = new Set<number>()

export const markTabsClosing = (tabIds: number[]) => {
  for (const tabId of tabIds) {
    if (typeof tabId !== "number") continue
    closingTabs.add(tabId)
  }
}

export const unmarkTabClosing = (tabId: number) => {
  closingTabs.delete(tabId)
}

export const isTabClosing = (tabId: number) => {
  return closingTabs.has(tabId)
}
