import { getWorkspaceWindowBinding } from "~core/storage"
import { isSafeTabUrl, resolveTabUrl, uuid } from "~core/utils"
import { logWarn } from "~lib/logger"

import {
  isWorkspaceTabLoadPlaceholderUrl,
  WORKSPACE_TAB_LOAD_PLACEHOLDER_URL
} from "./workspaceTabLoadPlaceholder"

const WARMUP_STORAGE_KEY = "workspaceTabWarmupJobs"
const WARMUP_ALARM_PREFIX = "tabplex-workspace-warmup:"
const LOAD_TIMEOUT_MS = 10_000
const RETRY_DELAY_MS = 1_000
const NAVIGATION_CONFIRM_TIMEOUT_MS = 1_000
const NAVIGATION_CONFIRM_POLL_MS = 50

type WarmupInflightTab = {
  tabId: number
  startedAt: number
}

type WorkspaceTabWarmupTarget = {
  tabId: number
  url: string
}

type WorkspaceTabWarmupJob = {
  runId: string
  windowId: number
  workspaceId: string
  targetUrls: Record<string, string>
  pendingTabIds: number[]
  inflightTabs: WarmupInflightTab[]
  retryAt?: number
  updatedAt: number
}

type WorkspaceTabWarmupJobMap = Record<string, WorkspaceTabWarmupJob>

let warmupQueue: Promise<void> = Promise.resolve()

