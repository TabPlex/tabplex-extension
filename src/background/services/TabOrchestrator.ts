import type { TabSpec } from "~core/types"
import { isSafeTabUrl, resolveTabUrl } from "~core/utils"
import { logWarn } from "~lib/logger"

import { markTabsClosing, unmarkTabClosing } from "./closingTabs"
import { isHomeUrl } from "./homeTabService"

// 每轮只让有限数量的标签同时进入导航，并错开相邻批次的启动时间，
// 避免大工作区在同一瞬间抢占浏览器调度器。
const BATCH_SIZE = 6
const BATCH_START_INTERVAL_MS = 600
const HOME_PATH = "popup.html"

const getTabUrlForMatch = (tab: chrome.tabs.Tab) => resolveTabUrl(tab)
const getExactTabUrl = (value?: string | null) => value?.trim() ?? ""
const isTabNavigationInFlight = (tab: chrome.tabs.Tab) =>
  tab.status === "loading" || !!getExactTabUrl(tab.pendingUrl)

type WorkspaceSwitchRun = {
  windowId: number
  tabs: TabSpec[]
}

export type WorkspaceSwitchOptions = {
  onTabPrepared?: (
    tab: chrome.tabs.Tab,
    plannedUrl: string,
    kind: "created" | "reused"
  ) => void | Promise<void>
  onBatchPrepared?: (progress: {
    preparedCount: number
    batchSize: number
    remainingCount: number
  }) => void | Promise<void>
  onBeforeCommit?: () => void | Promise<void>
  signal?: AbortSignal
}

type PreparedWindowSwitch = {
  windowId: number
  sourceTabs: chrome.tabs.Tab[]
  toClose: Array<{
    tabId: number
    expectedUrl: string
    forceClose: boolean
  }>
  createdTabArtifacts: OwnedTabArtifact[]
  preparedTargets: Array<{
    tabId: number
    spec: TabSpec
    originalGroupId?: number
  }>
  committed: boolean
}

type OwnedTabArtifact = {
  tabId: number
  windowId: number
  expectedUrls: string[]
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error("workspace-switch-aborted")
}

const waitForBatchStart = (delayMs: number, signal?: AbortSignal) => {
  throwIfAborted(signal)
  if (delayMs <= 0) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timeoutId)
      signal?.removeEventListener("abort", handleAbort)
      reject(new Error("workspace-switch-aborted"))
    }
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort)
      resolve()
    }, delayMs)

    signal?.addEventListener("abort", handleAbort, { once: true })
  })
}

const removeOwnedTabs = async (tabIds: number[]) => {
  if (!tabIds.length) return
  markTabsClosing(tabIds)
  try {
    await chrome.tabs.remove(tabIds)
  } finally {
    for (const id of tabIds) unmarkTabClosing(id)
  }
}

const removeVerifiedOwnedArtifacts = async (artifacts: OwnedTabArtifact[]) => {
  const verifiedIds: number[] = []

  for (const artifact of artifacts) {
    try {
      const current = await chrome.tabs.get(artifact.tabId)
      const currentUrl = getExactTabUrl(getTabUrlForMatch(current))
      const stillOwned =
        current.windowId === artifact.windowId &&
        !!currentUrl &&
        artifact.expectedUrls.some(
          (expectedUrl) => getExactTabUrl(expectedUrl) === currentUrl
        )
      if (stillOwned) verifiedIds.push(artifact.tabId)
    } catch {
      // Missing or unreadable tabs are already gone or no longer safe to own.
    }
  }

  await removeOwnedTabs(verifiedIds)
}

const rollbackPreparedWindow = async (prepared: PreparedWindowSwitch) => {
  await removeVerifiedOwnedArtifacts(prepared.createdTabArtifacts)
}

const getMissingSourceTabs = (
  sourceTabs: chrome.tabs.Tab[],
  currentTabs: chrome.tabs.Tab[]
) => {
  const available = currentTabs
    .filter((tab) => !tab.pinned)
    .map((tab) => getExactTabUrl(getTabUrlForMatch(tab)))
  const missing: chrome.tabs.Tab[] = []

  for (const sourceTab of sourceTabs) {
    const exactUrl = getExactTabUrl(getTabUrlForMatch(sourceTab))
    if (!exactUrl) continue
    const matchIndex = available.indexOf(exactUrl)
    if (matchIndex >= 0) {
      available.splice(matchIndex, 1)
    } else {
      missing.push(sourceTab)
    }
  }

  return missing
}

const restorePreparedSource = async (prepared: PreparedWindowSwitch) => {
  if (!prepared.committed || !prepared.sourceTabs.length) return
  const currentTabs = await chrome.tabs.query({ windowId: prepared.windowId })
  const missing = getMissingSourceTabs(prepared.sourceTabs, currentTabs)
  for (const tab of missing) {
    const url = getTabUrlForMatch(tab)
    if (!url) continue
    await chrome.tabs.create({
      windowId: prepared.windowId,
      url,
      pinned: false,
      active: false
    })
  }
}

