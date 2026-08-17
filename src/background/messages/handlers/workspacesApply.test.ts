import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TabSpec, Workspace } from "~core/types"
import { removeWorkspaceStateEntries } from "~lib/storageQueues"
import { applyWorkspacesUpdate } from "~lib/workspacesQueue"

import { runWorkspaceDataOperation } from "../../workspaceController"
import { handleWorkspacesApplyMessage } from "./workspacesApply"

const busyGuard = vi.hoisted(() => ({
  assertWorkspaceDeletionAllowed: vi.fn(async () => undefined)
}))

vi.mock("~lib/workspacesQueue", () => ({
  applyWorkspacesUpdate: vi.fn()
}))

vi.mock("~lib/storageQueues", () => ({
  removeWorkspaceStateEntries: vi.fn()
}))

vi.mock("../../workspaceController", () => ({
  runWorkspaceDataOperation: vi.fn()
}))

vi.mock("../../services/workspaceBusyGuard", () => ({
  assertWorkspaceDeletionAllowed: busyGuard.assertWorkspaceDeletionAllowed
}))

const tab = (url: string, overrides: Partial<TabSpec> = {}): TabSpec => ({
  url,
  title: url,
  ...overrides
})

const workspace = (
  id: string,
  tabs: TabSpec[] = [],
  overrides: Partial<Workspace> = {}
): Workspace => ({
  id,
  name: id,
  createdAt: 1,
  tabs,
  tabsRevision: 0,
  history: [],
  ...overrides
})

