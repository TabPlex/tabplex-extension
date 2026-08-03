// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React, { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TabList } from "./TabList"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      typeof values?.count === "number" ? `${key}:${values.count}` : key
  })
}))

vi.mock("~components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null
}))

vi.mock("~components/ui/delete", () => ({
  DeleteIcon: () => <span aria-hidden="true" />
}))
vi.mock("~components/ui/file-check", () => ({
  FileCheckIcon: () => <span aria-hidden="true" />
}))
vi.mock("~components/ui/arrow-left-right", () => ({
  ArrowLeftRightIcon: () => <span aria-hidden="true" />
}))

const SelectionHarness = ({
  onMoveToWorkspace
}: {
  onMoveToWorkspace: (workspaceId: string) => void
}) => {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([])

  return (
    <TabList
      tabCount={1}
      showEmptyState={false}
      tabSelectionMode={selectionMode}
      selectionCount={selectedIndexes.length}
      selectedTabIndexes={selectedIndexes}
      onToggleSelectionMode={(next) => {
        const enabled = next ?? !selectionMode
        setSelectionMode(enabled)
        if (!enabled) setSelectedIndexes([])
      }}
      listTabs={[{ url: "https://example.com", title: "Example" }]}
      draggedTabIndexes={[]}
      onRemoveTab={() => {}}
      onTabDragStart={() => {}}
      onTabDragEnd={() => {}}
      onToggleTabIndex={(index) =>
        setSelectedIndexes((current) =>
          current.includes(index) ? [] : [index]
        )
      }
      onOpenTab={() => {}}
      workspaceMoveTargets={[{ id: "workspace-2", name: "Target workspace" }]}
      onMoveSelectedTabsToWorkspace={onMoveToWorkspace}
      interactionLocked={false}
    />
  )
}

describe("TabList keyboard and pointer alternatives", () => {
  afterEach(cleanup)

  it("moves selected tabs without dragging", async () => {
    const user = userEvent.setup()
    const onMoveToWorkspace = vi.fn()
    render(<SelectionHarness onMoveToWorkspace={onMoveToWorkspace} />)

    await user.click(
      screen.getByRole("button", { name: "home.tabs.toggleSelect" })
    )
    await user.click(screen.getByRole("button", { name: /Example/ }))

    await user.click(
      screen.getByRole("button", {
        name: "home.tabs.selectionActions.moveToWorkspace"
      })
    )
    await user.click(
      await screen.findByRole("menuitem", { name: "Target workspace" })
    )
    expect(onMoveToWorkspace).toHaveBeenCalledWith("workspace-2")
  })
})
