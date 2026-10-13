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

const renderSearchSidebar = (
  query: string,
  workspaces: Workspace[],
  interactionLocked = false
) => {
  const onSearchCreate = vi.fn()
  const onSwitch = vi.fn()
  render(
    <Sidebar
      query={query}
      setQuery={vi.fn()}
      searchInputRef={{ current: null }}
      onSearchCreate={onSearchCreate}
      filteredWorkspaces={workspaces}
      showEmptyState={false}
      groupedWorkspaces={[
        { title: "home.sidebar.group.results", items: workspaces }
      ]}
      searchMatchByWorkspaceId={new Map()}
      isCreatedSort={false}
      toggleSort={vi.fn()}
      selectedId={null}
      currentWorkspaceId={null}
      dropTargetId={null}
      settings={DEFAULT_SETTINGS}
      draggedTabIndexes={[]}
      interactionLocked={interactionLocked}
      onSwitch={onSwitch}
      onPreview={vi.fn()}
      onSidebarLeave={vi.fn()}
      onDelete={vi.fn()}
      onWorkspaceDragOver={vi.fn()}
      onWorkspaceDragLeave={vi.fn()}
      onWorkspaceDrop={vi.fn()}
    />
  )
  return { input: screen.getByRole("textbox"), onSearchCreate, onSwitch }
}

describe("Sidebar search and creation", () => {
  afterEach(cleanup)
  const prefix: Workspace = {
    id: "prefix",
    name: "Research Archive",
    createdAt: 1,
    tabs: []
  }

  it("offers explicit creation and defaults Enter to creating a partial match", () => {
    const { input, onSearchCreate, onSwitch } = renderSearchSidebar(
      " Research ",
      [prefix]
    )
    fireEvent.click(screen.getByRole("button", { name: "home.command.create" }))
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onSearchCreate.mock.calls).toEqual([["Research"], ["Research"]])
    expect(onSwitch).not.toHaveBeenCalled()
  })

  it("switches the exact name even if a partial result precedes it", () => {
    const exact = { ...prefix, id: "exact", name: "Research" }
    const { input, onSearchCreate, onSwitch } = renderSearchSidebar(
      "ＲＥＳＥＡＲＣＨ",
      [prefix, exact]
    )
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onSwitch).toHaveBeenCalledWith(exact)
    expect(onSearchCreate).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("button", { name: "home.command.create" })
    ).toBeNull()
  })

  it("does not submit composition or a locked create action", () => {
    const { input, onSearchCreate } = renderSearchSidebar(
      "Research",
      [prefix],
      true
    )
    fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 })
    fireEvent.keyDown(input, { key: "Enter" })
    const create = screen.getByRole("button", {
      name: "home.command.create"
    }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    expect(onSearchCreate).not.toHaveBeenCalled()
  })
})
