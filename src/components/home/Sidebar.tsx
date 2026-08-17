import React, {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react"
import { useTranslation } from "react-i18next"

import AnimatedList from "~components/ui/AnimatedList"
import { DeleteIcon } from "~components/ui/delete"
import { Input } from "~components/ui/input"
import { SearchIcon } from "~components/ui/search"
import type { Settings, Workspace } from "~core/types"
import { DEFAULT_SETTINGS } from "~core/types"
import { formatDate, formatRelativeTime } from "~core/utils"
import { resolveWorkspaceColor } from "~core/utils/colors"
import type { WorkspaceSearchMatch } from "~features/home/logic/workspaceSearch"
import { createLongHoverController } from "~features/home/longHover"
import { cn } from "~lib/utils"

import { LockedDeleteTooltip } from "./LockedDeleteTooltip"
import { isSidebarDeleteReady } from "./sidebarDeleteState"
import { SIDEBAR_LONG_HOVER_MS } from "./sidebarHoverConfig"

type SidebarGroup = {
  title: string
  items: Workspace[]
}

type SidebarListItem =
  | { type: "group"; id: string; title: string; isFirst: boolean }
  | { type: "workspace"; id: string; workspace: Workspace }

interface SidebarProps {
  query: string
  setQuery: (q: string) => void
  searchInputRef: RefObject<HTMLInputElement>
  onSearchCreate: (name: string) => void
  filteredWorkspaces: Workspace[]
  showEmptyState: boolean
  groupedWorkspaces: SidebarGroup[]
  searchMatchByWorkspaceId: Map<string, WorkspaceSearchMatch>
  isCreatedSort: boolean
  toggleSort: () => void
  selectedId: string | null
  currentWorkspaceId: string | null
  dropTargetId: string | null
  settings: Settings
  draggedTabIndexes: number[]
  interactionLocked: boolean
  onSwitch: (tag: Workspace) => void
  onPreview: (tag: Workspace) => void
  onSidebarLeave: () => void
  onDelete: (tag: Workspace) => void
  onWorkspaceDragOver: (e: React.DragEvent, id: string) => void
  onWorkspaceDragLeave: (e: React.DragEvent, id: string) => void
  onWorkspaceDrop: (e: React.DragEvent, id: string) => void
}

export const Sidebar = memo(function Sidebar({
  query,
  setQuery,
  searchInputRef,
  onSearchCreate,
  filteredWorkspaces,
  showEmptyState,
  groupedWorkspaces,
  searchMatchByWorkspaceId,
  isCreatedSort,
  toggleSort,
  selectedId,
  currentWorkspaceId,
  dropTargetId,
  settings,
  draggedTabIndexes,
  interactionLocked,
  onSwitch,
  onPreview,
  onSidebarLeave,
  onDelete,
  onWorkspaceDragOver,
  onWorkspaceDragLeave,
  onWorkspaceDrop
}: SidebarProps) {
  const { t } = useTranslation()
  const [hoverDeleteId, setHoverDeleteId] = useState<string | null>(null)
  const longHoverRef = useRef<ReturnType<
    typeof createLongHoverController
  > | null>(null)
  const isDragging = draggedTabIndexes.length > 0

  if (!longHoverRef.current) {
    longHoverRef.current = createLongHoverController({
      delayMs: SIDEBAR_LONG_HOVER_MS
    })
  }

  useEffect(() => {
    if (isDragging || interactionLocked) {
      setHoverDeleteId(null)
      longHoverRef.current?.leave()
    }
  }, [interactionLocked, isDragging])

  useEffect(() => {
    return () => {
      longHoverRef.current?.dispose()
      longHoverRef.current = null
    }
  }, [])
  const currentSortLabel = isCreatedSort
    ? t("home.sidebar.sort.created")
    : t("home.sidebar.sort.lastUsed")
  const defaultWorkspaceColor =
    settings?.accentColor ?? DEFAULT_SETTINGS.accentColor ?? "#6C5CE7"
  const listItems = useMemo<SidebarListItem[]>(() => {
    return groupedWorkspaces.flatMap((group, index) => [
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
  }, [groupedWorkspaces])

  const handleItemEnter = (tag: Workspace) => {
    if (isDragging || interactionLocked) return
    if (hoverDeleteId && hoverDeleteId !== tag.id) {
      setHoverDeleteId(null)
    }
    longHoverRef.current?.enter(() => setHoverDeleteId(tag.id))
    onPreview(tag)
  }

  const handleItemLeave = (tagId: string) => {
    longHoverRef.current?.leave()
    if (hoverDeleteId === tagId) {
      setHoverDeleteId(null)
    }
  }

  return (
    <aside className="home-sidebar" onMouseLeave={onSidebarLeave}>
      <div className="sidebar-toolbar">
        <div className="sidebar-search">
          <SearchIcon className="sidebar-search-icon" aria-hidden="true" />
          <Input
            className="home-input pl-9 border-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:ring-0 focus:outline-none"
            placeholder={t("home.sidebar.searchPlaceholder")}
            aria-label={t("home.sidebar.searchPlaceholder")}
            name="workspace-search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              const native: any = e.nativeEvent as any
              if (native?.isComposing || native?.keyCode === 229) {
                e.preventDefault()
                e.stopPropagation()
                return
              }
              const trimmed = query.trim()
              if (!trimmed) {
                e.preventDefault()
                return
              }
              e.preventDefault()
              const firstMatch = filteredWorkspaces[0]
              if (firstMatch) {
                if (!interactionLocked) onPreview(firstMatch)
                if (firstMatch.id !== currentWorkspaceId) {
                  onSwitch(firstMatch)
                }
                return
              }
              onSearchCreate(trimmed)
            }}
            ref={searchInputRef}
          />
        </div>
      </div>
      {filteredWorkspaces.length === 0 ? (
        showEmptyState ? (
          <div className="home-empty">{t("home.sidebar.emptyMatch")}</div>
        ) : null
      ) : (
        <AnimatedList
          items={listItems}
          getItemKey={(item) => item.id}
          listClassName="sidebar-scroll sidebar-list"
          itemClassName="animated-list-item"
          renderItem={(item) => {
            if (item.type === "group") {
              return (
                <div className="sidebar-group-title">
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
            const isActive = tag.id === selectedId
            const isCurrent = tag.id === currentWorkspaceId
            const isDropTarget = dropTargetId === tag.id
            const badgeColor = resolveWorkspaceColor(
              tag.color,
              defaultWorkspaceColor
            )
            const visibleCount = (tag.tabs ?? []).reduce(
              (sum, tab) => (tab.pinned ? sum : sum + 1),
              0
            )
            const isDeleteReady = isSidebarDeleteReady({
              hoverDeleteId,
              workspaceId: tag.id,
              isDragging
            })
            const wrapperClass = cn(
              "sidebar-item-wrapper",
              isDeleteReady && "is-delete-ready",
              isDragging && "is-dragging",
              interactionLocked && "is-locked"
            )
            const itemClass = cn(
              "sidebar-item",
              isActive && "is-active",
              isDropTarget && "is-drop-target"
            )
            const badgeClass = cn(
              "sidebar-color",
              badgeColor === "transparent" && "is-transparent"
            )
            const searchMatch = searchMatchByWorkspaceId.get(tag.id)
            return (
              <div
                className={wrapperClass}
                title={t("home.sidebar.clickSwitch")}
                onMouseEnter={() => handleItemEnter(tag)}
                onMouseLeave={() => handleItemLeave(tag.id)}
                onDragOver={(event) => onWorkspaceDragOver(event, tag.id)}
                onDragEnter={(event) => onWorkspaceDragOver(event, tag.id)}
                onDragLeave={(event) => onWorkspaceDragLeave(event, tag.id)}
                onDrop={(event) => onWorkspaceDrop(event, tag.id)}>
                <div className="sidebar-delete-zone">
                  <LockedDeleteTooltip
                    locked={interactionLocked}
                    message={t("home.workspace.deleteBlocked")}>
                    <button
                      type="button"
                      className="sidebar-delete"
                      aria-label={t("home.workspace.actions.moveToTrash")}
                      disabled={interactionLocked}
                      title={
                        interactionLocked
                          ? undefined
                          : t("home.workspace.actions.moveToTrash")
                      }
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        if (interactionLocked) return
                        setHoverDeleteId(null)
                        onDelete(tag)
                      }}>
                      <DeleteIcon />
                    </button>
                  </LockedDeleteTooltip>
                </div>
                <button
                  type="button"
                  className={itemClass}
                  tabIndex={isDragging ? -1 : undefined}
                  onClick={(event) => {
                    if (isDragging) {
                      event.preventDefault()
                      return
                    }
                    if (tag.id !== currentWorkspaceId) {
                      onSwitch(tag)
                    }
                  }}>
                  <div className="sidebar-inner">
                    <span
                      className={badgeClass}
                      style={{ backgroundColor: badgeColor }}
                      aria-hidden="true">
                      {tag.emoji ? tag.emoji : null}
                    </span>
                    <div className="sidebar-meta">
                      <div
                        className="sidebar-name"
                        title={tag.name || t("common.unnamedWorkspace")}>
                        <span className="sidebar-name-text">
                          {tag.name || t("common.unnamedWorkspace")}
                        </span>
                        {isCurrent ? (
                          <span className="sidebar-pill">
                            {t("common.current")}
                          </span>
                        ) : null}
                      </div>
                      <div className="sidebar-info">
                        <span>
                          {t("common.pageCount", {
                            count: visibleCount
                          })}
                        </span>
                        {tag.lastUsedAt ? (
                          <span
                            className="sidebar-time"
                            title={t("common.lastUsed", {
                              time: formatDate(tag.lastUsedAt)
                            })}>
                            {t("common.lastUsed", {
                              time: formatRelativeTime(tag.lastUsedAt)
                            })}
                          </span>
                        ) : null}
                        {query.trim() && searchMatch ? (
                          <span
                            aria-hidden="true"
                            className="sidebar-info-separator">
                            ·
                          </span>
                        ) : null}
                        {query.trim() && searchMatch ? (
                          <span
                            className="sidebar-search-match"
                            title={searchMatch.label}>
                            <span>
                              {t(`home.sidebar.match.${searchMatch.kind}`)}
                            </span>
                            <span className="truncate">
                              {searchMatch.label}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            )
          }}
        />
      )}
    </aside>
  )
})