const enqueueWarmup = <T>(task: () => Promise<T>) => {
  const run = warmupQueue.then(task, task)
  warmupQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

const isTabId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0

const exactUrl = (value?: string | null) => value?.trim() ?? ""

const normalizeTabIds = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(new Set(value.filter(isTabId)))
    : ([] as number[])

const normalizeTargetUrls = (value: unknown) => {
  if (!value || typeof value !== "object") return {}
  const targetUrls: Record<string, string> = {}
  for (const [rawTabId, rawUrl] of Object.entries(
    value as Record<string, unknown>
  )) {
    const tabId = Number(rawTabId)
    const url = typeof rawUrl === "string" ? rawUrl.trim() : ""
    if (!isTabId(tabId) || !isSafeTabUrl(url)) continue
    targetUrls[String(tabId)] = url
  }
  return targetUrls
}

const normalizeTargets = (value: unknown): WorkspaceTabWarmupTarget[] => {
  if (!Array.isArray(value)) return []
  const seen = new Set<number>()
  const targets: WorkspaceTabWarmupTarget[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const candidate = item as Partial<WorkspaceTabWarmupTarget>
    const url = typeof candidate.url === "string" ? candidate.url.trim() : ""
    if (!isTabId(candidate.tabId) || !isSafeTabUrl(url)) continue
    if (seen.has(candidate.tabId)) continue
    seen.add(candidate.tabId)
    targets.push({ tabId: candidate.tabId, url })
  }
  return targets
}

const normalizeInflightTabs = (value: unknown): WarmupInflightTab[] => {
  if (!Array.isArray(value)) return []
  const seen = new Set<number>()
  const result: WarmupInflightTab[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const candidate = item as Partial<WarmupInflightTab>
    if (
      !isTabId(candidate.tabId) ||
      typeof candidate.startedAt !== "number" ||
      !Number.isFinite(candidate.startedAt) ||
      candidate.startedAt < 0 ||
      seen.has(candidate.tabId)
    ) {
      continue
    }
    seen.add(candidate.tabId)
    result.push({ tabId: candidate.tabId, startedAt: candidate.startedAt })
  }
  return result
}

const normalizeRetryAt = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined

const normalizeJob = (value: unknown): WorkspaceTabWarmupJob | null => {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<WorkspaceTabWarmupJob>
  if (
    typeof candidate.runId !== "string" ||
    !candidate.runId ||
    !isTabId(candidate.windowId) ||
    typeof candidate.workspaceId !== "string" ||
    !candidate.workspaceId ||
    typeof candidate.updatedAt !== "number" ||
    !Number.isFinite(candidate.updatedAt)
  ) {
    return null
  }
  const inflightTabs = normalizeInflightTabs(candidate.inflightTabs)
  const inflightIds = new Set(inflightTabs.map(({ tabId }) => tabId))
  return {
    runId: candidate.runId,
    windowId: candidate.windowId,
    workspaceId: candidate.workspaceId,
    targetUrls: normalizeTargetUrls(candidate.targetUrls),
    pendingTabIds: normalizeTabIds(candidate.pendingTabIds).filter(
      (tabId) => !inflightIds.has(tabId)
    ),
    inflightTabs,
    retryAt: normalizeRetryAt(candidate.retryAt),
    updatedAt: candidate.updatedAt
  }
}

const readWarmupJobs = async (): Promise<WorkspaceTabWarmupJobMap> => {
  const result = await chrome.storage.session.get(WARMUP_STORAGE_KEY)
  const raw = result[WARMUP_STORAGE_KEY]
  if (!raw || typeof raw !== "object") return {}
  const jobs: WorkspaceTabWarmupJobMap = {}
  for (const value of Object.values(raw as Record<string, unknown>)) {
    const job = normalizeJob(value)
    if (job) jobs[String(job.windowId)] = job
  }
  return jobs
}

const writeWarmupJobs = (jobs: WorkspaceTabWarmupJobMap) =>
  chrome.storage.session.set({ [WARMUP_STORAGE_KEY]: jobs })

const warmupAlarmName = (windowId: number) =>
  `${WARMUP_ALARM_PREFIX}${windowId}`

const clearWarmupAlarm = async (windowId: number) => {
  try {
    await chrome.alarms.clear(warmupAlarmName(windowId))
  } catch {}
}

const scheduleWarmupAlarm = async (job: WorkspaceTabWarmupJob) => {
  const wakeTimes = job.inflightTabs.map(
    ({ startedAt }) => startedAt + LOAD_TIMEOUT_MS
  )
  if (job.retryAt !== undefined) wakeTimes.push(job.retryAt)
  if (!wakeTimes.length) {
    await clearWarmupAlarm(job.windowId)
    return
  }
  await chrome.alarms.create(warmupAlarmName(job.windowId), {
    when: Math.max(Date.now() + 1, Math.min(...wakeTimes))
  })
}

const removeWarmupJob = async (
  jobs: WorkspaceTabWarmupJobMap,
  windowId: number
) => {
  delete jobs[String(windowId)]
  await writeWarmupJobs(jobs)
  await clearWarmupAlarm(windowId)
}

const loadWindowTabs = async (windowId: number) => {
  const tabs = await chrome.tabs.query({ windowId })
  return new Map(
    tabs.flatMap((tab) =>
      typeof tab.id === "number" ? ([[tab.id, tab]] as const) : []
    )
  )
}

const tabHasPlaceholderUrl = (tab: chrome.tabs.Tab) =>
  isWorkspaceTabLoadPlaceholderUrl(tab.pendingUrl) ||
  isWorkspaceTabLoadPlaceholderUrl(tab.url)

const tabHasExpectedUrl = (tab: chrome.tabs.Tab, expectedUrl: string) =>
  exactUrl(tab.pendingUrl) === expectedUrl || exactUrl(tab.url) === expectedUrl

const getTargetUrl = (
  job: WorkspaceTabWarmupJob,
  tabId: number,
  tab: chrome.tabs.Tab
) => {
  const persisted = job.targetUrls[String(tabId)]
  if (persisted) return persisted
  const legacyUrl = exactUrl(resolveTabUrl(tab))
  return isSafeTabUrl(legacyUrl) ? legacyUrl : ""
}

const prependPendingTab = (job: WorkspaceTabWarmupJob, tabId: number) => {
  if (!job.pendingTabIds.includes(tabId)) job.pendingTabIds.unshift(tabId)
}

const reconcileInflightTabs = (
  job: WorkspaceTabWarmupJob,
  tabsById: Map<number, chrome.tabs.Tab>,
  now: number
) => {
  const next: WarmupInflightTab[] = []
  for (const inflight of job.inflightTabs) {
    const tab = tabsById.get(inflight.tabId)
    if (!tab || tab.windowId !== job.windowId) continue

    // If MV3 suspended after persisting ownership but before navigation, the
    // placeholder is still pending and must return to the front of the queue.
    if (tabHasPlaceholderUrl(tab) || tab.discarded) {
      prependPendingTab(job, inflight.tabId)
      continue
    }

    // User activation has priority. The page keeps loading, but it no longer
    // consumes one of the configured background slots.
    if (tab.active || tab.status === "complete") continue

    if (now - inflight.startedAt < LOAD_TIMEOUT_MS) {
      next.push(inflight)
      continue
    }

    // A slow page must not be discarded: timeout only releases TabPlex's
    // accounting slot so the tail of the queue can start as well.
  }
  job.inflightTabs = next
}

const reconcilePendingTabs = (
  job: WorkspaceTabWarmupJob,
  tabsById: Map<number, chrome.tabs.Tab>,
  now: number
) => {
  const inflightIds = new Set(job.inflightTabs.map(({ tabId }) => tabId))
  const pending: number[] = []
  for (const tabId of job.pendingTabIds) {
    if (inflightIds.has(tabId)) continue
    const tab = tabsById.get(tabId)
    if (!tab || tab.windowId !== job.windowId) continue

    const targetUrl = getTargetUrl(job, tabId, tab)
    if (!targetUrl) continue
    if (tabHasPlaceholderUrl(tab) || tab.discarded) {
      pending.push(tabId)
      continue
    }
    if (tab.status === "loading" && tabHasExpectedUrl(tab, targetUrl)) {
      job.inflightTabs.push({ tabId, startedAt: now })
      inflightIds.add(tabId)
    }
    // Complete targets and tabs taken over by the user are already outside
    // the pending queue. Neither should be navigated again.
  }
  job.pendingTabIds = pending
}

const persistWarmupJob = async (
  jobs: WorkspaceTabWarmupJobMap,
  job: WorkspaceTabWarmupJob
) => {
  job.updatedAt = Date.now()
  jobs[String(job.windowId)] = job
  await writeWarmupJobs(jobs)
  await scheduleWarmupAlarm(job)
}

const waitForTabState = async (
  tabId: number,
  accepts: (tab: chrome.tabs.Tab) => boolean,
  failureCode: string
) => {
  const deadline = Date.now() + NAVIGATION_CONFIRM_TIMEOUT_MS
  while (Date.now() < deadline) {
    const current = await chrome.tabs.get(tabId)
    if (accepts(current)) return current
    await new Promise<void>((resolve) =>
      setTimeout(resolve, NAVIGATION_CONFIRM_POLL_MS)
    )
  }
  throw new Error(failureCode)
}

const navigateToPlaceholder = async (tabId: number) => {
  await chrome.tabs.update(tabId, { url: WORKSPACE_TAB_LOAD_PLACEHOLDER_URL })
  await waitForTabState(
    tabId,
    (tab) => !tab.discarded && tabHasPlaceholderUrl(tab),
    "workspace-tab-placeholder-not-confirmed"
  )
}

const navigateToTarget = async (tabId: number, targetUrl: string) => {
  await chrome.tabs.update(tabId, { url: targetUrl })
  await waitForTabState(
    tabId,
    (tab) =>
      !tab.discarded &&
      !tabHasPlaceholderUrl(tab) &&
      (tabHasExpectedUrl(tab, targetUrl) || tab.status === "complete"),
    "workspace-tab-load-not-confirmed"
  )
}

const startTabLoad = async (job: WorkspaceTabWarmupJob, tabId: number) => {
  const tab = await chrome.tabs.get(tabId)
  const targetUrl = getTargetUrl(job, tabId, tab)
  if (!targetUrl) throw new Error("workspace-tab-target-url-missing")

  if (!tabHasPlaceholderUrl(tab) && tab.discarded) {
    // A persisted job from an older build can point at a discarded target URL.
    // Navigate through a distinct lightweight page so Chrome cannot treat the
    // same-URL update as a no-op.
    await navigateToPlaceholder(tabId)
  }

  if (!tabHasPlaceholderUrl(tab) && !tab.discarded) {
    if (tab.status === "loading" || tab.status === "complete") return
  }

  await navigateToTarget(tabId, targetUrl)
}

const startPendingTabs = async (
  jobs: WorkspaceTabWarmupJobMap,
  job: WorkspaceTabWarmupJob
) => {
  const available = job.pendingTabIds.length
  if (available <= 0) return

  const starting = job.pendingTabIds.splice(0, available)
  const startedAt = Date.now()
  job.inflightTabs.push(...starting.map((tabId) => ({ tabId, startedAt })))

  // Persist ownership before navigating so an immediate event or an MV3
  // service-worker restart can resume exactly the same queue.
  await persistWarmupJob(jobs, job)
  const results = await Promise.allSettled(
    starting.map((tabId) => startTabLoad(job, tabId))
  )
  const failures = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          {
            tabId: starting[index],
            error:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
          }
        ]
      : []
  )
  if (!failures.length) return

  const failed = failures.map(({ tabId }) => tabId)
  const failedIds = new Set(failed)
  job.inflightTabs = job.inflightTabs.filter(
    ({ tabId }) => !failedIds.has(tabId)
  )
  job.pendingTabIds = [
    ...failed,
    ...job.pendingTabIds.filter((tabId) => !failedIds.has(tabId))
  ]
  job.retryAt = Date.now() + RETRY_DELAY_MS
  void logWarn(
    "workspace-tab-warmup",
    "后台启动部分标签失败，已保留队尾任务等待重试",
    failures
  )
}

