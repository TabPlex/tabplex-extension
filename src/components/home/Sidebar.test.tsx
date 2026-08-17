// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_SETTINGS, type Workspace } from "~core/types"

import { Sidebar } from "./Sidebar"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

vi.mock("~components/ui/AnimatedList", () => ({
  default: ({
    items,
    renderItem
  }: {
    items: Array<{ id: string }>
    renderItem: (item: { id: string }) => React.ReactNode
  }) => (
    <div>
      {items.map((item) => (
        <React.Fragment key={item.id}>{renderItem(item)}</React.Fragment>
      ))}
    </div>
  )
}))

vi.mock("~components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  )
}))

vi.mock("~components/ui/delete", () => ({
  DeleteIcon: () => <span aria-hidden="true" />
}))

vi.mock("~components/ui/search", () => ({
  SearchIcon: () => <span aria-hidden="true" />
}))

describe("Sidebar locked deletion", () => {
  afterEach(cleanup)

  it("keeps workspace deletion unavailable and exposes the reason", () => {
    const workspace: Workspace = {
      id: "workspace-1",
      name: "Research",
      createdAt: 1,
      tabs: []
    }
    const onDelete = vi.fn()

    render(
      <Sidebar
        query=""
        setQuery={vi.fn()}
        searchInputRef={{ current: null }}
        onSearchCreate={vi.fn()}
        filteredWorkspaces={[workspace]}
        showEmptyState={false}
        groupedWorkspaces={[
          {
            title: "home.sidebar.group.today",
            items: [workspace]
          }
        ]}
        searchMatchByWorkspaceId={new Map()}
        isCreatedSort={false}
        toggleSort={vi.fn()}
        selectedId={workspace.id}
        currentWorkspaceId={workspace.id}
        dropTargetId={null}
        settings={DEFAULT_SETTINGS}
        draggedTabIndexes={[]}
        interactionLocked
        onSwitch={vi.fn()}
        onPreview={vi.fn()}
        onSidebarLeave={vi.fn()}
        onDelete={onDelete}
        onWorkspaceDragOver={vi.fn()}
        onWorkspaceDragLeave={vi.fn()}
        onWorkspaceDrop={vi.fn()}
      />
    )

    const deleteButton = screen.getByRole("button", {
      name: "home.workspace.actions.moveToTrash"
    }) as HTMLButtonElement
    expect(deleteButton.disabled).toBe(true)

    deleteButton.focus()
    expect(document.activeElement).not.toBe(deleteButton)
    fireEvent.click(deleteButton)

    expect(onDelete).not.toHaveBeenCalled()
    const tooltipTrigger = screen.getByRole("group", {
      name: "home.workspace.deleteBlocked"
    })
    tooltipTrigger.focus()
    expect(document.activeElement).toBe(tooltipTrigger)
    expect(screen.getByText("home.workspace.deleteBlocked")).toBeTruthy()
  })
})