const createTargetTabs = async (
  windowId: number,
  toOpen: TabSpec[],
  prepared: PreparedWindowSwitch,
  options: WorkspaceSwitchOptions
) => {
  const remaining = [...toOpen]

  const throwPreparationFailure = (message: string, error: unknown): never => {
    if (options.signal?.aborted) {
      throw error
    }
    void logWarn("tab-orchestrator", message, error)
    throw new Error("workspace-tab-preparation-failed")
  }

  const createTargetTab = async (spec: TabSpec) => {
    throwIfAborted(options.signal)
    const tab = await chrome.tabs.create({
      windowId,
      url: spec.url,
      pinned: spec.pinned,
      active: false
    })
    if (typeof tab.id !== "number") {
      throw new Error("workspace-target-tab-id-missing")
    }
    prepared.createdTabArtifacts.push({
      tabId: tab.id,
      windowId,
      expectedUrls: [spec.url]
    })
    prepared.preparedTargets.push({
      tabId: tab.id,
      spec,
      originalGroupId: tab.groupId
    })
    await options.onTabPrepared?.(tab, spec.url, "created")
  }

  while (remaining.length) {
    throwIfAborted(options.signal)
    const batchStartedAt = Date.now()
    const batch = remaining.splice(0, BATCH_SIZE)
    const results = await Promise.allSettled(batch.map(createTargetTab))
    const failure = results.find((result) => result.status === "rejected")
    if (failure?.status === "rejected") {
      throwPreparationFailure("创建目标标签批次失败", failure.reason)
    }
    await options.onBatchPrepared?.({
      preparedCount: prepared.preparedTargets.length,
      batchSize: batch.length,
      remainingCount: remaining.length
    })
    if (remaining.length) {
      const elapsedMs = Date.now() - batchStartedAt
      await waitForBatchStart(
        Math.max(0, BATCH_START_INTERVAL_MS - elapsedMs),
        options.signal
      )
    }
  }
}

const prepareWindowSwitch = async (
  run: WorkspaceSwitchRun,
  options: WorkspaceSwitchOptions
): Promise<PreparedWindowSwitch> => {
  throwIfAborted(options.signal)

  const targetTabs = run.tabs.filter((tab) => !tab.pinned)
  const currentTabs = await chrome.tabs.query({ windowId: run.windowId })
  throwIfAborted(options.signal)
  const homeBaseUrl = chrome.runtime.getURL(HOME_PATH)
  const candidates: chrome.tabs.Tab[] = []
  let homeTabFound = false

  for (const tab of currentTabs) {
    const url = getTabUrlForMatch(tab)
    const isHome = isHomeUrl(url, homeBaseUrl)
    if (isHome) homeTabFound = true
    if (isHome || tab.pinned || !isSafeTabUrl(url)) continue
    candidates.push(tab)
  }

  const sourceTabs = [...candidates]
  const toOpen: TabSpec[] = []
  const reused: Array<{ tab: chrome.tabs.Tab; spec: TabSpec }> = []
  for (const spec of targetTabs) {
    const exactSpecUrl = getExactTabUrl(spec.url)
    const matchIndex = candidates.findIndex((candidate) => {
      if (typeof candidate.id !== "number") return false
      if (isTabNavigationInFlight(candidate)) return false
      return getExactTabUrl(getTabUrlForMatch(candidate)) === exactSpecUrl
    })
    if (!exactSpecUrl || matchIndex < 0) {
      toOpen.push(spec)
      continue
    }
    const [tab] = candidates.splice(matchIndex, 1)
    reused.push({ tab, spec })
  }

  const prepared: PreparedWindowSwitch = {
    windowId: run.windowId,
    sourceTabs,
    toClose: candidates.flatMap((tab) =>
      typeof tab.id === "number"
        ? [
            {
              tabId: tab.id,
              expectedUrl: getTabUrlForMatch(tab),
              forceClose: isTabNavigationInFlight(tab)
            }
          ]
        : []
    ),
    createdTabArtifacts: [],
    preparedTargets: reused.flatMap(({ tab, spec }) =>
      typeof tab.id === "number"
        ? [{ tabId: tab.id, spec, originalGroupId: tab.groupId }]
        : []
    ),
    committed: false
  }

  try {
    for (const { tab, spec } of reused) {
      await options.onTabPrepared?.(tab, spec.url, "reused")
    }

    await createTargetTabs(run.windowId, toOpen, prepared, options)
    throwIfAborted(options.signal)

    if (!homeTabFound) {
      const homeUrl = new URL(homeBaseUrl)
      homeUrl.searchParams.set("mode", "home")
      homeUrl.searchParams.set("v", chrome.runtime.getManifest().version)
      const expectedHomeUrl = homeUrl.toString()
      const home = await chrome.tabs.create({
        windowId: run.windowId,
        url: expectedHomeUrl,
        pinned: true,
        active: false,
        index: 0
      })
      if (typeof home.id !== "number") {
        throw new Error("workspace-home-tab-preparation-failed")
      }
      prepared.createdTabArtifacts.push({
        tabId: home.id,
        windowId: run.windowId,
        expectedUrls: [expectedHomeUrl]
      })
    }

    throwIfAborted(options.signal)
    return prepared
  } catch (error) {
    await rollbackPreparedWindow(prepared)
    throw error
  }
}

