import React, {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent
} from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~components/ui/button"
import { DeleteIcon } from "~components/ui/delete"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "~components/ui/dropdown-menu"
import { FileCheckIcon } from "~components/ui/file-check"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "~components/ui/tooltip"
import type { TabSpec } from "~core/types"
import { formatDate, formatRelativeTime } from "~core/utils"
import { describeUrl } from "~lib/common"
import { getTabDisplayTitle } from "~shared/logic"

export type TabLocateRequest = { id: number; url: string }
export type WorkspaceMoveTarget = { id: string; name: string }

export interface TabListProps {
  tabCount: number
  showEmptyState: boolean
  tabSelectionMode: boolean
  selectionCount: number
  selectedTabIndexes: number[]
  onToggleSelectionMode: (next?: boolean) => void
  listTabs: TabSpec[]
  draggedTabIndexes: number[]
  onRemoveTab: (tab: TabSpec, index: number) => void
  onTabDragStart: (event: DragEvent, index: number) => void
  onTabDragEnd: (event: DragEvent) => void
  onToggleTabIndex: (index: number, options?: { range?: boolean }) => void
  onOpenTab: (tab: TabSpec) => void
  workspaceMoveTargets?: WorkspaceMoveTarget[]
  onMoveSelectedTabsToWorkspace?: (targetWorkspaceId: string) => void
  isMovingSelectedTabs?: boolean
  locateRequest?: TabLocateRequest | null
  interactionLocked: boolean
}

