import { MotionConfig } from "motion/react"
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState
} from "react"
import { useTranslation } from "react-i18next"

import { HomeIcon } from "~components/ui/home"
import { SearchIcon } from "~components/ui/search"

import "~src/i18n"

import { AppErrorBoundary } from "~components/AppErrorBoundary"
import HomeView from "~components/HomeView"
import { Button } from "~components/ui/button"
import { Input } from "~components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "~components/ui/tooltip"
import type { Workspace } from "~core/types"
import { DEFAULT_SETTINGS } from "~core/types"
import { formatRelativeTime } from "~core/utils"
import {
  applyAccentTheme,
  colorChoices,
  resolveWorkspaceColor
} from "~core/utils/colors"
import {
  canCreatePopupWorkspace,
  clampPopupActiveIndex,
  movePopupActiveIndex,
  resolvePopupNavigationAction
} from "~features/popup/popupNavigation"
import { useWorkspaceSwitchGuard } from "~features/workspace/hooks/useWorkspaceSwitchGuard"
import { capturePortableTabGroups } from "~features/workspace/logic/portableTabGroups"
import { buildTabSpecsFromTabs } from "~features/workspace/logic/workspaceLogic"
import {
  isWorkspaceSwitchInProgressError,
  isWorkspaceSwitchTabsStillLoadingError
} from "~features/workspace/logic/workspaceSwitchErrors"
import { WorkspaceDataProvider } from "~features/workspace/WorkspaceDataProvider"
import { useWorkspaceManager } from "~hooks/useWorkspaceManager"
import { useWorkspaceSwitching } from "~hooks/useWorkspaceSwitching"
import {
  applyThemePreference,
  countVisibleTabs,
  readCachedThemePreference
} from "~lib/common"
import { cn } from "~lib/utils"
import { groupWorkspacesByRecency } from "~shared/logic"

import "~styles/tailwind.css"
import "~styles/popup.css"

const TimelineViewLazy = lazy(() => import("~components/TimelineView"))

applyThemePreference(readCachedThemePreference())

const PageFallback = () => (
  <div className="flex min-h-screen w-full items-center justify-center bg-white" />
)

type PopupWorkspaceListItem =
  | { type: "group"; id: string; title: string; isFirst: boolean }
  | { type: "workspace"; id: string; workspace: Workspace }

type PopupStatus = {
  kind: "error" | "info"
  message: string
}

