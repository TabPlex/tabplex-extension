const isTabId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0

/**
 * Chrome can briefly omit newly created tabs from tabs.query while tabs.get
 * already knows about them. Supplement the query with transaction-owned tab
 * IDs so callers never mistake that transient view for an empty workspace.
 */
export const loadWorkspaceWindowTabsById = async (
  windowId: number,
  expectedTabIds: readonly number[] = []
) => {
  const queriedTabs = await chrome.tabs.query({ windowId })
  const tabsById = new Map<number, chrome.tabs.Tab>()

  for (const tab of queriedTabs) {
    if (isTabId(tab.id)) tabsById.set(tab.id, tab)
  }

  const missingTabIds = Array.from(new Set(expectedTabIds)).filter(
    (tabId) => isTabId(tabId) && !tabsById.has(tabId)
  )
  const missingTabs = await Promise.all(
    missingTabIds.map(async (tabId) => {
      try {
        return await chrome.tabs.get(tabId)
      } catch {
        return null
      }
    })
  )

  for (const tab of missingTabs) {
    if (tab && isTabId(tab.id) && tab.windowId === windowId) {
      tabsById.set(tab.id, tab)
    }
  }

  return tabsById
}
