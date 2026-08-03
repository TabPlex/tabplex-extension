import type { TabSpec } from "~core/types"
import { isSafeTabUrl } from "~core/utils"

export type RecordableWindowTabLike = {
  id?: number
  index: number
  url?: string
  pendingUrl?: string
  pinned?: boolean
  status?: string
  title?: string
  favIconUrl?: string
}

type RecordableWindowTabBusyDiagnostic = {
  tabId: number | null
  index: number
  reason: "loading" | "pending-navigation"
  urlSource: "url" | "pendingUrl"
}

type RecordableWindowTabUnverifiableDiagnostic = {
  tabId: number | null
  index: number
  reason: "error-page-without-safe-pending-url"
}

export type RecordableWindowTabsProjection = {
  tabs: TabSpec[]
  recordableTabIds: number[]
  busy: boolean
  unverifiable: boolean
  diagnostics: {
    busy: RecordableWindowTabBusyDiagnostic[]
    unverifiable: RecordableWindowTabUnverifiableDiagnostic[]
  }
}

export type RecordableWindowTabsInput = {
  tabs: readonly RecordableWindowTabLike[]
  isHomeUrl: (url: string) => boolean
}

const exactUrl = (value?: string) => value?.trim() ?? ""

const isErrorPageUrl = (value: string) => {
  const lower = value.toLowerCase()
  return (
    lower.startsWith("chrome-error://") ||
    lower.startsWith("chrome://chromewebdata/")
  )
}

const tabIdOrNull = (tab: RecordableWindowTabLike) =>
  typeof tab.id === "number" ? tab.id : null

const sortTabsByIndex = (tabs: readonly RecordableWindowTabLike[]) =>
  tabs
    .map((tab, inputOrder) => ({ tab, inputOrder }))
    .sort(
      (left, right) =>
        left.tab.index - right.tab.index || left.inputOrder - right.inputOrder
    )
    .map(({ tab }) => tab)

const resolveExactTabUrl = (tab: RecordableWindowTabLike) => {
  const pendingUrl = exactUrl(tab.pendingUrl)
  if (pendingUrl) {
    return { url: pendingUrl, source: "pendingUrl" as const }
  }
  return { url: exactUrl(tab.url), source: "url" as const }
}

const toTabSpec = (tab: RecordableWindowTabLike, url: string): TabSpec => ({
  url,
  pinned: false,
  title: tab.title ?? "",
  faviconUrl: tab.favIconUrl ?? ""
})

export const projectRecordableWindowTabs = ({
  tabs,
  isHomeUrl
}: RecordableWindowTabsInput): RecordableWindowTabsProjection => {
  const recordableTabs: TabSpec[] = []
  const recordableTabIds: number[] = []
  const busyDiagnostics: RecordableWindowTabBusyDiagnostic[] = []
  const unverifiableDiagnostics: RecordableWindowTabUnverifiableDiagnostic[] =
    []

  for (const tab of sortTabsByIndex(tabs)) {
    if (tab.pinned) continue

    const currentUrl = exactUrl(tab.url)
    const pendingUrl = exactUrl(tab.pendingUrl)
    const resolved = resolveExactTabUrl(tab)

    if (resolved.url && isHomeUrl(resolved.url)) continue

    if (
      (isErrorPageUrl(currentUrl) || isErrorPageUrl(pendingUrl)) &&
      !isSafeTabUrl(pendingUrl)
    ) {
      unverifiableDiagnostics.push({
        tabId: tabIdOrNull(tab),
        index: tab.index,
        reason: "error-page-without-safe-pending-url"
      })
      continue
    }

    if (!isSafeTabUrl(resolved.url)) continue

    if (tab.status === "loading" || pendingUrl) {
      busyDiagnostics.push({
        tabId: tabIdOrNull(tab),
        index: tab.index,
        reason: tab.status === "loading" ? "loading" : "pending-navigation",
        urlSource: resolved.source
      })
    }

    recordableTabs.push(toTabSpec(tab, resolved.url))
    if (typeof tab.id === "number") recordableTabIds.push(tab.id)
  }

  return {
    tabs: recordableTabs,
    recordableTabIds,
    busy: busyDiagnostics.length > 0,
    unverifiable: unverifiableDiagnostics.length > 0,
    diagnostics: {
      busy: busyDiagnostics,
      unverifiable: unverifiableDiagnostics
    }
  }
}
