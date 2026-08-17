/**
 * Home 标签页管理服务
 * 负责：URL 检测、显式打开当前窗口 Home、导航拦截
 */
import { resolveTabUrl } from "~core/utils"

// --- 模块状态 ---
const homeNavigationLocks = new Set<number>()
const homeTabIds = new Set<number>()

// --- URL 工具 ---
const HOME_PATH = "popup.html"

export const getHomeBaseUrl = () => chrome.runtime.getURL(HOME_PATH)

const getHomeTargetUrl = () => {
  const base = getHomeBaseUrl()
  const url = new URL(base)
  url.searchParams.set("mode", "home")
  url.searchParams.set("v", chrome.runtime.getManifest().version)
  return { base, target: url.toString() }
}

const getTabPendingUrl = (tab: chrome.tabs.Tab) =>
  (tab as chrome.tabs.Tab & { pendingUrl?: string }).pendingUrl ?? ""

const parseMatchingHomeUrl = (tabUrl: string | undefined, homeBase: string) => {
  if (!tabUrl) return null
  try {
    const base = new URL(homeBase)
    const current = new URL(tabUrl)
    if (current.origin !== base.origin) return null
    if (current.pathname !== base.pathname) return null
    return current
  } catch {
    return null
  }
}

export const isHomeUrl = (tabUrl: string | undefined, homeBase: string) => {
  const current = parseMatchingHomeUrl(tabUrl, homeBase)
  return current?.searchParams.get("mode") === "home"
}

const isUpToDateHomeUrl = (tabUrl: string | undefined, homeBase: string) => {
  const current = parseMatchingHomeUrl(tabUrl, homeBase)
  return Boolean(
    current &&
    current.searchParams.get("mode") === "home" &&
    current.searchParams.get("v") === chrome.runtime.getManifest().version
  )
}

// --- 去重 & 固定 ---
export async function dedupeAndPinHome(
  windowId: number,
  homeBase: string,
  homeUrl: string,
  activate: boolean
) {
  const tabs = await chrome.tabs.query({ windowId })
  const isHome = (t: chrome.tabs.Tab) => isHomeUrl(t.url, homeBase)
  const homeTabs = tabs.filter(isHome)
  const kept = homeTabs[0]
  const dupIds = homeTabs
    .slice(1)
    .map((t) => t.id!)
    .filter(Boolean)
  if (dupIds.length) await chrome.tabs.remove(dupIds)
  if (kept?.id) {
    const update: chrome.tabs.UpdateProperties = {}
    if (!kept.pinned) update.pinned = true
    if (activate && !kept.active) update.active = true
    if (!isUpToDateHomeUrl(kept.url, homeBase)) update.url = homeUrl
    if (Object.keys(update).length > 0) {
      try {
        await chrome.tabs.update(kept.id, update)
      } catch (err) {
        console.warn("[TabPlex] 更新 Home 标签失败", err)
        throw err
      }
    }
  } else {
    await chrome.tabs.create({
      windowId,
      url: homeUrl,
      pinned: true,
      active: activate
    })
  }
  if (activate) {
    try {
      console.debug(
        "[TabPlex:focus] dedupeAndPinHome windows.update focused:true",
        { windowId }
      )
      await chrome.windows.update(windowId, { focused: true })
    } catch (err) {
      console.warn("[TabPlex] 聚焦窗口失败", err)
    }
  }
}

export async function openAndPinHomeInWindow(
  windowId: number,
  activate: boolean
) {
  if (!Number.isSafeInteger(windowId) || windowId < 0) {
    throw new Error("invalid-home-window-id")
  }
  const targetWindow = await chrome.windows.get(windowId, { populate: false })
  if (targetWindow.type !== "normal") {
    throw new Error("home-window-not-normal")
  }
  const { base, target } = getHomeTargetUrl()
  await dedupeAndPinHome(windowId, base, target, activate)
}

export async function getCurrentNormalWindowId() {
  try {
    const currentWindow = await chrome.windows.getLastFocused({
      populate: false,
      windowTypes: ["normal"]
    })
    return currentWindow.type === "normal" &&
      typeof currentWindow.id === "number"
      ? currentWindow.id
      : undefined
  } catch {
    return undefined
  }
}

export async function openAndPinHomeInCurrentWindow(activate: boolean) {
  const windowId = await getCurrentNormalWindowId()
  if (windowId === undefined) throw new Error("current-normal-window-not-found")
  await openAndPinHomeInWindow(windowId, activate)
}

export async function openPinnedHomeAfterInstall(
  details: Pick<chrome.runtime.InstalledDetails, "reason">,
  openHome: (activate: boolean) => Promise<void> = openAndPinHomeInCurrentWindow
) {
  if (details.reason !== "install") return false
  await openHome(false)
  return true
}

// --- 导航拦截 ---
const handleHomeNavigation = async (
  tabId: number,
  changeInfo: chrome.tabs.OnUpdatedInfo,
  tab: chrome.tabs.Tab,
  wasHomeTab: boolean
) => {
  if (!tab.active || !tab.pinned) return
  const pendingUrl = getTabPendingUrl(tab)
  if (!changeInfo.url && !pendingUrl) return
  const targetUrl = changeInfo.url || resolveTabUrl(tab)
  const { base: homeBase, target: homeTargetUrl } = getHomeTargetUrl()
  if (!isHomeUrl(tab.url, homeBase) && !wasHomeTab) return
  if (isHomeUrl(targetUrl, homeBase)) return
  if (homeNavigationLocks.has(tabId)) return
  homeNavigationLocks.add(tabId)
  try {
    let created: chrome.tabs.Tab | null = null
    try {
      created = await chrome.tabs.create({
        windowId: tab.windowId,
        url: targetUrl,
        active: true
      })
    } catch (err) {
      console.warn("[TabPlex] Failed to open bookmark in new tab", err)
    }
    if (!created?.id) return
    try {
      await chrome.tabs.update(tabId, { url: homeTargetUrl, pinned: true })
    } catch (err) {
      console.warn("[TabPlex] Failed to restore home tab", err)
    }
  } finally {
    homeNavigationLocks.delete(tabId)
  }
}

// --- 事件监听注册 ---
export function registerHomeNavigationListener(
  startupReady?: Promise<unknown>
) {
  let startupSucceeded = !startupReady
  void startupReady?.then(
    () => {
      startupSucceeded = true
    },
    () => undefined
  )

  if (chrome?.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (!startupSucceeded) return
      const homeBase = getHomeBaseUrl()
      const wasHome = homeTabIds.has(tabId)
      if (isHomeUrl(tab.url, homeBase)) homeTabIds.add(tabId)
      else homeTabIds.delete(tabId)
      if (!changeInfo.url && !getTabPendingUrl(tab)) return
      void handleHomeNavigation(tabId, changeInfo, tab, wasHome)
    })
  }

  chrome?.tabs?.onRemoved?.addListener((tabId) => {
    // 只清理内存中的导航标记；关闭 Home 不会触发任何窗口或标签创建。
    homeTabIds.delete(tabId)
  })
}