const Popup = () => {
  const mode = useMemo(() => {
    if (typeof window === "undefined") return null
    return new URLSearchParams(window.location.search).get("mode")
  }, [])

  const {
    sortedWorkspaces,
    workspaceState,
    settings,
    resolvedTheme,
    createWorkspace,
    switchTo,
    updateSetting
  } = useWorkspaceManager()
  const { t, i18n } = useTranslation()

  useEffect(() => {
    if (settings?.language && settings.language !== i18n.language) {
      void i18n.changeLanguage(settings.language)
    }
  }, [settings?.language, i18n])

  const accentColor =
    settings?.accentColor ?? DEFAULT_SETTINGS.accentColor ?? "#6C5CE7"
  const workspacePalette = useMemo(
    () => colorChoices(accentColor),
    [accentColor]
  )
  const fallbackWorkspaceColor = workspacePalette[0] ?? accentColor

  const [query, setQuery] = useState("")
  const [activeActionIndex, setActiveActionIndex] = useState(0)
  const [switchStatus, setSwitchStatus] = useState<PopupStatus | null>(null)
  const [homeOpenPending, setHomeOpenPending] = useState(false)
  const { isSwitchingInProgress, targetName, progressRatio, counts } =
    useWorkspaceSwitching()
  const {
    isLocked: switchLocked,
    acquire: acquireSwitch,
    release: releaseSwitch,
    acquireLatest: acquireLatestSwitch,
    isLatest: isLatestSwitch,
    releaseLatest: releaseLatestSwitch
  } = useWorkspaceSwitchGuard(isSwitchingInProgress)

  const showSwitchBlocked = useCallback(() => {
    setHomeOpenPending(false)
    setSwitchStatus({
      kind: "info",
      message: t("home.workspace.switchBlocked")
    })
  }, [t])

  const getCurrentWindowId = useCallback(async () => {
    try {
      const win = await chrome.windows.getCurrent({ populate: false })
      if (win.type && win.type !== "normal") return undefined
      return typeof win.id === "number" ? win.id : undefined
    } catch {
      return undefined
    }
  }, [])

  const openHome = useCallback(
    async (activate: boolean, preferredWindowId?: number) => {
      const targetWindowId =
        typeof preferredWindowId === "number"
          ? preferredWindowId
          : await getCurrentWindowId()
      const response = await chrome.runtime.sendMessage({
        _tabplex: true,
        type: activate ? "open-home" : "ensure-home",
        activate,
        preferredWindowId: targetWindowId
      })
      return !response || response.ok !== false
    },
    [getCurrentWindowId]
  )

  const openHomeAndClose = useCallback(
    async (preferredWindowId?: number) => {
      try {
        const opened = await openHome(true, preferredWindowId)
        if (!opened) {
          setHomeOpenPending(true)
          setSwitchStatus({
            kind: "error",
            message: t("home.workspace.openHomeFailed")
          })
          return false
        }
        setHomeOpenPending(false)
        window.close()
        return true
      } catch (error) {
        console.warn("[TabPlex] 打开主页失败", error)
        setHomeOpenPending(true)
        setSwitchStatus({
          kind: "error",
          message: t("home.workspace.openHomeFailed")
        })
        return false
      }
    },
    [openHome, t]
  )

  const handleSelectWorkspace = useCallback(
    async (tag: Workspace) => {
      const switchIntent = acquireLatestSwitch()
      if (switchIntent === null) {
        showSwitchBlocked()
        return
      }
      setSwitchStatus(null)
      setHomeOpenPending(false)
      let preferredWindowId: number | undefined
      try {
        preferredWindowId = await getCurrentWindowId()
        if (!isLatestSwitch(switchIntent)) return
        await switchTo(tag.id, { preferredWindowId })
      } catch (error) {
        if (!isLatestSwitch(switchIntent)) return
        console.warn("[TabPlex] 切换工作区失败", error)
        const switchWasBlocked = isWorkspaceSwitchInProgressError(error)
        const tabsStillLoading = isWorkspaceSwitchTabsStillLoadingError(error)
        setSwitchStatus({
          kind: switchWasBlocked || tabsStillLoading ? "info" : "error",
          message: t(
            switchWasBlocked
              ? "home.workspace.switchBlocked"
              : tabsStillLoading
                ? "home.workspace.tabsStillLoading"
                : "common.switchFailed"
          )
        })
        return
      } finally {
        releaseLatestSwitch(switchIntent)
      }
      if (!isLatestSwitch(switchIntent)) return
      await openHomeAndClose(preferredWindowId)
    },
    [
      acquireLatestSwitch,
      getCurrentWindowId,
      isLatestSwitch,
      openHomeAndClose,
      releaseLatestSwitch,
      showSwitchBlocked,
      switchTo,
      t
    ]
  )

  const quickCreate = useCallback(async () => {
    const name = query.trim()
    if (!name) return
    if (!acquireSwitch()) {
      showSwitchBlocked()
      return
    }
    setSwitchStatus(null)
    try {
      const preferredWindowId = await getCurrentWindowId()
      // Capture the normal window that opened this popup explicitly.
      const rawTabs = await chrome.tabs.query({ currentWindow: true })
      const liveSpecs = buildTabSpecsFromTabs(rawTabs)
      const sanitized = await capturePortableTabGroups({
        liveTabs: rawTabs,
        liveSpecs,
        previousTabs: []
      })

      const creation = await createWorkspace({
        name,
        activate: true,
        preferredWindowId,
        tabs: sanitized,
        seedFromCurrentWindow: false // We provided explicit tabs
      })
      setQuery("")
      if (creation.activation.status === "failed") {
        setSwitchStatus({
          kind: "info",
          message: t("home.create.popup.partialSuccess")
        })
        return
      }
      await openHomeAndClose(preferredWindowId)
    } catch (error) {
      console.warn("[TabPlex] 快速创建失败", error)
      const switchWasBlocked = isWorkspaceSwitchInProgressError(error)
      const tabsStillLoading = isWorkspaceSwitchTabsStillLoadingError(error)
      setSwitchStatus({
        kind: switchWasBlocked || tabsStillLoading ? "info" : "error",
        message: t(
          switchWasBlocked
            ? "home.workspace.switchBlocked"
            : tabsStillLoading
              ? "home.workspace.tabsStillLoading"
              : "home.create.popup.error"
        )
      })
    } finally {
      releaseSwitch()
    }
  }, [
    acquireSwitch,
    createWorkspace,
    getCurrentWindowId,
    openHomeAndClose,
    query,
    releaseSwitch,
    showSwitchBlocked,
    t
  ])

  useEffect(() => {
    void openHome(false).catch(() => {})
  }, [openHome])

  useEffect(() => {
    applyAccentTheme(accentColor, resolvedTheme)
  }, [accentColor, resolvedTheme])

  useLayoutEffect(() => {
    if (typeof document === "undefined") return
    const root = document.documentElement
    if (resolvedTheme === "dark") root.classList.add("dark")
    else root.classList.remove("dark")
    root.style.colorScheme = resolvedTheme || "light"
    return () => {
      root.style.colorScheme = ""
    }
  }, [resolvedTheme])

  const activeId = workspaceState.activeWorkspaceId
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sortedWorkspaces
    return sortedWorkspaces.filter((t) =>
      (t.name || "").toLowerCase().includes(q)
    )
  }, [sortedWorkspaces, query])
  // 不再置顶“当前”，仅用于标记当前项
  const groupedByRecency = useMemo(() => {
    const sortKey =
      settings?.workspaceSort ?? DEFAULT_SETTINGS.workspaceSort ?? "lastUsed"
    return groupWorkspacesByRecency(filtered, sortKey)
  }, [filtered, settings?.workspaceSort])
  const listItems = useMemo<PopupWorkspaceListItem[]>(() => {
    return groupedByRecency.flatMap((group, index) => [
      {
        type: "group" as const,
        id: `group-${group.title}`,
        title: group.title,
        isFirst: index === 0
      },
      ...group.items.map((workspace) => ({
        type: "workspace" as const,
        id: workspace.id,
        workspace
      }))
    ])
  }, [groupedByRecency])
  const navigableWorkspaces = useMemo(
    () => groupedByRecency.flatMap((group) => group.items),
    [groupedByRecency]
  )
  const workspaceIndexById = useMemo(
    () =>
      new Map(
        navigableWorkspaces.map((workspace, index) => [workspace.id, index])
      ),
    [navigableWorkspaces]
  )
  const canCreateFromQuery = useMemo(
    () => canCreatePopupWorkspace(sortedWorkspaces, query),
    [query, sortedWorkspaces]
  )
  const actionCount = navigableWorkspaces.length + (canCreateFromQuery ? 1 : 0)

  useEffect(() => {
    const currentWorkspaceIndex = activeId
      ? workspaceIndexById.get(activeId)
      : undefined
    setActiveActionIndex(query.trim() ? 0 : currentWorkspaceIndex ?? 0)
  }, [activeId, query, workspaceIndexById])

  useEffect(() => {
    setActiveActionIndex((current) =>
      clampPopupActiveIndex(current, actionCount)
    )
  }, [actionCount])

  const currentSort =
    settings?.workspaceSort ?? DEFAULT_SETTINGS.workspaceSort ?? "lastUsed"
  const isCreatedSort = currentSort === "created"
  const currentSortLabel = isCreatedSort
    ? t("home.sidebar.sort.created")
    : t("home.sidebar.sort.lastUsed")
  const toggleSort = useCallback(() => {
    const next = isCreatedSort ? "lastUsed" : "created"
    updateSetting("workspaceSort", next)
  }, [isCreatedSort, updateSetting])

  const switchProgressPercentage = Math.round(progressRatio * 100)
  const activeOptionId =
    actionCount > 0
      ? activeActionIndex < navigableWorkspaces.length
        ? `popup-workspace-option-${activeActionIndex}`
        : "popup-create-option"
      : undefined

  const selectPopupAction = (index: number) => {
    const action = resolvePopupNavigationAction(
      index,
      navigableWorkspaces.length,
      canCreateFromQuery
    )
    if (!action) return
    if (action.type === "create") {
      void quickCreate()
      return
    }
    const workspace = navigableWorkspaces[action.workspaceIndex]
    if (workspace) void handleSelectWorkspace(workspace)
  }

  if (mode === "home") {
    return <HomeView />
  }

  if (mode === "timeline") {
    return (
      <Suspense fallback={<PageFallback />}>
        <TimelineViewLazy />
      </Suspense>
    )
  }

  return (
    <div className="tg-root">
      <header className="tg-header">
        <div className="tg-title">
          <span>TabPlex</span>
        </div>
        <div className="tg-actions">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="home-icon-button"
                  aria-label={t("home.actions.goHome")}
                  onClick={async () => {
                    await openHomeAndClose()
                  }}>
                  <HomeIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("home.actions.goHome")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      <div className="tg-body">
        <section className="tg-create">
          <div className="sidebar-search">
            <SearchIcon className="sidebar-search-icon" aria-hidden="true" />
            <Input
              className="home-input pl-9 border-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:ring-0 focus:outline-none"
              placeholder={t("home.sidebar.searchPlaceholder")}
              aria-label={t("home.sidebar.searchPlaceholder")}
              aria-autocomplete="list"
              aria-controls={
                actionCount > 0 ? "popup-workspace-options" : undefined
              }
              aria-expanded={actionCount > 0}
              aria-activedescendant={activeOptionId}
              role="combobox"
              name="workspace-search"
              autoComplete="off"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                const native = e.nativeEvent
                if (native.isComposing || native.keyCode === 229) return
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setActiveActionIndex((current) =>
                    movePopupActiveIndex(current, actionCount, "next")
                  )
                  return
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setActiveActionIndex((current) =>
                    movePopupActiveIndex(current, actionCount, "previous")
                  )
                  return
                }
                if (e.key === "Enter" && actionCount > 0) {
                  e.preventDefault()
                  selectPopupAction(activeActionIndex)
                }
              }}
            />
          </div>
        </section>

        <section className="tg-workspaces">
          {switchStatus ? (
            <div
              className={cn("tg-status tg-switch-error", switchStatus.kind)}
              role="status">
              <span>{switchStatus.message}</span>
              {homeOpenPending ? (
                <button
                  type="button"
                  className="ml-2 underline underline-offset-2"
                  onClick={() => void openHomeAndClose()}>
                  {t("home.workspace.retryOpenHome")}
                </button>
              ) : null}
            </div>
          ) : null}
          {isSwitchingInProgress ? (
            <div
              className="tg-switch-progress"
              role="status"
              aria-live="polite">
              <div className="tg-switch-progress-row">
                <span className="tg-switch-progress-title">
                  {t("home.switchProgress.opening", { name: targetName })}
                </span>
                <span className="tg-switch-progress-count">
                  {counts.completed}/{counts.expected}
                </span>
              </div>
              <div
                className="tg-switch-progress-bar"
                role="progressbar"
                aria-label={t("home.switchProgress.opening", {
                  name: targetName
                })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={switchProgressPercentage}>
                <div
                  className="tg-switch-progress-bar-fill"
                  style={{ width: `${switchProgressPercentage}%` }}
                />
              </div>
            </div>
          ) : null}
          {actionCount > 0 ? (
            <div
              id="popup-workspace-options"
              className="tg-workspace-scroll tg-workspace-list"
              role="listbox"
              aria-label={t("home.sidebar.sectionTitle")}>
              {listItems.map((item) => {
                if (item.type === "group") {
                  return (
                    <div
                      key={item.id}
                      className="tg-group-title"
                      role="presentation">
                      <span>{t(item.title)}</span>
                      {item.isFirst ? (
                        <button
                          type="button"
                          className={`sort-label${isCreatedSort ? " is-created" : ""}`}
                          aria-label={t("home.sidebar.sort.label")}
                          title={t("home.sidebar.sort.label")}
                          onClick={toggleSort}>
                          {currentSortLabel}
                        </button>
                      ) : null}
                    </div>
                  )
                }

                const tag = item.workspace
                const optionIndex = workspaceIndexById.get(tag.id)
                if (optionIndex === undefined) return null
                const isActive = tag.id === activeId
                const isHighlighted = optionIndex === activeActionIndex
                const pageCount = countVisibleTabs(tag.tabs)
                const lastUsed = formatRelativeTime(tag.lastUsedAt)
                const backgroundColor = resolveWorkspaceColor(
                  tag.color,
                  fallbackWorkspaceColor
                )
                const colorClass = cn(
                  "tg-workspace-color",
                  backgroundColor === "transparent" && "is-transparent"
                )

                return (
                  <button
                    type="button"
                    key={item.id}
                    id={`popup-workspace-option-${optionIndex}`}
                    className={cn(
                      "tg-workspace-item",
                      isActive && "is-active",
                      isHighlighted && "is-highlighted"
                    )}
                    role="option"
                    aria-selected={isHighlighted}
                    onMouseEnter={() => setActiveActionIndex(optionIndex)}
                    onClick={() => selectPopupAction(optionIndex)}>
                    <span
                      className={colorClass}
                      style={{ backgroundColor }}
                      aria-hidden="true">
                      {tag.emoji ? <span>{tag.emoji}</span> : null}
                    </span>
                    <div className="tg-workspace-main">
                      <div className="tg-workspace-name">
                        <span className="tg-workspace-name-text">
                          {tag.name || t("common.unnamedWorkspace")}
                        </span>
                        {isActive ? (
                          <span className="tg-workspace-pill">
                            {t("common.current")}
                          </span>
                        ) : null}
                      </div>
                      <div className="tg-workspace-meta">
                        <span>
                          {t("common.pageCount", { count: pageCount })}
                        </span>
                        {lastUsed ? (
                          <span>
                            · {t("common.lastUsed", { time: lastUsed })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                )
              })}
              {canCreateFromQuery ? (
                <button
                  type="button"
                  id="popup-create-option"
                  className={cn(
                    "tg-create-option",
                    activeActionIndex === navigableWorkspaces.length &&
                      "is-highlighted",
                    switchLocked && "is-switch-locked"
                  )}
                  role="option"
                  aria-selected={
                    activeActionIndex === navigableWorkspaces.length
                  }
                  aria-disabled={switchLocked}
                  onMouseEnter={() =>
                    setActiveActionIndex(navigableWorkspaces.length)
                  }
                  onClick={() => selectPopupAction(navigableWorkspaces.length)}>
                  <span className="tg-create-option-label">
                    {t("home.command.create", { name: query.trim() })}
                  </span>
                  <span className="tg-create-option-hint">
                    {t("home.quickSwitcher.createHint")}
                  </span>
                </button>
              ) : null}
            </div>
          ) : query.trim() ? (
            <div className="tg-empty">{t("home.sidebar.emptyMatch")}</div>
          ) : (
            <div className="tg-empty">{t("home.sidebar.emptyAll")}</div>
          )}
          <div className="tg-keyboard-hint">
            {t("home.quickSwitcher.keyboardHint")}
          </div>
        </section>
      </div>
    </div>
  )
}

const PopupWithProvider = () => {
  return (
    <MotionConfig reducedMotion="user">
      <AppErrorBoundary>
        <WorkspaceDataProvider>
          <Popup />
        </WorkspaceDataProvider>
      </AppErrorBoundary>
    </MotionConfig>
  )
}

export default PopupWithProvider