describe("workspaces-apply flat tab operations", () => {
  let stored: Workspace[]

  beforeEach(() => {
    vi.clearAllMocks()
    stored = []
    vi.mocked(runWorkspaceDataOperation).mockImplementation((task) => task())
    vi.mocked(applyWorkspacesUpdate).mockImplementation(async (updater) => {
      stored = await updater(stored)
      return stored
    })
    busyGuard.assertWorkspaceDeletionAllowed.mockResolvedValue(undefined)
  })

  const apply = (op: Record<string, unknown>, preferredWindowId?: number) =>
    new Promise<any>((resolve) => {
      handleWorkspacesApplyMessage(
        {
          _tabplex: true,
          type: "workspaces-apply",
          op,
          preferredWindowId
        } as any,
        resolve
      )
    })

  it("creates without coupling persistence to the current window autosave", async () => {
    const created = workspace("created")

    await expect(
      apply({ kind: "create", workspace: created }, 17)
    ).resolves.toEqual({ ok: true, result: created })

    expect(runWorkspaceDataOperation).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        preferredWindowId: 17,
        flushPreferredWindowAutosave: false
      })
    )
    expect(stored).toEqual([created])
  })

  it("edits the flat collection and records the removed state", async () => {
    stored = [
      workspace("source", [tab("https://a.example"), tab("https://b.example")])
    ]

    await apply({
      kind: "exclude-tab",
      workspaceId: "source",
      tabIndexOrUrl: 1,
      excluded: true
    })
    await apply({
      kind: "remove-tab",
      workspaceId: "source",
      tabIndexOrUrl: 0
    })

    expect(stored[0].tabs).toEqual([
      tab("https://b.example", { excluded: true })
    ])
    expect(stored[0].tabsRevision).toBe(2)
    expect(stored[0].history?.at(-1)?.tabs).toEqual([
      expect.objectContaining({ url: "https://a.example" })
    ])
  })

  it("moves selected tabs in original order and advances both revisions", async () => {
    stored = [
      workspace("source", [
        tab("https://a.example"),
        tab("https://b.example"),
        tab("https://c.example")
      ]),
      workspace("target", [tab("https://target.example")])
    ]

    await expect(
      apply({
        kind: "move-tabs",
        sourceId: "source",
        targetId: "target",
        tabIndexes: [2, 0]
      })
    ).resolves.toEqual({ ok: true, result: true })

    expect(stored[0].tabs.map((item) => item.url)).toEqual([
      "https://b.example"
    ])
    expect(stored[1].tabs.map((item) => item.url)).toEqual([
      "https://target.example",
      "https://a.example",
      "https://c.example"
    ])
    expect(stored.map((item) => item.tabsRevision)).toEqual([1, 1])
  })

  it("restores one snapshot without importing pinned tabs", async () => {
    stored = [
      workspace("source", [tab("https://old.example")], {
        history: [
          {
            id: "snapshot-1",
            createdAt: 1,
            tabs: [
              tab("https://snapshot.example"),
              tab("https://pinned.example", { pinned: true })
            ]
          }
        ]
      })
    ]

    await expect(
      apply({
        kind: "restore-snapshot",
        workspaceId: "source",
        snapshotId: "snapshot-1"
      })
    ).resolves.toEqual({ ok: true, result: true })

    expect(stored[0].tabs).toEqual([tab("https://snapshot.example")])
    expect(stored[0].tabsRevision).toBe(1)
    expect(stored[0].history?.[0].tabs).toEqual([tab("https://old.example")])
  })

  it("restores the oldest retained snapshot while saving the current state atomically", async () => {
    const history = Array.from({ length: 15 }, (_, index) => ({
      id: `snapshot-${index}`,
      createdAt: index + 1,
      tabs: [tab(`https://snapshot-${index}.example`)]
    }))
    stored = [
      workspace("source", [tab("https://current.example")], { history })
    ]

    await expect(
      apply({
        kind: "restore-snapshot",
        workspaceId: "source",
        snapshotId: "snapshot-14"
      })
    ).resolves.toEqual({ ok: true, result: true })

    expect(stored[0].tabs).toEqual([tab("https://snapshot-14.example")])
    expect(stored[0].history).toHaveLength(15)
    expect(stored[0].history?.[0].tabs).toEqual([
      tab("https://current.example")
    ])
  })

  it("treats restoring the current tab collection as a no-op", async () => {
    stored = [
      workspace("source", [tab("https://same.example")], {
        history: [
          {
            id: "same-snapshot",
            createdAt: 1,
            tabs: [tab("https://same.example")]
          }
        ]
      })
    ]

    await expect(
      apply({
        kind: "restore-snapshot",
        workspaceId: "source",
        snapshotId: "same-snapshot"
      })
    ).resolves.toEqual({ ok: true, result: true })

    expect(stored[0].tabsRevision).toBe(0)
    expect(stored[0].history).toHaveLength(1)
  })

  it("replaces tabs, keeps a recovery snapshot and forwards the source window", async () => {
    stored = [workspace("source", [tab("https://old.example")])]

    await apply(
      {
        kind: "set-tabs",
        workspaceId: "source",
        tabs: [tab("https://new.example"), tab("chrome://settings")]
      },
      17
    )

    expect(stored[0].tabs).toEqual([tab("https://new.example")])
    expect(stored[0].history?.at(-1)?.tabs).toEqual([
      tab("https://old.example")
    ])
    expect(runWorkspaceDataOperation).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        materializeWorkspaceIds: expect.any(Function),
        preferredWindowId: 17
      })
    )
    const options = vi.mocked(runWorkspaceDataOperation).mock.calls.at(-1)?.[1]
    expect(
      typeof options?.materializeWorkspaceIds === "function"
        ? options.materializeWorkspaceIds()
        : options?.materializeWorkspaceIds
    ).toEqual(["source"])
  })

  it("does not materialize an identical tab collection", async () => {
    stored = [workspace("source", [tab("https://same.example")])]

    await apply({
      kind: "set-tabs",
      workspaceId: "source",
      tabs: [tab("https://same.example")]
    })

    expect(stored[0].tabsRevision).toBe(0)
    const options = vi.mocked(runWorkspaceDataOperation).mock.calls.at(-1)?.[1]
    expect(
      typeof options?.materializeWorkspaceIds === "function"
        ? options.materializeWorkspaceIds()
        : options?.materializeWorkspaceIds
    ).toEqual([])
  })

  it("rolls back only affected workspaces when materialization fails", async () => {
    stored = [
      workspace("source", [tab("https://source.example")]),
      workspace("target", [tab("https://target.example")])
    ]
    const before = structuredClone(stored)
    const unrelated = workspace("unrelated")
    vi.mocked(runWorkspaceDataOperation).mockImplementationOnce(
      async (task, options) => {
        await task()
        stored.push(unrelated)
        await options?.rollbackOnMaterializeFailure?.()
        throw new Error("materialization failed")
      }
    )

    await expect(
      apply({
        kind: "move-tabs",
        sourceId: "source",
        targetId: "target",
        tabIndexes: [0]
      })
    ).resolves.toEqual({ ok: false, error: "workspaces-apply failed" })

    expect(stored.slice(0, 2)).toEqual(before)
    expect(stored[2]).toBe(unrelated)
  })

  it("cleans workspace-scoped state after permanent deletion", async () => {
    stored = [workspace("keep"), workspace("deleted", [], { trashedAt: 2 })]

    await apply({ kind: "delete", id: "deleted" })

    expect(stored.map((item) => item.id)).toEqual(["keep"])
    expect(removeWorkspaceStateEntries).toHaveBeenCalledWith(["deleted"])
  })

  it("keeps a busy workspace unchanged when deletion reaches the backend", async () => {
    stored = [workspace("target", [tab("https://target.example")])]
    const before = structuredClone(stored)
    busyGuard.assertWorkspaceDeletionAllowed.mockRejectedValueOnce(
      new Error("workspace-delete-busy")
    )

    await expect(apply({ kind: "trash", id: "target" })).resolves.toEqual({
      ok: false,
      error: "workspaces-apply failed"
    })

    expect(stored).toEqual(before)
    expect(removeWorkspaceStateEntries).not.toHaveBeenCalled()
  })

  it("moves an empty workspace to trash without permanently deleting it", async () => {
    stored = [workspace("empty")]

    await expect(apply({ kind: "trash", id: "empty" })).resolves.toMatchObject({
      ok: true
    })

    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ id: "empty" })
    expect(stored[0].trashedAt).toEqual(expect.any(Number))
    expect(removeWorkspaceStateEntries).not.toHaveBeenCalled()
  })

  it.each([-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid explicit source window before mutating data: %s",
    async (preferredWindowId) => {
      await expect(
        apply({ kind: "create", name: "blocked" }, preferredWindowId)
      ).resolves.toEqual({
        ok: false,
        error: "invalid-workspace-window-id"
      })

      expect(runWorkspaceDataOperation).not.toHaveBeenCalled()
      expect(applyWorkspacesUpdate).not.toHaveBeenCalled()
    }
  )
})
