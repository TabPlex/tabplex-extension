import {
  isWorkspaceTabLoadConcurrency,
  type TabSpec,
  type WorkspaceTabLoadConcurrency
} from "~core/types"
import { isSafeTabUrl, resolveTabUrl } from "~core/utils"
import { logWarn } from "~lib/logger"

import { markTabsClosing, unmarkTabClosing } from "./closingTabs"
import { isHomeUrl } from "./homeTabService"
import { isWorkspaceTabLoadPlaceholderUrl } from "./workspaceTabLoadPlaceholder"

// 准备和后台加载共用同一个并发语义：一个标签完成准备后立即补下一个，
// 不再等待固定批次中的其他标签。
const DEFAULT_MAX_CONCURRENT_TAB_LOADS: WorkspaceTabLoadConcurrency = "all"
const DISCARD_RETRY_ATTEMPTS = 4
const DISCARD_RETRY_DELAY_MS = 75
const TARGET_URL_READY_TIMEOUT_MS = 10_000
const TARGET_URL_READY_POLL_MS = 50
const HOME_PATH = "popup.html"

const getTabUrlForMatch = (tab: chrome.tabs.Tab) => resolveTabUrl(tab)
const getExactTabUrl = (value?: string | null) => value?.trim() ?? ""
const isTabNavigationInFlight = (tab: chrome.tabs.Tab) =>
  tab.status === "loading" || !!getExactTabUrl(tab.pendingUrl)
const isCorruptBlankTab = (tab: chrome.tabs.Tab) =>
  !tab.pinned && !getExactTabUrl(tab.url) && !getExactTabUrl(tab.pendingUrl)

type WorkspaceSwitchRun = {
  windowId: number
  tabs: TabSpec[]
}

type PlannedTarget = {
  spec: TabSpec
  order: number
}