const processWarmupJob = async (windowId: number, expectedRunId?: string) => {
  const jobs = await readWarmupJobs()
  const job = jobs[String(windowId)]
  if (!job || (expectedRunId && job.runId !== expectedRunId)) return

  const binding = await getWorkspaceWindowBinding(windowId)
  if (
    !binding ||
    binding.stale === true ||
    binding.workspaceId !== job.workspaceId
  ) {
    await removeWarmupJob(jobs, windowId)
    return
  }

  let tabsById: Map<number, chrome.tabs.Tab>
  try {
    tabsById = await loadWindowTabs(windowId)
  } catch {
    await removeWarmupJob(jobs, windowId)
    return
  }

  const now = Date.now()
  reconcileInflightTabs(job, tabsById, now)
  reconcilePendingTabs(job, tabsById, now)

  if (job.retryAt !== undefined && job.retryAt <= now) {
    job.retryAt = undefined
  }
  if (job.retryAt === undefined) await startPendingTabs(jobs, job)

  if (!job.pendingTabIds.length && !job.inflightTabs.length) {
    await removeWarmupJob(jobs, windowId)
    return
  }
  await persistWarmupJob(jobs, job)
}

const cancelWarmupJob = async (windowId: number) => {
  const jobs = await readWarmupJobs()
  if (!jobs[String(windowId)]) {
    await clearWarmupAlarm(windowId)
    return
  }
  await removeWarmupJob(jobs, windowId)
}

