import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject
} from "react"
import { useTranslation } from "react-i18next"

import { NotePanel } from "~components/home/NotePanel"
import {
  TabList,
  type TabLocateRequest,
  type WorkspaceMoveTarget
} from "~components/home/TabList"
import { Button } from "~components/ui/button"
import { HistoryIcon } from "~components/ui/history"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "~components/ui/tooltip"
import { WorkspaceIconPicker } from "~components/WorkspaceIconPicker"
import { DEFAULT_ACCENT_COLOR, type TabSpec, type Workspace } from "~core/types"
import { formatDate, formatRelativeTime } from "~core/utils"
import { resolveWorkspaceColor } from "~core/utils/colors"
import { cn } from "~lib/utils"

import { blurIfWorkspaceNameInputActive } from "./workspaceNameLeave"

interface WorkspaceDetailProps {
  selectedTag: Workspace
  accentColor: string
  tabCount: number
  nameDraft: string
  setNameDraft: (val: string) => void
  onRename: () => void
  onEmojiSelect: (emoji: string | null) => void
  onColorSelect: (color: string | null) => void
  canOpenTimeline: boolean
  onOpenTimeline: () => void
  latestTimelineDate?: number
  interactionLocked: boolean
  focusNameInput?: boolean
  onNameInputFocused?: () => void

  workspaceGridRef: RefObject<HTMLDivElement>
  notePanelWidth: number
  notePanelMaxWidth: number
  setNotePanelWidth: (width: number) => void

  // TabList props
  showTabEmpty: boolean
  tabSelectionMode: boolean
  selectionCount: number
  selectedTabIndexes: number[]
  onToggleSelectionMode: (next?: boolean) => void
  listTabs: TabSpec[]
  draggedTabIndexes: number[]
  onRemoveTab: (tab: TabSpec, index: number) => void
  onTabDragStart: (e: any, index: number) => void
  onTabDragEnd: () => void
  onToggleTabIndex: (index: number, opts?: any) => void
  onOpenTab: (tab: TabSpec) => void
  workspaceMoveTargets: WorkspaceMoveTarget[]
  onMoveSelectedTabsToWorkspace: (targetWorkspaceId: string) => void
  isMovingTabsToWorkspace: boolean

  noteCardRef: RefObject<HTMLElement>
  noteDraft: string
  onNoteChange: (val: string) => void
  onNoteResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void
  onDetailEnter?: () => void
  onDetailLeave?: () => void
}

