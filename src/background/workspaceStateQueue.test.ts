import { beforeEach, describe, expect, it, vi } from "vitest"

import * as storageModule from "~core/storage"
import { STORAGE_KEYS } from "~core/types"
import { logWarn } from "~lib/logger"
import {
  applyWorkspaceStatePatchWithMerge,
  removeWorkspaceStateEntries,
  retryPendingWorkspaceStateRemovals,
  scheduleWorkspaceStateRemoval
} from "~lib/storageQueues"

import { removePersistedWorkspaceNoteDrafts } from "./services/noteDraftMaintenance"

vi.mock("~core/storage", () => ({
  loadWorkspaces: vi.fn(),
  loadWorkspaceState: vi.fn(),
  removeWorkspaceBindingsForWorkspace: vi.fn(),
  saveWorkspaceStatePatch: vi.fn()
}))
vi.mock("./services/noteDraftMaintenance", () => ({
  removePersistedWorkspaceNoteDrafts: vi.fn(async () => undefined)
}))

vi.mock("~lib/logger", () => ({
  logWarn: vi.fn()
}))

describe("workspaceStateQueue", () => {
  const loadWorkspaceState = vi.mocked(storageModule.loadWorkspaceState)
  const saveWorkspaceStatePatch = vi.mocked(
    storageModule.saveWorkspaceStatePatch
  )
  const logWarnMock = vi.mocked(logWarn)

  beforeEach(() => {
    vi.clearAllMocks()
    const metadata: Record<string, unknown> = {}
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: metadata[key] })),
          set: vi.fn(async (values: Record<string, unknown>) => {
            Object.assign(metadata, values)
          })
        }
      }
    })
    vi.mocked(storageModule.loadWorkspaces).mockResolvedValue(
      ["w1", "w2", "keep", "deleted"].map((id) => ({
        id,
        name: id,
        tabs: [],
        createdAt: 1
      }))
    )
  })

  it("applies patch directly when merge is not needed", async () => {
    await applyWorkspaceStatePatchWithMerge({ activeWorkspaceId: "w1" })
    expect(loadWorkspaceState).not.toHaveBeenCalled()
    expect(saveWorkspaceStatePatch).toHaveBeenCalledWith({
      activeWorkspaceId: "w1"
    })
  })

  it("merges notes, previews, and linked resources", async () => {
    loadWorkspaceState.mockResolvedValue({
      notes: { w1: "note-1" },
      notePreview: { w1: true },
      linkedResources: {
        w1: [
          {
            id: "link-1",
            url: "https://www.notion.so/root",
            host: "www.notion.so",
            title: "Root Doc",
            provider: "Notion",
            createdAt: 100
          }
        ]
      }
    } as any)

    await applyWorkspaceStatePatchWithMerge({
      notes: { w2: "note-2" },
      notePreview: { w2: false },
      linkedResources: {
        w2: [
          {
            id: "link-2",
            url: "https://docs.google.com/document/d/spec/edit",
            host: "docs.google.com",
            title: "Spec",
            provider: "Google Docs",
            createdAt: 200
          }
        ]
      }
    })

    expect(saveWorkspaceStatePatch).toHaveBeenCalledWith({
      notes: { w1: "note-1", w2: "note-2" },
      notePreview: { w1: true, w2: false },
      linkedResources: {
        w1: [
          {
            id: "link-1",
            url: "https://www.notion.so/root",
            host: "www.notion.so",
            title: "Root Doc",
            provider: "Notion",
            createdAt: 100
          }
        ],
        w2: [
          {
            id: "link-2",
            url: "https://docs.google.com/document/d/spec/edit",
            host: "docs.google.com",
            title: "Spec",
            provider: "Google Docs",
            createdAt: 200
          }
        ]
      }
    })
  })

  it("preserves concurrent merged patches against the latest saved state", async () => {
    let storedState = {
      notes: {},
      notePreview: {},
      linkedResources: {}
    } as any
    let loadCalls = 0
    loadWorkspaceState.mockImplementation(async () => {
      loadCalls += 1
      const snapshot = structuredClone(storedState)
      if (loadCalls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      return snapshot
    })
    saveWorkspaceStatePatch.mockImplementation(async (patch) => {
      storedState = {
        ...storedState,
        ...patch
      }
    })

    await Promise.all([
      applyWorkspaceStatePatchWithMerge({ notes: { w1: "note-1" } }),
      applyWorkspaceStatePatchWithMerge({ notes: { w2: "note-2" } })
    ])

    expect(storedState.notes).toEqual({
      w1: "note-1",
      w2: "note-2"
    })
  })

  it("logs when workspace state write fails", async () => {
    saveWorkspaceStatePatch.mockRejectedValueOnce(new Error("write failed"))

    await expect(
      applyWorkspaceStatePatchWithMerge({ activeWorkspaceId: "workspace-1" })
    ).rejects.toThrow("write failed")

    await new Promise((r) => setTimeout(r, 0))

    expect(logWarnMock).toHaveBeenCalledWith(
      "workspace-state-queue",
      "工作区状态写入失败",
      expect.any(Error)
    )
  })

  it("removes orphaned workspace context through the serialized state queue", async () => {
    loadWorkspaceState.mockResolvedValue({
      activeWorkspaceId: "deleted",
      notes: { deleted: "remove", keep: "keep" },
      notePreview: { deleted: true, keep: false },
      linkedResources: { deleted: [{ id: "old" }], keep: [{ id: "new" }] }
    } as any)

    await removeWorkspaceStateEntries(["deleted"])

    expect(saveWorkspaceStatePatch).toHaveBeenCalledWith({
      activeWorkspaceId: null,
      notes: { keep: "keep" },
      notePreview: { keep: false },
      linkedResources: { keep: [{ id: "new" }] }
    })
    expect(
      storageModule.removeWorkspaceBindingsForWorkspace
    ).toHaveBeenCalledWith("deleted")
  })

  it("skips state IO when there are no workspace ids to remove", async () => {
    await removeWorkspaceStateEntries([])

    expect(loadWorkspaceState).not.toHaveBeenCalled()
    expect(saveWorkspaceStatePatch).not.toHaveBeenCalled()
  })

  it("rejects a late note save for a permanently deleted workspace", async () => {
    vi.mocked(storageModule.loadWorkspaces).mockResolvedValue([])
    loadWorkspaceState.mockResolvedValue({ notes: {} } as any)
    await expect(
      applyWorkspaceStatePatchWithMerge({ notes: { deleted: "late note" } })
    ).rejects.toThrow("workspace-note-target-not-found")
    expect(saveWorkspaceStatePatch).not.toHaveBeenCalled()
  })

  it("retains failed cleanup work and retries it without touching a live workspace", async () => {
    await scheduleWorkspaceStateRemoval(["deleted", "keep"])
    vi.mocked(storageModule.loadWorkspaces).mockResolvedValue([
      { id: "keep", name: "keep", createdAt: 1, tabs: [] }
    ])
    loadWorkspaceState.mockResolvedValue({
      notes: { deleted: "old", keep: "kept" }
    } as any)
    vi.mocked(removePersistedWorkspaceNoteDrafts).mockRejectedValueOnce(
      new Error("note-draft-cleanup-failed")
    )
    await expect(removeWorkspaceStateEntries(["deleted"])).rejects.toThrow(
      "note-draft-cleanup-failed"
    )
    expect(saveWorkspaceStatePatch).not.toHaveBeenCalled()
    await retryPendingWorkspaceStateRemovals()
    expect(saveWorkspaceStatePatch).toHaveBeenCalledWith(
      expect.objectContaining({ notes: { keep: "kept" } })
    )
    const state = await chrome.storage.local.get(
      STORAGE_KEYS.PENDING_NOTE_DRAFT_CLEANUP
    )
    expect(state[STORAGE_KEYS.PENDING_NOTE_DRAFT_CLEANUP]).toEqual(["keep"])
  })
})
