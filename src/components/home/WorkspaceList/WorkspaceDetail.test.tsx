// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import React, { createRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { WorkspaceDetail } from "./WorkspaceDetail"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

vi.mock("~components/home/NotePanel", () => ({
  NotePanel: () => null
}))

vi.mock("~components/home/TabList", () => ({
  TabList: () => null
}))

vi.mock("~components/WorkspaceIconPicker", () => ({
  WorkspaceIconPicker: () => null
}))

vi.mock("~components/ui/history", () => ({
  HistoryIcon: () => <span aria-hidden="true" />
}))

vi.mock("~components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null
}))

describe("WorkspaceDetail name focus", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("focuses and selects the generated name for a newly created workspace", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0)
      return 1
    })
    const onNameInputFocused = vi.fn()

    const renderDetail = (nameDraft: string) => (
      <WorkspaceDetail
        selectedTag={{
          id: "workspace-new",
          name: "工作区 2",
          createdAt: 2,
          tabs: []
        }}
        accentColor="#6C5CE7"
        tabCount={0}
        nameDraft={nameDraft}
        setNameDraft={vi.fn()}
        onRename={vi.fn()}
        onEmojiSelect={vi.fn()}
        onColorSelect={vi.fn()}
        canOpenTimeline={false}
        onOpenTimeline={vi.fn()}
        interactionLocked={false}
        focusNameInput
        onNameInputFocused={onNameInputFocused}
        workspaceGridRef={createRef<HTMLDivElement>()}
        notePanelWidth={360}
        notePanelMaxWidth={480}
        setNotePanelWidth={vi.fn()}
        showTabEmpty
        tabSelectionMode={false}
        selectionCount={0}
        selectedTabIndexes={[]}
        onToggleSelectionMode={vi.fn()}
        listTabs={[]}
        draggedTabIndexes={[]}
        onRemoveTab={vi.fn()}
        onTabDragStart={vi.fn()}
        onTabDragEnd={vi.fn()}
        onToggleTabIndex={vi.fn()}
        onOpenTab={vi.fn()}
        workspaceMoveTargets={[]}
        onMoveSelectedTabsToWorkspace={vi.fn()}
        isMovingTabsToWorkspace={false}
        noteCardRef={createRef<HTMLElement>()}
        noteDraft=""
        onNoteChange={vi.fn()}
        onNoteResizeStart={vi.fn()}
      />
    )

    const { rerender } = render(renderDetail("旧工作区"))

    const input = screen.getByRole("textbox", {
      name: "home.workspace.nameLabel"
    }) as HTMLInputElement
    expect(document.activeElement).not.toBe(input)
    expect(onNameInputFocused).not.toHaveBeenCalled()

    rerender(renderDetail("工作区 2"))

    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
    expect(onNameInputFocused).toHaveBeenCalledTimes(1)
  })
})
