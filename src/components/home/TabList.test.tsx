// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
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
  onMoveToWorkspace,
  onOpenTab = () => undefined
}: {
  onMoveToWorkspace: (workspaceId: string) => void
  onOpenTab?: (tab: { url: string; title?: string }) => void
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
      onOpenTab={onOpenTab}
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

  it("matches native button timing for Enter and Space", () => {
    const onOpenTab = vi.fn()
    render(
      <SelectionHarness onMoveToWorkspace={vi.fn()} onOpenTab={onOpenTab} />
    )
    const tab = screen.getByRole("button", { name: /Example/ })

    fireEvent.keyDown(tab, { key: " " })
    expect(onOpenTab).not.toHaveBeenCalled()
    fireEvent.keyUp(tab, { key: " " })
    expect(onOpenTab).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(tab, { key: "Enter" })
    expect(onOpenTab).toHaveBeenCalledTimes(2)
  })

  it("locates the first tab whose complete URL matches", async () => {
    const scrolledElements: HTMLElement[] = []
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
      scrolledElements.push(this)
    }

    try {
      render(
        <TabList
          tabCount={3}
          showEmptyState={false}
          tabSelectionMode={false}
          selectionCount={0}
          selectedTabIndexes={[]}
          onToggleSelectionMode={() => undefined}
          listTabs={[
            { url: "https://example.com/page#first", title: "First" },
            { url: "https://example.com/page#second", title: "Second" },
            { url: "https://example.com/page#second", title: "Duplicate" }
          ]}
          draggedTabIndexes={[]}
          onRemoveTab={() => undefined}
          onTabDragStart={() => undefined}
          onTabDragEnd={() => undefined}
          onToggleTabIndex={() => undefined}
          onOpenTab={() => undefined}
          locateRequest={{
            id: 1,
            url: "https://example.com/page#second"
          }}
          interactionLocked={false}
        />
      )

      await waitFor(() => expect(scrolledElements).toHaveLength(1))
      expect(scrolledElements[0]?.textContent).toContain("Second")
      expect(scrolledElements[0]?.textContent).not.toContain("Duplicate")
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })
})
