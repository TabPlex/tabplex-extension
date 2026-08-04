import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  buildTimelineSummariesAgainstCurrent,
  diffSnapshotAgainstCurrent,
  getTimelineDiffKey
} from "~components/timeline/timelineDiff"
import { Button } from "~components/ui/button"
import { ScrollArea } from "~components/ui/scroll-area"
import type { TabSpec, WorkspaceSnapshot } from "~core/types"
import { DEFAULT_SETTINGS } from "~core/types"
import { formatDate, formatRelativeTime } from "~core/utils"
import { colorChoices, resolveWorkspaceColor } from "~core/utils/colors"
import { useWorkspaceManager } from "~hooks/useWorkspaceManager"
import { getTabDisplayTitle } from "~shared/logic"

import "~styles/timeline.css"

type TimelineMode = "standalone" | "embedded"

interface TimelineViewProps {
  mode?: TimelineMode
  workspaceId?: string | null
  onRequestClose?: () => void
  onRestoreApplied?: (payload: {
    restoredAt: number
    addedCount: number
    removedCount: number
  }) => void
}

const TimelineView = ({
  mode = "standalone",
  workspaceId: workspaceIdProp = null,
  onRequestClose,
  onRestoreApplied
}: TimelineViewProps) => {
  const isEmbedded = mode === "embedded"
  const { t } = useTranslation()
  const {
    version,
    sortedWorkspaces,
    settings,
    ensureActiveWorkspace,
    switchTo,
    restoreSnapshot
  } = useWorkspaceManager()
  const accentColor =
    settings?.accentColor ?? DEFAULT_SETTINGS.accentColor ?? "#6C5CE7"
  const workspacePalette = useMemo(
    () => colorChoices(accentColor),
    [accentColor]
  )
  const defaultWorkspaceColor = workspacePalette[0] ?? accentColor

  const initialStandaloneId = useMemo(() => {
    if (isEmbedded || typeof window === "undefined") return null
    const params = new URLSearchParams(window.location.search)
    return params.get("workspaceId")
  }, [isEmbedded])

  const [selectedId, setSelectedId] = useState<string | null>(
    isEmbedded ? workspaceIdProp : initialStandaloneId
  )
  const [timelineIndex, setTimelineIndex] = useState(0)
  const [restoringSnapshotId, setRestoringSnapshotId] = useState<string | null>(
    null
  )
  const [restoreMessageKey, setRestoreMessageKey] = useState<string | null>(
    null
  )

  useEffect(() => {
    if (!sortedWorkspaces.length) {
      setSelectedId(null)
      return
    }
    if (isEmbedded) {
      setSelectedId((prev) => {
        if (
          workspaceIdProp &&
          sortedWorkspaces.some((tag) => tag.id === workspaceIdProp)
        ) {
          return workspaceIdProp
        }
        return prev && sortedWorkspaces.some((tag) => tag.id === prev)
          ? prev
          : sortedWorkspaces[0].id
      })
      return
    }
    setSelectedId((prev) => {
      if (prev && sortedWorkspaces.some((tag) => tag.id === prev)) return prev
      if (
        initialStandaloneId &&
        sortedWorkspaces.some((tag) => tag.id === initialStandaloneId)
      ) {
        return initialStandaloneId
      }
      return sortedWorkspaces[0].id
    })
  }, [initialStandaloneId, isEmbedded, sortedWorkspaces, workspaceIdProp])

  useEffect(() => {
    setTimelineIndex(0)
  }, [selectedId])

  useEffect(() => {
    if (isEmbedded || typeof window === "undefined" || !selectedId) return
    try {
      const url = new URL(window.location.href)
      url.searchParams.set("workspaceId", selectedId)
      window.history.replaceState(null, "", url.toString())
    } catch {}
  }, [isEmbedded, selectedId])

  const selectedTag = useMemo(
    () =>
      selectedId
        ? (sortedWorkspaces.find((tag) => tag.id === selectedId) ?? null)
        : null,
    [selectedId, sortedWorkspaces]
  )
  const visibleWorkspaceTabs = useMemo(() => {
    if (!selectedTag?.tabs?.length) return []
    return selectedTag.tabs.filter((tab) => !tab.pinned)
  }, [selectedTag?.tabs])

  const timelineBadgeColor = resolveWorkspaceColor(
    selectedTag?.color,
    defaultWorkspaceColor
  )
  const timelineBadgeClass =
    timelineBadgeColor === "transparent"
      ? "timeline-sidebar-color is-transparent"
      : "timeline-sidebar-color"

  const describeUrl = useCallback((url: string) => {
    const truncate = (value: string, max = 60) =>
      value.length > max ? `${value.slice(0, max - 1)}…` : value

    try {
      const parsed = new URL(url)
      const host = parsed.hostname.replace(/^www\./, "")
      const rawPath = parsed.pathname.replace(/\/$/, "")
      const path = rawPath && rawPath !== "/" ? rawPath : ""
      const decodedPath = (() => {
        if (!path) return ""
        try {
          return decodeURI(path)
        } catch {
          return path
        }
      })()
      const prettyPath = truncate(decodedPath, 48)
      const display = prettyPath ? `${host}${prettyPath}` : host
      return { host, path: prettyPath, display }
    } catch {
      return { host: url, path: "", display: url }
    }
  }, [])

  const timelineSummaries = useMemo(() => {
    if (!selectedTag?.history?.length) return []
    return buildTimelineSummariesAgainstCurrent(
      selectedTag.history,
      selectedTag.tabs ?? []
    )
  }, [selectedTag?.history, selectedTag?.tabs])

  useEffect(() => {
    if (timelineSummaries.length === 0) {
      setTimelineIndex(0)
    } else {
      setTimelineIndex((prev) => (prev < timelineSummaries.length ? prev : 0))
    }
  }, [timelineSummaries.length])

  const safeTimelineIndex = timelineSummaries.length
    ? Math.min(timelineIndex, timelineSummaries.length - 1)
    : 0

  const activeSummary = timelineSummaries[safeTimelineIndex]
  const activeEntry = activeSummary?.entry ?? null
  const visibleSnapshotTabs = useMemo(() => {
    if (!activeEntry?.tabs?.length) return []
    return activeEntry.tabs.filter((tab) => !tab.pinned)
  }, [activeEntry?.tabs])

  const handleSelectEntry = useCallback((index: number) => {
    setRestoreMessageKey(null)
    setTimelineIndex(index)
  }, [])

  const backHomeHref = useMemo(() => {
    const params = new URLSearchParams()
    params.set("mode", "home")
    if (selectedTag?.id) params.set("workspaceId", selectedTag.id)
    if (version) params.set("v", version)

    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
        const url = new URL(chrome.runtime.getURL("popup.html"))
        url.search = params.toString()
        return url.toString()
      }
    } catch {}

    return `popup.html?${params.toString()}`
  }, [selectedTag?.id, version])

  const activeDiff = useMemo(() => {
    if (!activeSummary) {
      return { additions: [] as TabSpec[], removals: [] as TabSpec[] }
    }
    return {
      additions: activeSummary.additions,
      removals: activeSummary.removals
    }
  }, [activeSummary])

  const addedTabFlags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tab of activeDiff.additions) {
      const key = getTimelineDiffKey(tab)
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return visibleSnapshotTabs.map((tab) => {
      const key = getTimelineDiffKey(tab)
      if (!key) return false
      const count = counts.get(key) ?? 0
      if (count <= 0) return false
      counts.set(key, count - 1)
      return true
    })
  }, [activeDiff.additions, visibleSnapshotTabs])

  const renderDiffListItem = useCallback(
    (tab: TabSpec, index: number, tone: "addition" | "removal" | "neutral") => {
      // Render using the exact same structure/classes as Home's tab list so
      // visuals stay consistent. Only difference: rows are not interactive.
      const { host, display: linkText } = describeUrl(tab.url)
      const titleText = getTabDisplayTitle(tab, host || tab.url)
      const fallback = (host || tab.url || "").slice(0, 1).toUpperCase() || "·"
      const key = `${tone}-${activeEntry?.id ?? "na"}-${index}`
      const toneClass =
        tone === "addition"
          ? " is-addition"
          : tone === "removal"
            ? " is-removal"
            : ""
      return (
        <li key={key} className={`tab-item timeline-diff-item${toneClass}`}>
          <div className="tab-inner">
            <div className="tab-main">
              {tab.faviconUrl ? (
                <img
                  className="tab-icon"
                  src={tab.faviconUrl}
                  alt=""
                  width={24}
                  height={24}
                  onError={(event) => {
                    event.currentTarget.style.display = "none"
                  }}
                />
              ) : (
                <span className="tab-icon fallback">{fallback}</span>
              )}
              <div className="tab-text">
                <div className="tab-title" title={titleText}>
                  {titleText}
                </div>
                <div className="tab-meta">
                  <span className="tab-link" title={linkText}>
                    {linkText}
                  </span>
                  {tab.pinned ? (
                    <span className="tab-badge">{t("timeline.pinned")}</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </li>
      )
    },
    [activeEntry?.id, describeUrl, t]
  )

  const handleOpenWorkspace = async () => {
    if (!selectedTag) return
    await switchTo(selectedTag.id)
    if (!isEmbedded) {
      window.close()
      return
    }
    onRequestClose?.()
  }

  const handleRestoreSnapshot = async (entry: WorkspaceSnapshot) => {
    if (!selectedTag || restoringSnapshotId) return
    const workspaceId = selectedTag.id
    const restoreDiff = diffSnapshotAgainstCurrent(
      selectedTag.tabs ?? [],
      entry.tabs ?? []
    )

    setRestoreMessageKey(null)
    setRestoringSnapshotId(entry.id)
    try {
      const restored = await restoreSnapshot(workspaceId, entry.id)
      if (!restored) {
        setRestoreMessageKey("timeline.restoreError")
        setRestoringSnapshotId(null)
        return
      }

      try {
        await ensureActiveWorkspace(workspaceId)
      } catch (error) {
        console.warn("[TabPlex] 时间点已恢复，但打开工作区失败", error)
        onRestoreApplied?.({
          restoredAt: entry.createdAt,
          addedCount: restoreDiff.additions.length,
          removedCount: restoreDiff.removals.length
        })
        setRestoreMessageKey("timeline.restoreOpenError")
        setRestoringSnapshotId(null)
        return
      }

      setRestoringSnapshotId(null)
      onRestoreApplied?.({
        restoredAt: entry.createdAt,
        addedCount: restoreDiff.additions.length,
        removedCount: restoreDiff.removals.length
      })
      if (!isEmbedded) {
        window.close()
      } else {
        onRequestClose?.()
      }
    } catch (err) {
      console.warn("[TabPlex] 快速恢复失败", err)
      setRestoreMessageKey("timeline.restoreError")
      setRestoringSnapshotId(null)
    }
  }

  const handleBackHome = useCallback(() => {
    if (isEmbedded) {
      onRequestClose?.()
      return
    }
    if (typeof window === "undefined") return
    window.location.href = backHomeHref
  }, [backHomeHref, isEmbedded, onRequestClose])

  // 也响应来自后台的全局命令转发（返回主页）
  useEffect(() => {
    const onMessage = (
      msg: any,
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (r?: any) => void
    ) => {
      if (!msg || !msg._tabplex || msg.type !== "app-shortcut") return
      if (msg.action === "goHome") {
        void handleBackHome()
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => {
      try {
        chrome.runtime.onMessage.removeListener(onMessage)
      } catch {}
    }
  }, [handleBackHome])

  const containerClassName = isEmbedded
    ? "timeline-embedded"
    : "timeline-page timeline-popup"

  return (
    <div className={containerClassName}>
      {!isEmbedded ? (
        <header className="timeline-header">
          <div className="timeline-brand">
            <span className="timeline-dot" />
            <div>
              <div className="timeline-title">{t("timeline.title")}</div>
              <div className="timeline-meta">v{version}</div>
            </div>
          </div>
          <div className="timeline-header-actions">
            <Button variant="outline" size="sm" asChild>
              <a
                href={backHomeHref}
                onClick={(event) => {
                  event.preventDefault()
                  handleBackHome()
                }}>
                {t("timeline.backHome")}
              </a>
            </Button>
            {selectedTag ? (
              <Button size="sm" onClick={() => void handleOpenWorkspace()}>
                {t("timeline.openWorkspace")}
              </Button>
            ) : null}
          </div>
        </header>
      ) : null}

      <div className="timeline-body">
        <div className="timeline-body-scroll">
          <main className="timeline-main">
            {!selectedTag ? (
              <div className="timeline-empty">{t("timeline.empty")}</div>
            ) : (
              <div className="timeline-content">
                <div className="timeline-main-header">
                  <div className="timeline-main-info">
                    <span
                      className={timelineBadgeClass}
                      style={{ backgroundColor: timelineBadgeColor }}
                      aria-hidden="true">
                      {selectedTag.emoji ? selectedTag.emoji : null}
                    </span>
                    <div className="timeline-main-copy">
                      <div className="timeline-main-name">
                        {selectedTag.name || t("common.unnamedWorkspace")}
                      </div>
                      <div className="timeline-main-meta">
                        <span>
                          {t("common.pageCount", {
                            count: visibleWorkspaceTabs.length
                          })}
                        </span>
                        {timelineSummaries.length ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              {t("timeline.meta.historyCount", {
                                count: timelineSummaries.length
                              })}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="timeline-main-recent">
                              {t("timeline.meta.recentUpdate", {
                                time: formatRelativeTime(
                                  timelineSummaries[0].entry.createdAt
                                )
                              })}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                {timelineSummaries.length ? (
                  <div className="timeline-panels">
                    <div className="timeline-history">
                      <ScrollArea className="timeline-history-scroll">
                        <ul className="timeline-history-list">
                          {timelineSummaries.map((item, index) => {
                            const isActive = index === safeTimelineIndex
                            const { entry, additions, removals } = item
                            return (
                              <li key={entry.id}>
                                <button
                                  type="button"
                                  className={`timeline-history-item${
                                    isActive ? " is-active" : ""
                                  }`}
                                  disabled={!!restoringSnapshotId}
                                  aria-current={isActive ? "true" : undefined}
                                  onClick={() => handleSelectEntry(index)}>
                                  <div className="timeline-history-heading">
                                    <span className="timeline-history-when">
                                      <span className="timeline-history-relative">
                                        {formatRelativeTime(entry.createdAt)}
                                      </span>
                                      <span className="timeline-history-date">
                                        {formatDate(entry.createdAt)}
                                      </span>
                                    </span>
                                    <span className="timeline-history-count">
                                      {t("common.pageCount", {
                                        count: item.tabCount
                                      })}
                                    </span>
                                    <div className="timeline-history-summary">
                                      {additions.length || removals.length ? (
                                        <div className="timeline-history-diff">
                                          {additions.length ? (
                                            <span className="timeline-diff-chip additions">
                                              {t("timeline.diff.added", {
                                                count: additions.length
                                              })}
                                            </span>
                                          ) : null}
                                          {removals.length ? (
                                            <span className="timeline-diff-chip removals">
                                              {t("timeline.diff.removed", {
                                                count: removals.length
                                              })}
                                            </span>
                                          ) : null}
                                        </div>
                                      ) : (
                                        t("timeline.diff.none")
                                      )}
                                    </div>
                                  </div>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </ScrollArea>
                    </div>

                    <div className="timeline-detail">
                      {activeEntry ? (
                        <>
                          <div className="timeline-panel-meta">
                            <span className="timeline-panel-time">
                              {formatRelativeTime(activeEntry.createdAt)} ·{" "}
                              {formatDate(activeEntry.createdAt)}
                            </span>
                            <div className="timeline-panel-actions">
                              <span className="timeline-panel-count">
                                {t("common.pageCount", {
                                  count: visibleSnapshotTabs.length
                                })}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="timeline-restore-action"
                                disabled={!!restoringSnapshotId}
                                aria-busy={
                                  restoringSnapshotId === activeEntry.id
                                }
                                onClick={() =>
                                  void handleRestoreSnapshot(activeEntry)
                                }>
                                {restoringSnapshotId === activeEntry.id
                                  ? t("timeline.restoring")
                                  : t("timeline.restore")}
                              </Button>
                            </div>
                          </div>
                          {restoreMessageKey ? (
                            <p className="timeline-restore-error" role="alert">
                              {t(restoreMessageKey)}
                            </p>
                          ) : null}

                          <div className="timeline-diff-section timeline-card">
                            <div className="timeline-diff-title">
                              {t("timeline.snapshot.title")}
                            </div>
                            <ScrollArea className="timeline-diff-scroll">
                              <div className="timeline-panel-diff">
                                <div className="timeline-panel-diff-group">
                                  {visibleSnapshotTabs.length ? (
                                    <ul className="timeline-diff-list">
                                      {visibleSnapshotTabs.map((tab, index) => {
                                        const tone = addedTabFlags[index]
                                          ? "addition"
                                          : "neutral"
                                        return renderDiffListItem(
                                          tab,
                                          index,
                                          tone
                                        )
                                      })}
                                    </ul>
                                  ) : (
                                    <div className="timeline-diff-muted">
                                      {t("timeline.snapshot.empty")}
                                    </div>
                                  )}
                                </div>
                                {activeDiff.removals.length ? (
                                  <div className="timeline-panel-diff-group removals">
                                    <div className="timeline-diff-title">
                                      {t("timeline.diff.titleRemoved")}
                                    </div>
                                    <ul className="timeline-diff-list">
                                      {activeDiff.removals.map((tab, index) =>
                                        renderDiffListItem(
                                          tab,
                                          index,
                                          "removal"
                                        )
                                      )}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            </ScrollArea>
                          </div>
                        </>
                      ) : (
                        <div className="timeline-panel-empty">
                          {t("timeline.selectHint")}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="timeline-empty">
                    {t("timeline.emptyHistory")}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

export default TimelineView
