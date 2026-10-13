import { describe, expect, it } from "vitest"

import type { Workspace } from "~core/types"

import {
  captureWorkspaceRollbackEntries,
  restoreWorkspaceRollbackEntries
} from "./workspaceRollback"

const workspace = (
  id: string,
  url: string,
  tabsRevision: number
): Workspace => ({
  id,
  name: id,
  createdAt: 1,
  tabs: [{ url }],
  tabsRevision,
  history: []
})

describe("workspace rollback", () => {
  const before = [
    workspace("source", "https://before.example", 1),
    workspace("target", "https://target.example", 3)
  ]
  const after = [
    { ...before[0], tabs: [], tabsRevision: 2 },
    {
      ...before[1],
      tabs: [...before[1].tabs, ...before[0].tabs],
      tabsRevision: 4
    }
  ]
  const entries = captureWorkspaceRollbackEntries(before, after, [
    "source",
    "target"
  ])

  it("restores tab state with newer revisions and keeps later metadata", () => {
    const current = [
      { ...after[0], name: "renamed", color: "#123456" },
      after[1]
    ]
    const restored = restoreWorkspaceRollbackEntries(current, entries)
    expect(restored[0]).toMatchObject({
      tabs: before[0].tabs,
      tabsRevision: 3,
      name: "renamed",
      color: "#123456"
    })
    expect(restored[1]).toMatchObject({ tabs: before[1].tabs, tabsRevision: 5 })
  })

  it("preserves both sides when a later tab edit conflicts on just one side", () => {
    const current = [
      after[0],
      { ...after[1], tabs: [{ url: "https://newer.example" }], tabsRevision: 5 }
    ]
    expect(restoreWorkspaceRollbackEntries(current, entries)).toBe(current)
  })

  it("does not revive a deleted workspace", () => {
    const current = [after[1]]
    expect(restoreWorkspaceRollbackEntries(current, entries)).toBe(current)
  })

  it("keeps a later timeline snapshot and does not partially undo a move", () => {
    const current = [
      { ...after[0], history: [{ id: "new", createdAt: 2, tabs: [] }] },
      after[1]
    ]
    expect(restoreWorkspaceRollbackEntries(current, entries)).toBe(current)
  })

  it("does not manufacture a revision for unchanged records", () => {
    const unchanged = captureWorkspaceRollbackEntries(before, before, [
      "source",
      "target"
    ])
    expect(restoreWorkspaceRollbackEntries(before, unchanged)).toBe(before)
  })
})