export const startWorkspaceTabWarmup = (options: {
  windowId: number
  workspaceId: string
  targets: WorkspaceTabWarmupTarget[]
}) =>
  enqueueWarmup(async () => {
    const targets = normalizeTargets(options.targets)
    await cancelWarmupJob(options.windowId)
    if (!targets.length) return

    const targetUrls = Object.fromEntries(
      targets.map(({ tabId, url }) => [String(tabId), url])
    )
    const job: WorkspaceTabWarmupJob = {
      runId: uuid(),
      windowId: options.windowId,
      workspaceId: options.workspaceId,
      targetUrls,
      pendingTabIds: targets.map(({ tabId }) => tabId),
      inflightTabs: [],
      updatedAt: Date.now()
    }
    const jobs = await readWarmupJobs()
    jobs[String(options.windowId)] = job
    await writeWarmupJobs(jobs)
    await processWarmupJob(options.windowId, job.runId)
  })

export const cancelWorkspaceTabWarmup = (windowId: number) =>
  enqueueWarmup(() => cancelWarmupJob(windowId))

export const cancelAllWorkspaceTabWarmups = () =>
  enqueueWarmup(async () => {
    const jobs = await readWarmupJobs()
    await Promise.all(
      Object.values(jobs).map((job) => clearWarmupAlarm(job.windowId))
    )
    await writeWarmupJobs({})
  })

export const resumeWorkspaceTabWarmups = () =>
  enqueueWarmup(async () => {
    const jobs = await readWarmupJobs()
    for (const job of Object.values(jobs)) {
      await processWarmupJob(job.windowId, job.runId)
    }
  })

export const handleWorkspaceTabWarmupUpdated = (
  _tabId: number,
  change: chrome.tabs.OnUpdatedInfo,
  tab: chrome.tabs.Tab
) => {
  if (
    change.status !== "complete" &&
    change.discarded !== true &&
    change.status !== "loading"
  ) {
    return
  }
  void enqueueWarmup(() => processWarmupJob(tab.windowId))
}

export const handleWorkspaceTabWarmupActivated = (
  info: chrome.tabs.OnActivatedInfo
) => {
  void enqueueWarmup(() => processWarmupJob(info.windowId))
}

export const handleWorkspaceTabWarmupRemoved = (windowId: number) => {
  void enqueueWarmup(() => processWarmupJob(windowId))
}

export const handleWorkspaceTabWarmupAlarm = (alarmName: string) => {
  if (!alarmName.startsWith(WARMUP_ALARM_PREFIX)) return false
  const windowId = Number(alarmName.slice(WARMUP_ALARM_PREFIX.length))
  if (!isTabId(windowId)) return true
  void enqueueWarmup(() => processWarmupJob(windowId))
  return true
}

export const resetWorkspaceTabWarmupRuntime = () => {
  warmupQueue = Promise.resolve()
}