const SelectedTabDestinationActions = ({
  selectionCount,
  workspaceMoveTargets,
  busy,
  onMoveToWorkspace
}: {
  selectionCount: number
  workspaceMoveTargets: WorkspaceMoveTarget[]
  busy: boolean
  onMoveToWorkspace?: (targetWorkspaceId: string) => void
}) => {
  const { t } = useTranslation()
  const moveLabel = t("home.tabs.selectionActions.moveToWorkspace")

  return (
    <div className="tab-destination-actions">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="tab-destination-trigger"
            aria-label={moveLabel}
            disabled={busy || !selectionCount || !workspaceMoveTargets.length}>
            <span>{moveLabel}</span>
            <span className="tab-destination-arrow" aria-hidden="true">
              →
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="tab-destination-menu">
          {workspaceMoveTargets.map((target) => (
            <DropdownMenuItem
              key={target.id}
              onClick={() => onMoveToWorkspace?.(target.id)}>
              {target.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export const TabList = memo(function TabList({
  tabCount,
  showEmptyState,
  tabSelectionMode,
  selectionCount,
  selectedTabIndexes,
  onToggleSelectionMode,
  listTabs,
  draggedTabIndexes,
  onRemoveTab,
  onTabDragStart,
  onTabDragEnd,
  onToggleTabIndex,
  onOpenTab,
  workspaceMoveTargets = [],
  onMoveSelectedTabsToWorkspace,
  isMovingSelectedTabs = false,
  locateRequest,
  interactionLocked
}: TabListProps) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLUListElement | null>(null)
  const [locatedTabIndex, setLocatedTabIndex] = useState<number | null>(null)
  const clearLocateTimerRef = useRef<number | null>(null)

  const selectedTabIndexSet = useMemo(
    () => new Set(selectedTabIndexes),
    [selectedTabIndexes]
  )
  const draggedTabIndexSet = useMemo(
    () => new Set(draggedTabIndexes),
    [draggedTabIndexes]
  )

  useEffect(() => {
    return () => {
      if (clearLocateTimerRef.current) {
        window.clearTimeout(clearLocateTimerRef.current)
        clearLocateTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!locateRequest?.url) return
    const targetUrl = locateRequest.url.trim()
    const targetIndex = listTabs.findIndex(
      (tab) => tab.url.trim() === targetUrl
    )
    if (targetIndex < 0) return

    const list = listRef.current
    if (!list) return

    const selector = `[data-tab-index="${targetIndex}"]`
    const element = list.querySelector<HTMLElement>(selector)
    if (!element) return

    setLocatedTabIndex(targetIndex)
    try {
      element.scrollIntoView({ behavior: "smooth", block: "center" })
    } catch {
      element.scrollIntoView()
    }

    if (clearLocateTimerRef.current) {
      window.clearTimeout(clearLocateTimerRef.current)
    }
    clearLocateTimerRef.current = window.setTimeout(() => {
      clearLocateTimerRef.current = null
      setLocatedTabIndex(null)
    }, 1600)
  }, [listTabs, locateRequest?.id, locateRequest?.url])

  const renderEditableTabItem = ({
    tab,
    index,
    key
  }: {
    tab: TabSpec
    index: number
    key: string
  }) => {
    const { host, display: linkText } = describeUrl(tab.url)
    const titleText = getTabDisplayTitle(tab, host || tab.url)
    const isChecked = tabSelectionMode && selectedTabIndexSet.has(index)
    const isDragging = draggedTabIndexSet.has(index)
    const canDrag = !interactionLocked && (!tabSelectionMode || isChecked)
    const itemClass = `tab-item${
      tabSelectionMode ? " is-selecting" : ""
    }${isChecked ? " is-selected" : ""}${isDragging ? " is-dragging" : ""}${
      locatedTabIndex === index ? " is-located" : ""
    }`
    const wrapperClass = `tab-item-wrapper${
      tabSelectionMode ? " is-selecting" : ""
    }${isDragging ? " is-dragging" : ""}${
      interactionLocked ? " is-readonly" : ""
    }`
    const activateTabItem = (range: boolean) => {
      if (tabSelectionMode) {
        onToggleTabIndex(index, { range })
        return
      }
      void onOpenTab(tab)
    }

    return (
      <li key={key} className={wrapperClass}>
        <div className="tab-delete-zone">
          <button
            type="button"
            className="tab-delete"
            disabled={interactionLocked}
            aria-label={t("home.tabs.removeTabAria", {
              title: titleText
            })}
            title={t(
              interactionLocked
                ? "home.workspace.actionBlocked"
                : "home.tabs.removeTab"
            )}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void onRemoveTab(tab, index)
            }}>
            <DeleteIcon />
          </button>
        </div>
        <div
          className={itemClass}
          data-tab-index={index}
          role="button"
          tabIndex={0}
          aria-pressed={tabSelectionMode ? isChecked : undefined}
          draggable={canDrag}
          onDragStart={(event) => onTabDragStart(event, index)}
          onDragEnd={onTabDragEnd}
          onClick={(event) => {
            if (event.detail > 0) event.currentTarget.blur()
            if (tabSelectionMode) {
              event.preventDefault()
              event.stopPropagation()
              activateTabItem(event.shiftKey)
              return
            }
            activateTabItem(event.shiftKey)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              activateTabItem(event.shiftKey)
            }
            if (event.key === " ") event.preventDefault()
          }}
          onKeyUp={(event) => {
            if (event.key !== " ") return
            event.preventDefault()
            activateTabItem(event.shiftKey)
          }}>
          <div className="tab-inner">
            <div className="tab-main">
              {tab.faviconUrl ? (
                <img
                  className="tab-icon"
                  src={tab.faviconUrl}
                  alt=""
                  width={24}
                  height={24}
                  onError={(e) => {
                    e.currentTarget.style.display = "none"
                  }}
                />
              ) : (
                <span className="tab-icon fallback" aria-hidden="true">
                  {host.slice(0, 1).toUpperCase() || "·"}
                </span>
              )}
              <div className="tab-text">
                <div className="tab-title" title={titleText}>
                  {titleText}
                </div>
                <div className="tab-meta">
                  <span className="tab-link" title={linkText}>
                    {linkText}
                  </span>
                  {tab.lastAccessedAt ? (
                    <span
                      className="tab-time"
                      title={t("home.tabs.lastAccessed", {
                        time: formatDate(tab.lastAccessedAt)
                      })}>
                      {t("home.tabs.lastAccessed", {
                        time: formatRelativeTime(tab.lastAccessedAt)
                      })}
                    </span>
                  ) : null}
                  {tab.pinned ? (
                    <span className="tab-badge">{t("common.pinned")}</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </li>
    )
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="workspace-card tab-card">
        <div className="card-header">
          <div className="card-title-group">
            <h2 className="card-title">{t("home.tabs.title")}</h2>
            <span className="card-count">
              {t("common.pageCount", { count: tabCount })}
            </span>
          </div>
          <div
            className={`tab-toolbar${tabSelectionMode ? " is-selection" : ""}`}>
            <div
              className={
                tabSelectionMode
                  ? "tab-selection-actions"
                  : "flex items-center gap-2"
              }>
              {tabSelectionMode ? (
                <span className="tab-selection-count">
                  {t("home.tabs.selectionCount", { count: selectionCount })}
                </span>
              ) : null}
              {tabSelectionMode ? (
                <SelectedTabDestinationActions
                  selectionCount={selectionCount}
                  workspaceMoveTargets={workspaceMoveTargets}
                  busy={isMovingSelectedTabs || interactionLocked}
                  onMoveToWorkspace={onMoveSelectedTabsToWorkspace}
                />
              ) : null}
              {tabSelectionMode ? (
                <span className="tab-selection-divider" aria-hidden="true" />
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className={`tab-icon-button${
                      tabSelectionMode ? " tab-selection-exit is-active" : ""
                    }`}
                    aria-pressed={tabSelectionMode}
                    aria-label={
                      tabSelectionMode
                        ? t("home.tabs.toggleExit")
                        : t("home.tabs.toggleSelect")
                    }
                    onClick={() => {
                      onToggleSelectionMode(!tabSelectionMode)
                    }}
                    type="button">
                    <FileCheckIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {tabSelectionMode
                    ? t("home.tabs.toggleExit")
                    : t("home.tabs.toggleSelect")}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
        {listTabs.length ? (
          <ul className="tab-list" ref={listRef}>
            {listTabs.map((tab, index) =>
              renderEditableTabItem({
                key: `${tab.url || "tab"}-${index}`,
                tab,
                index
              })
            )}
          </ul>
        ) : showEmptyState ? (
          <div className="card-empty">{t("home.tabs.empty")}</div>
        ) : null}
      </div>
    </TooltipProvider>
  )
})
