import { useCallback, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { CreateWorkspaceInlineAction } from "~components/home/Header/CreateWorkspaceInlineAction"
import { Header } from "~components/home/Header/Header"
import { OnboardingCard } from "~components/home/OnboardingCard"
import { CommandPalette } from "~components/home/Overlays/CommandPalette"
import { TimelinePanel } from "~components/home/Overlays/TimelinePanel"
import { TrashPanel } from "~components/home/Overlays/TrashPanel"
import { Sidebar } from "~components/home/Sidebar"
import { WorkspaceDetail } from "~components/home/WorkspaceList/WorkspaceDetail"
import { AppToaster } from "~components/ui/app-toaster"
import { DEFAULT_ACCENT_COLOR } from "~core/types"
import { useAppShortcuts } from "~features/home/useAppShortcuts"
import { useHomeViewModel } from "~features/home/useHomeViewModel"
import { useNotePanel } from "~features/home/useNotePanel"
import { useTheme } from "~features/home/useTheme"
import { SettingsDialog } from "~features/settings/components/SettingsDialog"
import { canOpenWorkspaceTimeline } from "~shared/logic"

import "~styles/home.css"

const HomeView = () => {
  const { t } = useTranslation()
  const vm = useHomeViewModel()
  const { viewState, actions, dnd, data } = vm

  useAppShortcuts(vm)
  useTheme(data.workspaceManager.settings)
  const notePanel = useNotePanel()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [focusWorkspaceNameId, setFocusWorkspaceNameId] = useState<
    string | null
  >(null)

  const localStorageBytes = data.localStorageBytes ?? 0

  const filteredWorkspaces = viewState.filteredWorkspaces || []
  const workspaceMoveTargets = useMemo(
    () =>
      data.workspaceManager.sortedWorkspaces
        .filter((workspace) => workspace.id !== viewState.selectedWorkspace?.id)
        .map((workspace) => ({
          id: workspace.id,
          name: workspace.name || t("common.unnamedWorkspace")
        })),
    [data.workspaceManager.sortedWorkspaces, t, viewState.selectedWorkspace?.id]
  )
  const trashedWorkspaces = data.workspaceManager.trashedWorkspaces || []
  const filteredTrash = useMemo(() => {
    const q = viewState.trashQuery.trim().toLowerCase()
    if (!q) return trashedWorkspaces
    return trashedWorkspaces.filter((tag) =>
      (tag.name || "").toLowerCase().includes(q)
    )
  }, [trashedWorkspaces, viewState.trashQuery])
  const totalTrashTabs = useMemo(
    () => trashedWorkspaces.reduce((sum, w) => sum + (w.tabs?.length || 0), 0),
    [trashedWorkspaces]
  )
  const showSidebarEmpty = !data.workspaceManager.hydrated
    ? false
    : filteredWorkspaces.length === 0
  const showTabEmpty = !data.workspaceManager.hydrated
    ? false
    : !!viewState.selectedWorkspace && viewState.visibleTabs.length === 0

  const {
    draggedTabIndexes,
    dropTargetId,
    isMovingTabs,
    tabSelectionMode,
    selectedTabIndexes
  } = dnd.state

  const {
    handleTabDragStart,
    handleTabDragEnd,
    handleWorkspaceDragOver,
    handleWorkspaceDragLeave,
    handleWorkspaceDrop,
    handleToggleSelectionMode,
    handleToggleTabIndex,
    handleMoveSelectedTabsToWorkspace
  } = dnd.actions

  const handleCreateEmptyWorkspace = useCallback(async () => {
    const result = await actions.createEmptyWorkspace()
    if (result?.activation.status === "activated") {
      setFocusWorkspaceNameId(result.workspace.id)
    }
  }, [actions])

  const handleWorkspaceNameFocused = useCallback(() => {
    setFocusWorkspaceNameId(null)
  }, [])

  const createWorkspaceAction = (
    <CreateWorkspaceInlineAction
      onCreate={handleCreateEmptyWorkspace}
      disabled={viewState.interactionLocked}
      busy={viewState.createPending}
    />
  )

  return (
    <>
      <AppToaster />
      <div className="home-root">
        <a className="home-skip-link" href="#home-main-content">
          {t("common.skipToContent")}
        </a>

        <Header
          createAction={createWorkspaceAction}
          onShowSettings={() => actions.setShowSettings(true)}
          notice={viewState.notice}
        />

        {viewState.onboarding?.status === "ready" &&
        !viewState.onboarding?.dismissed &&
        (viewState.onboarding.autoWorkspaceId ||
          viewState.onboarding.guideWorkspaceId) ? (
          <OnboardingCard
            guideWorkspaceId={viewState.onboarding.guideWorkspaceId}
            onOpenGuide={actions.handleOpenGuideWorkspace}
            onDismiss={actions.dismissOnboarding}
          />
        ) : null}

        <div className="home-body">
          <Sidebar
            query={viewState.query}
            setQuery={actions.setQuery}
            searchInputRef={searchInputRef}
            onSearchCreate={(name) => {
              void actions.quickCreate(name, false)
            }}
            filteredWorkspaces={filteredWorkspaces}
            showEmptyState={showSidebarEmpty}
            groupedWorkspaces={viewState.groupedWorkspaces}
            searchMatchByWorkspaceId={viewState.searchMatchByWorkspaceId}
            isCreatedSort={
              data.workspaceManager.settings?.workspaceSort === "created"
            }
            toggleSort={() => {
              const current = data.workspaceManager.settings?.workspaceSort
              actions.updateSetting(
                "workspaceSort",
                current === "created" ? "lastUsed" : "created"
              )
            }}
            selectedId={viewState.selectedId}
            currentWorkspaceId={
              data.workspaceManager.workspaceState.activeWorkspaceId ?? null
            }
            dropTargetId={dropTargetId}
            settings={data.workspaceManager.settings}
            draggedTabIndexes={draggedTabIndexes}
            interactionLocked={viewState.interactionLocked}
            onSwitch={actions.handleSwitch}
            onPreview={actions.handlePreview}
            onSidebarLeave={actions.handleSidebarLeave}
            onDelete={actions.handleDelete}
            onWorkspaceDragOver={handleWorkspaceDragOver}
            onWorkspaceDragLeave={handleWorkspaceDragLeave}
            onWorkspaceDrop={handleWorkspaceDrop}
          />

          <main id="home-main-content" className="home-content" tabIndex={-1}>
            {!viewState.selectedWorkspace ? (
              <div className="content-empty">
                {t("home.workspace.emptyState")}
              </div>
            ) : (
              <WorkspaceDetail
                selectedTag={viewState.selectedWorkspace}
                accentColor={
                  data.workspaceManager.settings?.accentColor ??
                  DEFAULT_ACCENT_COLOR
                }
                nameDraft={viewState.nameDraft}
                setNameDraft={actions.setNameDraft}
                onRename={actions.handleRename}
                onEmojiSelect={actions.handleEmojiSelect}
                onColorSelect={actions.handleColorSelect}
                canOpenTimeline={canOpenWorkspaceTimeline(
                  viewState.selectedWorkspace
                )}
                onOpenTimeline={() => actions.setShowTimeline(true)}
                latestTimelineDate={
                  viewState.selectedWorkspace.history?.[0]?.createdAt
                }
                interactionLocked={viewState.interactionLocked}
                focusNameInput={
                  focusWorkspaceNameId === viewState.selectedWorkspace.id
                }
                onNameInputFocused={handleWorkspaceNameFocused}
                workspaceGridRef={notePanel.workspaceGridRef}
                notePanelWidth={notePanel.notePanelWidth}
                notePanelMaxWidth={notePanel.notePanelMaxWidth}
                setNotePanelWidth={notePanel.setNotePanelWidth}
                tabCount={viewState.visibleTabs.length}
                showTabEmpty={showTabEmpty}
                tabSelectionMode={tabSelectionMode}
                selectionCount={selectedTabIndexes?.length ?? 0}
                selectedTabIndexes={selectedTabIndexes}
                onToggleSelectionMode={handleToggleSelectionMode}
                listTabs={viewState.visibleTabs || []}
                draggedTabIndexes={draggedTabIndexes}
                onRemoveTab={actions.handleRemoveTab}
                onTabDragStart={handleTabDragStart}
                onTabDragEnd={handleTabDragEnd}
                onToggleTabIndex={handleToggleTabIndex}
                onOpenTab={actions.handleOpenTab}
                workspaceMoveTargets={workspaceMoveTargets}
                onMoveSelectedTabsToWorkspace={
                  handleMoveSelectedTabsToWorkspace
                }
                onDetailEnter={actions.handleDetailEnter}
                onDetailLeave={actions.handleDetailLeave}
                noteCardRef={notePanel.noteCardRef}
                noteDraft={viewState.noteDraft}
                onNoteChange={actions.handleNoteChange}
                onNoteResizeStart={notePanel.handleNoteResizeStart}
                isMovingTabsToWorkspace={isMovingTabs}
              />
            )}
          </main>
        </div>

        <SettingsDialog
          open={viewState.showSettings}
          onOpenChange={actions.setShowSettings}
          localStorageBytes={localStorageBytes}
          flushPendingNotes={actions.flushPendingNotes}
        />

        <CommandPalette
          open={viewState.showCommandPalette}
          onOpenChange={actions.setShowCommandPalette}
          workspaces={filteredWorkspaces}
          currentWorkspaceId={
            data.workspaceManager.workspaceState.activeWorkspaceId ?? null
          }
          onSwitch={actions.handleSwitch}
          onCreate={(name) => {
            void actions.quickCreate(name, false)
            actions.setShowCommandPalette(false)
          }}
        />

        <TimelinePanel
          open={viewState.showTimeline}
          onOpenChange={actions.setShowTimeline}
          selectedWorkspace={viewState.selectedWorkspace}
          onRestoreApplied={actions.showTimelineRestoreNotice}
        />

        <TrashPanel
          open={viewState.showTrash}
          onOpenChange={actions.setShowTrash}
          trashCount={trashedWorkspaces.length}
          totalTrashTabs={totalTrashTabs}
          query={viewState.trashQuery}
          onQueryChange={actions.setTrashQuery}
          filteredTrash={filteredTrash}
          onEmptyTrash={data.workspaceManager.emptyTrash}
          onRestore={data.workspaceManager.restoreWorkspace}
          onDeleteForever={data.workspaceManager.permanentlyDeleteWorkspace}
        />
      </div>
    </>
  )
}

export default HomeView
