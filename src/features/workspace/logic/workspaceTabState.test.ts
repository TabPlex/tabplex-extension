import { describe, expect, it } from "vitest"

import type { TabSpec, Workspace } from "~core/types"

import {
  appendWorkspaceTabs,
  extractMovableWorkspaceTabs,
  getWorkspaceTabs,
  removeWorkspaceTab,
  replaceWorkspaceTabs,
  restoreWorkspaceTabsFromSnapshot,
  setWorkspaceTabExcluded
} from "./workspaceTabState"

const tab = (url: string, overrides: Partial<TabSpec> = {}): TabSpec => ({
  url,
  title: url,
  ...overrides
})

const workspace = (
  tabs: TabSpec[],
  overrides: Partial<Workspace> = {}
): Workspace => ({
  id: "workspace-1",
  name: "Workspace",
  createdAt: 1,
  tabs,
  tabsRevision: 3,
  history: [],
  ...overrides
})

describe("workspaceTabState", () => {
  it("uses flat tabs as the only canonical source and ignores pinned tabs", () => {
    const value = workspace([
      tab("https://first.example"),
      tab("https://pinned.example", { pinned: true }),
      tab("https://second.example")
    ])

    expect(getWorkspaceTabs(value).map((item) => item.url)).toEqual([
      "https://first.example",
      "https://second.example"
    ])
  })

  it("updates one flat-indexed tab immutably and increments the revision", () => {
    const value = workspace([
      tab("https://a.example"),
      tab("https://b.example")
    ])
    const original = structuredClone(value)

    const result = setWorkspaceTabExcluded(value, 1, true)

    expect(result.changed).toBe(true)
    expect(result.tab?.url).toBe("https://b.example")
    expect(result.workspace.tabs[1].excluded).toBe(true)
    expect(result.workspace.tabsRevision).toBe(4)
    expect(value).toEqual(original)
  })

  it("matches only the first duplicate URL", () => {
    const duplicate = "https://duplicate.example"
    const result = setWorkspaceTabExcluded(
      workspace([tab(duplicate), tab(duplicate)]),
      duplicate,
      true
    )

    expect(result.workspace.tabs.map((item) => item.excluded)).toEqual([
      true,
      undefined
    ])
  })

  it.each([-1, 0.5, 99])(
    "treats invalid flat index %s as a no-op",
    (invalidIndex) => {
      const value = workspace([tab("https://a.example")])
      const result = removeWorkspaceTab(value, invalidIndex)

      expect(result.changed).toBe(false)
      expect(result.workspace.tabs).toEqual(value.tabs)
      expect(result.workspace.tabsRevision).toBe(3)
    }
  )

  it("removes only the selected duplicate occurrence", () => {
    const duplicate = "https://duplicate.example"
    const result = removeWorkspaceTab(
      workspace([tab(duplicate), tab(duplicate), tab("https://keep.example")]),
      1
    )

    expect(result.workspace.tabs.map((item) => item.url)).toEqual([
      duplicate,
      "https://keep.example"
    ])
    expect(result.workspace.tabsRevision).toBe(4)
  })

  it("extracts movable tabs by exact flat index without reordering", () => {
    const result = extractMovableWorkspaceTabs(
      workspace([
        tab("https://a.example"),
        tab("https://b.example"),
        tab("https://c.example")
      ]),
      [2, 1, 1]
    )

    expect(result.movingTabs.map((item) => item.url)).toEqual([
      "https://b.example",
      "https://c.example"
    ])
    expect(result.workspace.tabs.map((item) => item.url)).toEqual([
      "https://a.example"
    ])
    expect(result.workspace.tabsRevision).toBe(4)
  })

  it("replaces and appends directly to the flat collection", () => {
    const value = workspace([tab("https://old.example")])
    const replaced = replaceWorkspaceTabs(value, [
      tab("https://new.example"),
      tab("https://ignored-pinned.example", { pinned: true })
    ])
    const appended = appendWorkspaceTabs(replaced, [
      tab("https://moved.example")
    ])

    expect(appended.tabs.map((item) => item.url)).toEqual([
      "https://new.example",
      "https://moved.example"
    ])
    expect(appended.tabsRevision).toBe(5)
  })

  it("does not increment the revision when replacement is identical", () => {
    const value = workspace([tab("https://same.example")])
    const result = replaceWorkspaceTabs(value, value.tabs)

    expect(result.tabsRevision).toBe(3)
    expect(result.tabs).toEqual(value.tabs)
  })

  it("restores snapshot order, duplicates and portable metadata", () => {
    const result = restoreWorkspaceTabsFromSnapshot(
      workspace([tab("https://old.example")]),
      [
        tab("https://duplicate.example", {
          group: { key: "research", color: "blue" }
        }),
        tab("https://duplicate.example"),
        tab("https://ignored-pinned.example", { pinned: true })
      ]
    )

    expect(result.tabs.map((item) => item.url)).toEqual([
      "https://duplicate.example",
      "https://duplicate.example"
    ])
    expect(result.tabs[0].group).toEqual({ key: "research", color: "blue" })
    expect(result.tabsRevision).toBe(4)
  })
})