const commitPreparedWindow = async (
  prepared: PreparedWindowSwitch,
  options: WorkspaceSwitchOptions
) => {
  throwIfAborted(options.signal)
  prepared.committed = true

  let validatedToClose: number[] = []
  if (prepared.toClose.length) {
    try {
      const currentTabs = await chrome.tabs.query({
        windowId: prepared.windowId
      })
      validatedToClose = prepared.toClose.flatMap(
        ({ tabId, expectedUrl, forceClose }) => {
          const current = currentTabs.find((tab) => tab.id === tabId)
          if (!current) return []
          if (forceClose) return [tabId]

          const expected = expectedUrl.trim()
          return expected && getTabUrlForMatch(current).trim() === expected
            ? [tabId]
            : []
        }
      )
    } catch (error) {
      // A tab/window we cannot re-validate is no longer safe to close.
      void logWarn(
        "tab-orchestrator",
        "提交前复核源标签失败，保留全部未知标签",
        error
      )
    }
  }

  if (validatedToClose.length) {
    await removeOwnedTabs(validatedToClose)
  }

  throwIfAborted(options.signal)
}

const restorePreparedTabGroups = async (prepared: PreparedWindowSwitch) => {
  const toUngroup = prepared.preparedTargets.flatMap(
    ({ tabId, spec, originalGroupId }) =>
      !spec.group?.key &&
      typeof originalGroupId === "number" &&
      originalGroupId >= 0
        ? [tabId]
        : []
  )
  const grouped = new Map<
    string,
    {
      tabIds: [number, ...number[]]
      group: NonNullable<TabSpec["group"]>
    }
  >()

  for (const { tabId, spec } of prepared.preparedTargets) {
    const group = spec.group
    if (!group?.key) continue
    const current = grouped.get(group.key)
    if (current) {
      current.tabIds.push(tabId)
    } else {
      grouped.set(group.key, { tabIds: [tabId], group })
    }
  }

  if (!toUngroup.length && !grouped.size) return
  if (
    !chrome.tabGroups ||
    typeof chrome.tabs.group !== "function" ||
    typeof chrome.tabs.ungroup !== "function"
  ) {
    throw new Error("workspace-tab-group-api-unavailable")
  }

  if (toUngroup.length) {
    try {
      const tabIds: [number, ...number[]] = [
        toUngroup[0],
        ...toUngroup.slice(1)
      ]
      await chrome.tabs.ungroup(tabIds)
    } catch {
      throw new Error("workspace-tab-group-restore-failed")
    }
  }

  for (const { tabIds, group } of grouped.values()) {
    try {
      const groupId = await chrome.tabs.group({
        tabIds,
        createProperties: { windowId: prepared.windowId }
      })
      await chrome.tabGroups.update(groupId, {
        title: group.title,
        color: group.color,
        collapsed: group.collapsed
      })
    } catch {
      throw new Error("workspace-tab-group-restore-failed")
    }
  }
}

const compensateFailedSwitch = async (prepared: PreparedWindowSwitch) => {
  let firstFailure: unknown

  try {
    await rollbackPreparedWindow(prepared)
  } catch (error) {
    firstFailure = error
  }

  try {
    await restorePreparedSource(prepared)
  } catch (error) {
    firstFailure ??= error
  }

  if (firstFailure) throw firstFailure
}

/**
 * TabOrchestrator 负责切换工作区时的标签页迁移。
 * 先复用 URL 相同的标签，再按批次创建缺失标签以降低开销。
 * 始终保留或补齐当前窗口的 Home，并保留固定/内部标签页。
 */
export class TabOrchestrator {
  private queue: Promise<void> = Promise.resolve()

  async switchWorkspace(
    windowId: number,
    tabs: TabSpec[],
    options: WorkspaceSwitchOptions
  ): Promise<void> {
    const task = async () => {
      let prepared: PreparedWindowSwitch | null = null
      try {
        prepared = await prepareWindowSwitch({ windowId, tabs }, options)
        throwIfAborted(options.signal)
        await options.onBeforeCommit?.()
        throwIfAborted(options.signal)
        await commitPreparedWindow(prepared, options)
        throwIfAborted(options.signal)
        await restorePreparedTabGroups(prepared)
      } catch (error) {
        if (prepared) {
          try {
            await compensateFailedSwitch(prepared)
          } catch (compensationError) {
            void logWarn(
              "tab-orchestrator",
              "切换失败后的源标签补偿不完整",
              compensationError
            )
          }
        }
        void logWarn("tab-orchestrator", "switchWorkspace 失败", error)
        throw error
      }
    }

    const chained = this.queue.then(task, task)
    this.queue = chained.then(
      () => undefined,
      () => undefined
    )
    return chained
  }
}

export const tabOrchestrator = new TabOrchestrator()