export const WorkspaceDetail = ({
  selectedTag,
  accentColor,
  tabCount,
  nameDraft,
  setNameDraft,
  onRename,
  onEmojiSelect,
  onColorSelect,
  canOpenTimeline,
  onOpenTimeline,
  latestTimelineDate,
  interactionLocked,
  focusNameInput = false,
  onNameInputFocused,
  workspaceGridRef,
  notePanelWidth,
  notePanelMaxWidth,
  setNotePanelWidth,
  showTabEmpty,
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
  workspaceMoveTargets,
  onMoveSelectedTabsToWorkspace,
  isMovingTabsToWorkspace,
  noteCardRef,
  noteDraft,
  onNoteChange,
  onNoteResizeStart,
  onDetailEnter,
  onDetailLeave
}: WorkspaceDetailProps) => {
  const { t } = useTranslation()
  const defaultWorkspaceColor = DEFAULT_ACCENT_COLOR
  const [locateRequest, setLocateRequest] = useState<TabLocateRequest | null>(
    null
  )
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focusNameInput || nameDraft !== (selectedTag.name ?? "")) return
    const frame = window.requestAnimationFrame(() => {
      const input = nameInputRef.current
      if (!input) return
      input.focus()
      input.select()
      onNameInputFocused?.()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [
    focusNameInput,
    nameDraft,
    onNameInputFocused,
    selectedTag.id,
    selectedTag.name
  ])

  const handleNoteLinkClick = useCallback((url: string) => {
    setLocateRequest({ id: Date.now(), url })
  }, [])

  const handlePanelMouseLeave = useCallback(() => {
    const activeElement = globalThis.document?.activeElement ?? null
    blurIfWorkspaceNameInputActive({
      activeElement,
      nameInput: nameInputRef.current
    })
    onDetailLeave?.()
  }, [onDetailLeave])

  const selectedWorkspaceColor = resolveWorkspaceColor(
    selectedTag?.color,
    defaultWorkspaceColor
  )
  const selectedWorkspaceColorClass = cn(
    "workspace-color",
    selectedWorkspaceColor === "transparent" && "is-transparent"
  )
  const headerMetaItems = [
    {
      key: "pageCount",
      title: t("common.pageCount", { count: tabCount }),
      label: t("common.pageCount", { count: tabCount })
    },
    selectedTag?.createdAt
      ? {
          key: "createdAt",
          title: t("common.createdAt", {
            time: formatDate(selectedTag.createdAt)
          }),
          label: t("common.createdAt", {
            time: formatRelativeTime(selectedTag.createdAt)
          })
        }
      : null,
    selectedTag?.lastUsedAt
      ? {
          key: "lastUsedAt",
          title: t("common.lastUsed", {
            time: formatDate(selectedTag.lastUsedAt)
          }),
          label: t("common.lastUsed", {
            time: formatRelativeTime(selectedTag.lastUsedAt)
          })
        }
      : null
  ].filter(
    (
      item
    ): item is {
      key: string
      title: string
      label: string
    } => item !== null
  )

  return (
    <div
      className="workspace-panel"
      onMouseEnter={onDetailEnter}
      onMouseLeave={handlePanelMouseLeave}>
      <div className="workspace-header">
        <div className="workspace-header-main">
          <WorkspaceIconPicker
            value={selectedTag.emoji}
            onChange={onEmojiSelect}
            color={selectedTag.color}
            onColorChange={onColorSelect}
            accentColor={accentColor}
            align="start"
            className={cn("h-10 w-10 text-lg", selectedWorkspaceColorClass)}
          />
          <div className="workspace-title-stack">
            <input
              type="text"
              ref={nameInputRef}
              aria-label={t("home.workspace.nameLabel", {
                name: selectedTag.name
              })}
              className="workspace-name-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => void onRename()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const native: any = e.nativeEvent as any
                  if (native?.isComposing || native?.keyCode === 229) {
                    e.preventDefault()
                    e.stopPropagation()
                    return
                  }
                  e.preventDefault()
                  void onRename()
                }
              }}
            />
            {headerMetaItems.length ? (
              <div className="workspace-header-meta">
                {headerMetaItems.map((item, index) => (
                  <React.Fragment key={item.key}>
                    {index > 0 ? (
                      <span
                        aria-hidden="true"
                        className="workspace-header-meta-separator">
                        ·
                      </span>
                    ) : null}
                    <span
                      className="workspace-header-meta-item"
                      title={item.title}>
                      {item.label}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="workspace-header-actions">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    className="workspace-icon-button"
                    onClick={onOpenTimeline}
                    disabled={!canOpenTimeline}
                    aria-label={t("home.workspace.actions.timeline")}
                    type="button">
                    <HistoryIcon />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {canOpenTimeline
                  ? t("home.workspace.actions.timelineTooltip", {
                      time: formatRelativeTime(latestTimelineDate),
                      date: formatDate(latestTimelineDate)
                    })
                  : t("home.workspace.actions.noHistory")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div
        className="workspace-grid"
        ref={workspaceGridRef}
        style={
          {
            "--note-panel-width": `${notePanelWidth}px`
          } as CSSProperties
        }>
        <TabList
          tabCount={tabCount}
          showEmptyState={showTabEmpty}
          tabSelectionMode={tabSelectionMode}
          selectionCount={selectionCount}
          selectedTabIndexes={selectedTabIndexes}
          onToggleSelectionMode={onToggleSelectionMode}
          listTabs={listTabs}
          draggedTabIndexes={draggedTabIndexes}
          onRemoveTab={onRemoveTab}
          onTabDragStart={onTabDragStart}
          onTabDragEnd={onTabDragEnd}
          onToggleTabIndex={onToggleTabIndex}
          onOpenTab={onOpenTab}
          workspaceMoveTargets={workspaceMoveTargets}
          onMoveSelectedTabsToWorkspace={onMoveSelectedTabsToWorkspace}
          isMovingSelectedTabs={isMovingTabsToWorkspace}
          locateRequest={locateRequest}
          interactionLocked={interactionLocked}
        />
        <NotePanel
          notePanelWidth={notePanelWidth}
          notePanelMaxWidth={notePanelMaxWidth}
          setNotePanelWidth={setNotePanelWidth}
          noteCardRef={noteCardRef}
          selectedId={selectedTag.id}
          noteDraft={noteDraft}
          onNoteChange={onNoteChange}
          onNoteResizeStart={onNoteResizeStart}
          mentionTabs={listTabs}
          onLinkClick={handleNoteLinkClick}
        />
      </div>
    </div>
  )
}
