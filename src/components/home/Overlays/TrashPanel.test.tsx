// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Workspace } from "~core/types"

import { TrashPanel } from "./TrashPanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock("~components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <>{children}</> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  )
}))

vi.mock("~components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}))

vi.mock("~components/ui/delete", () => ({
  DeleteIcon: () => <span aria-hidden="true" />
}))

vi.mock("~components/ui/search", () => ({
  SearchIcon: () => <span aria-hidden="true" />
}))

vi.mock("~components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  )
}))

const trashedWorkspace: Workspace = {
  id: "trashed",
  name: "Trashed",
  createdAt: 1,
  trashedAt: 2,
  tabs: [{ url: "https://example.com" }]
}

describe("TrashPanel locked deletion", () => {
  afterEach(cleanup)

  it("disables every destructive entry while workspace loading is locked", () => {
    const onEmptyTrash = vi.fn()
    const onDeleteForever = vi.fn()

    render(
      <TrashPanel
        open
        onOpenChange={vi.fn()}
        trashCount={1}
        totalTrashTabs={1}
        query=""
        onQueryChange={vi.fn()}
        filteredTrash={[trashedWorkspace]}
        interactionLocked
        onEmptyTrash={onEmptyTrash}
        onRestore={vi.fn()}
        onDeleteForever={onDeleteForever}
      />
    )

    const emptyButton = screen.getByRole("button", {
      name: "home.trash.emptyAction"
    }) as HTMLButtonElement
    const deleteButton = screen.getByRole("button", {
      name: "home.trash.deletePermanently"
    }) as HTMLButtonElement

    expect(emptyButton.disabled).toBe(true)
    expect(deleteButton.disabled).toBe(true)
    fireEvent.click(emptyButton)
    fireEvent.click(deleteButton)
    expect(onEmptyTrash).not.toHaveBeenCalled()
    expect(onDeleteForever).not.toHaveBeenCalled()
    expect(
      screen.getAllByRole("group", {
        name: "home.workspace.deleteBlocked"
      })
    ).toHaveLength(2)
  })
})