export type WorkspaceSwitchOptions = {
  createdTabPlaceholderUrl?: string
  discardCreatedTabs?: boolean
  maxConcurrentTabLoads?: WorkspaceTabLoadConcurrency
  onTabPrepared?: (
    tab: chrome.tabs.Tab,
    plannedUrl: string,
    kind: "created" | "reused"
  ) => void | Promise<void>
  onPreparationProgress?: (progress: {
    preparedCount: number
    justPreparedCount: number
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
    order: number
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

const waitForDelay = (delayMs: number, signal?: AbortSignal) => {
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

const resolveConcurrentWorkerCount = (
  configured: WorkspaceTabLoadConcurrency | undefined,
  taskCount: number
) => {
  if (taskCount <= 0) return 0
  const maxConcurrent = isWorkspaceTabLoadConcurrency(configured)
    ? configured
    : DEFAULT_MAX_CONCURRENT_TAB_LOADS
  return maxConcurrent === "all"
    ? taskCount
    : Math.min(maxConcurrent, taskCount)
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
      const isBlankDiscardedArtifact =
        !current.active && current.discarded && !currentUrl
      const stillOwned =
        current.windowId === artifact.windowId &&
        (isBlankDiscardedArtifact ||
          (!!currentUrl &&
            artifact.expectedUrls.some(
              (expectedUrl) => getExactTabUrl(expectedUrl) === currentUrl
            )))
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

const discardPreparedTab = async (
  tab: chrome.tabs.Tab,
  enabled: boolean | undefined,
  signal?: AbortSignal
) => {
  if (
    !enabled ||
    tab.active ||
    typeof tab.id !== "number" ||
    typeof chrome.tabs.discard !== "function"
  ) {
    return tab
  }

  let latestTab = tab
  let lastError: unknown
  for (let attempt = 0; attempt < DISCARD_RETRY_ATTEMPTS; attempt += 1) {
    throwIfAborted(signal)
    if (latestTab.active) return latestTab

    try {
      await chrome.tabs.discard(tab.id)
      // tabs.discard() 返回的 Tab 在真实 Chrome 中可能早于窗口查询状态
      // 更新。并发槽位只能以重新读取后的状态为准，否则几十个仍在
      // loading 的页面会被误判为已休眠并继续放行。
      latestTab = await chrome.tabs.get(tab.id)
      if (latestTab.discarded) return latestTab
    } catch (error) {
      lastError = error
      try {
        latestTab = await chrome.tabs.get(tab.id)
        if (latestTab.discarded || latestTab.active) return latestTab
      } catch {
        break
      }
    }

    if (attempt < DISCARD_RETRY_ATTEMPTS - 1) {
      await waitForDelay(DISCARD_RETRY_DELAY_MS, signal)
    }
  }

  // 休眠是性能优化，不应把一个已经安全创建的目标标签升级为切换失败。
  void logWarn(
    "tab-orchestrator",
    "目标标签未进入休眠状态，已限制重试并继续切换",
    lastError ?? { tabId: tab.id }
  )
  return latestTab
}

const waitForPreparedSlotRelease = async (
  tab: chrome.tabs.Tab,
  signal?: AbortSignal
) => {
  if (typeof tab.id !== "number") return tab
  let latestTab = tab
  while (
    !latestTab.active &&
    !latestTab.discarded &&
    latestTab.status === "loading"
  ) {
    throwIfAborted(signal)
    await waitForDelay(TARGET_URL_READY_POLL_MS, signal)
    try {
      latestTab = await chrome.tabs.get(tab.id)
    } catch {
      return latestTab
    }
  }
  return latestTab
}

const waitForReadyTargetUrl = async (
  tab: chrome.tabs.Tab,
  signal?: AbortSignal
) => {
  if (typeof tab.id !== "number") {
    throw new Error("workspace-target-tab-id-missing")
  }

  const deadline = Date.now() + TARGET_URL_READY_TIMEOUT_MS
  let latestTab = tab

  while (!isSafeTabUrl(getExactTabUrl(getTabUrlForMatch(latestTab)))) {
    throwIfAborted(signal)
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      throw new Error("workspace-target-navigation-not-ready")
    }
    await waitForDelay(Math.min(TARGET_URL_READY_POLL_MS, remainingMs), signal)
    latestTab = await chrome.tabs.get(tab.id)
  }

  return latestTab
}

const waitForCommittedCreatedUrl = async (
  tab: chrome.tabs.Tab,
  expectedUrl: string,
  signal?: AbortSignal
) => {
  if (typeof tab.id !== "number") {
    throw new Error("workspace-target-tab-id-missing")
  }

  const deadline = Date.now() + TARGET_URL_READY_TIMEOUT_MS
  let latestTab = tab
  while (
    getExactTabUrl(latestTab.url) !== expectedUrl ||
    !!getExactTabUrl(latestTab.pendingUrl)
  ) {
    throwIfAborted(signal)
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      throw new Error("workspace-created-tab-not-committed")
    }
    await waitForDelay(Math.min(TARGET_URL_READY_POLL_MS, remainingMs), signal)
    latestTab = await chrome.tabs.get(tab.id)
  }
  // 批量创建 about:blank 占位页时，Chrome 可能已经提交 url、清空
  // pendingUrl，却仍暂时把 status 保持为 loading。此时 tabs.update 已可安全
  // 接管导航；继续等待 complete 会让后创建的标签被节流到超时。
  return latestTab
}

const hasCommittedTargetUrl = (tab: chrome.tabs.Tab) =>
  !getExactTabUrl(tab.pendingUrl) && isSafeTabUrl(getExactTabUrl(tab.url))

const waitForCommittedTargetUrl = async (
  tab: chrome.tabs.Tab,
  signal?: AbortSignal
) => {
  if (typeof tab.id !== "number") return tab
  const deadline = Date.now() + TARGET_URL_READY_TIMEOUT_MS
  let latestTab = tab

  while (!hasCommittedTargetUrl(latestTab)) {
    throwIfAborted(signal)
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) return latestTab
    await waitForDelay(Math.min(TARGET_URL_READY_POLL_MS, remainingMs), signal)
    try {
      latestTab = await chrome.tabs.get(tab.id)
    } catch {
      return latestTab
    }
  }

  return latestTab
}

const restoreLostPreparedTargetUrl = async (
  tab: chrome.tabs.Tab,
  plannedUrl: string,
  signal?: AbortSignal
) => {
  if (typeof tab.id !== "number") {
    throw new Error("workspace-target-tab-id-missing")
  }
  throwIfAborted(signal)
  const restored = await chrome.tabs.update(tab.id, { url: plannedUrl })
  if (!restored) throw new Error("workspace-target-url-restore-failed")
  return waitForReadyTargetUrl(restored, signal)
}

const ensureHomeTabPrepared = async (
  windowId: number,
  homeBaseUrl: string,
  existingHome: chrome.tabs.Tab | undefined,
  prepared: PreparedWindowSwitch
) => {
  if (existingHome) {
    if (existingHome.pinned) return
    if (typeof existingHome.id !== "number") {
      throw new Error("workspace-home-tab-id-missing")
    }
    const pinnedHome = await chrome.tabs.update(existingHome.id, {
      pinned: true
    })
    if (!pinnedHome?.pinned) {
      throw new Error("workspace-home-tab-pin-failed")
    }
    return
  }

  const homeUrl = new URL(homeBaseUrl)
  homeUrl.searchParams.set("mode", "home")
  homeUrl.searchParams.set("v", chrome.runtime.getManifest().version)
  const expectedHomeUrl = homeUrl.toString()
  const home = await chrome.tabs.create({
    windowId,
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
    windowId,
    expectedUrls: [expectedHomeUrl]
  })
}

const createTargetTabs = async (
  windowId: number,
  toOpen: PlannedTarget[],
  prepared: PreparedWindowSwitch,
  options: WorkspaceSwitchOptions
) => {
  const throwPreparationFailure = (message: string, error: unknown): never => {
    if (options.signal?.aborted) {
      throw error
    }
    void logWarn("tab-orchestrator", message, error)
    throw new Error("workspace-tab-preparation-failed")
  }

  const createTargetTab = async ({ spec, order }: PlannedTarget) => {
    throwIfAborted(options.signal)
    const createUrl = options.createdTabPlaceholderUrl?.trim() || spec.url
    const tab = await chrome.tabs.create({
      windowId,
      url: createUrl,
      pinned: spec.pinned,
      active: false
    })
    if (typeof tab.id !== "number") {
      throw new Error("workspace-target-tab-id-missing")
    }
    const artifact: OwnedTabArtifact = {
      tabId: tab.id,
      windowId,
      expectedUrls: Array.from(new Set([spec.url, createUrl]))
    }
    prepared.createdTabArtifacts.push(artifact)
    const committedCreatedTab = options.createdTabPlaceholderUrl
      ? await waitForCommittedCreatedUrl(tab, createUrl, options.signal)
      : tab
    prepared.preparedTargets.push({
      tabId: tab.id,
      spec,
      order,
      originalGroupId: committedCreatedTab.groupId
    })
    const readyTab = options.discardCreatedTabs
      ? await waitForReadyTargetUrl(committedCreatedTab, options.signal)
      : committedCreatedTab
    const discardCandidate = options.discardCreatedTabs
      ? await waitForCommittedTargetUrl(readyTab, options.signal)
      : readyTab
    const readyUrl = getExactTabUrl(getTabUrlForMatch(discardCandidate))
    if (readyUrl && !artifact.expectedUrls.includes(readyUrl)) {
      artifact.expectedUrls.push(readyUrl)
    }
    let preparedTab = await discardPreparedTab(
      discardCandidate,
      options.discardCreatedTabs && hasCommittedTargetUrl(discardCandidate),
      options.signal
    )
    if (options.discardCreatedTabs) {
      preparedTab = await waitForPreparedSlotRelease(
        preparedTab,
        options.signal
      )
    }
    if (
      options.discardCreatedTabs &&
      preparedTab.discarded &&
      !isSafeTabUrl(getExactTabUrl(getTabUrlForMatch(preparedTab)))
    ) {
      // Chrome 极少会在导航刚建立时休眠出一个空壳。休眠只是
      // 性能优化，此时重建目标导航并交给后续加载队列，不应让整次切换失败。
      preparedTab = await restoreLostPreparedTargetUrl(
        preparedTab,
        spec.url,
        options.signal
      )
      // 恢复 URL 会重新发起导航。即使休眠空壳已被修好，也必须继续
      // 占用当前槽位，直到页面完成或再次被 Chrome 休眠。
      preparedTab = await waitForPreparedSlotRelease(
        preparedTab,
        options.signal
      )
    }
    await options.onTabPrepared?.(preparedTab, spec.url, "created")
  }

  const workerCount = resolveConcurrentWorkerCount(
    options.maxConcurrentTabLoads,
    toOpen.length
  )
  if (!workerCount) return

  let nextTargetIndex = 0
  let completedCreatedCount = 0
  let preparedCount = prepared.preparedTargets.length
  let hasFailed = false
  let firstFailure: unknown
  let progressQueue = Promise.resolve()

  const recordFailure = (error: unknown) => {
    if (hasFailed) return
    hasFailed = true
    firstFailure = error
  }

  const reportProgress = (progress: {
    preparedCount: number
    justPreparedCount: number
    remainingCount: number
  }) => {
    const report = progressQueue.then(() =>
      options.onPreparationProgress?.(progress)
    )
    progressQueue = report.then(() => undefined)
    return report
  }

  const runWorker = async () => {
    try {
      while (!hasFailed) {
        throwIfAborted(options.signal)
        const targetIndex = nextTargetIndex
        if (targetIndex >= toOpen.length) return
        nextTargetIndex += 1

        await createTargetTab(toOpen[targetIndex])
        completedCreatedCount += 1
        preparedCount += 1
        await reportProgress({
          preparedCount,
          justPreparedCount: 1,
          remainingCount: toOpen.length - completedCreatedCount
        })
      }
    } catch (error) {
      recordFailure(error)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
  if (hasFailed) {
    throwPreparationFailure("滚动准备目标标签失败", firstFailure)
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
  let existingHome: chrome.tabs.Tab | undefined

  for (const tab of currentTabs) {
    const url = getTabUrlForMatch(tab)
    const isHome = isHomeUrl(url, homeBaseUrl)
    const isLoadPlaceholder = isWorkspaceTabLoadPlaceholderUrl(url)
    const isCorruptBlank = isCorruptBlankTab(tab)
    if (isHome && !existingHome) existingHome = tab
    if (
      isHome ||
      tab.pinned ||
      (!isSafeTabUrl(url) && !isCorruptBlank && !isLoadPlaceholder)
    ) {
      continue
    }
    candidates.push(tab)
  }

  // Placeholder tabs belong to an interrupted TabPlex switch, not to the
  // user's source workspace. They may be closed below but must never be
  // restored as source content during compensation.
  const sourceTabs = candidates.filter(
    (tab) => !isWorkspaceTabLoadPlaceholderUrl(getTabUrlForMatch(tab))
  )
  const toOpen: PlannedTarget[] = []
  const reused: Array<{
    tab: chrome.tabs.Tab
    spec: TabSpec
    order: number
  }> = []
  for (const [order, spec] of targetTabs.entries()) {
    const exactSpecUrl = getExactTabUrl(spec.url)
    const matchIndex = candidates.findIndex((candidate) => {
      if (typeof candidate.id !== "number") return false
      if (isTabNavigationInFlight(candidate)) return false
      return getExactTabUrl(getTabUrlForMatch(candidate)) === exactSpecUrl
    })
    if (!exactSpecUrl || matchIndex < 0) {
      toOpen.push({ spec, order })
      continue
    }
    const [tab] = candidates.splice(matchIndex, 1)
    reused.push({ tab, spec, order })
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
              forceClose: isTabNavigationInFlight(tab) || isCorruptBlankTab(tab)
            }
          ]
        : []
    ),
    createdTabArtifacts: [],
    preparedTargets: reused.flatMap(({ tab, spec, order }) =>
      typeof tab.id === "number"
        ? [{ tabId: tab.id, spec, order, originalGroupId: tab.groupId }]
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

    await ensureHomeTabPrepared(
      run.windowId,
      homeBaseUrl,
      existingHome,
      prepared
    )

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
  const orderedTargets = [...prepared.preparedTargets].sort(
    (left, right) => left.order - right.order
  )
  const toUngroup = orderedTargets.flatMap(
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

  for (const { tabId, spec } of orderedTargets) {
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
 * 先复用 URL 相同的标签，再按可配置的滚动并发准备缺失标签。
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
