import type { TabSpec } from "~core/types"

import { isTabClosing } from "./closingTabs"
import { getHomeBaseUrl, isHomeUrl } from "./homeTabService"
import { capturePortableTabGroups } from "./portableTabGroups"
import { projectRecordableWindowTabs } from "./recordableWindowTabs"

type CaptureWindowTabsOptions = {
  windowId: number
  previousTabs?: TabSpec[]
}

/**
 * 读取一个明确的 Chrome 窗口。这里不做窗口猜测，也不读取其他窗口，
 * 从源头保证“在哪个窗口操作，就只管理哪个窗口”。
 */
export const captureWorkspaceWindowTabs = async ({
  windowId,
  previousTabs = []
}: CaptureWindowTabsOptions) => {
  const tabs = (await chrome.tabs.query({ windowId })).filter(
    (tab) => typeof tab.id === "number" && !isTabClosing(tab.id)
  )
  const projection = projectRecordableWindowTabs({
    tabs,
    isHomeUrl: (url) => isHomeUrl(url, getHomeBaseUrl())
  })

  if (projection.busy) throw new Error("workspace-window-tabs-busy")
  if (
    projection.unverifiable ||
    projection.recordableTabIds.length !== projection.tabs.length
  ) {
    throw new Error("workspace-window-tabs-unverifiable")
  }

  const recordableIds = new Set(projection.recordableTabIds)
  const liveTabs = tabs.filter(
    (tab) => typeof tab.id === "number" && recordableIds.has(tab.id)
  )

  return capturePortableTabGroups({
    liveTabs,
    liveSpecs: projection.tabs,
    previousTabs
  })
}

export const assertNormalWindow = async (windowId: number) => {
  if (!Number.isSafeInteger(windowId) || windowId < 0) {
    throw new Error("invalid-window-id")
  }
  let window: chrome.windows.Window
  try {
    window = await chrome.windows.get(windowId, { populate: false })
  } catch {
    throw new Error("workspace-window-missing")
  }
  if (window.type && window.type !== "normal") {
    throw new Error("workspace-window-not-normal")
  }
  return window
}

export const resolveNormalWindowId = async (preferredWindowId?: number) => {
  if (typeof preferredWindowId === "number") {
    await assertNormalWindow(preferredWindowId)
    return preferredWindowId
  }

  const focused = await chrome.windows.getLastFocused({
    populate: false,
    windowTypes: ["normal"]
  })
  if (typeof focused.id !== "number") throw new Error("no_window")
  await assertNormalWindow(focused.id)
  return focused.id
}
