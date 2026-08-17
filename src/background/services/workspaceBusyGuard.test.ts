import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Workspace, WorkspaceState } from "~core/types"
import { applyWorkspacesUpdate } from "~lib/workspacesQueue"

import {
  assertWorkspaceDeletionAllowed,
  reserveWorkspaceSwitchTargets,
  resetWorkspaceBusyRuntime
} from "./workspaceBusyGuard"

const state = vi.hoisted(() => ({
  workspaces: [] as Workspace[],
  workspaceState: { switchState: null } as WorkspaceState,
  warmupJobs: {} as Record<string, unknown>
}))

vi.mock("~core/storage", () => ({
  loadWorkspaces: vi.fn(async () => structuredClone(state.workspaces)),
  saveWorkspaces: vi.fn(async (next: Workspace[]) => {
    state.workspaces = structuredClone(next)
  }),
  loadWorkspaceState: vi.fn(async () => structuredClone(state.workspaceState)),
  loadSettings: vi.fn(),
  removeWorkspaceBindingsForWorkspace: vi.fn(),
  saveSettings: vi.fn(),
  saveWorkspaceStatePatch: vi.fn()
}))

const workspace = (id: string, trashedAt?: number): Workspace => ({
  id,
  name: id,
  createdAt: 1,
  tabs: [{ url: `https://${id}.example` }],
  tabsRevision: 0,
  history: [],
  ...(trashedAt ? { trashedAt } : {})
})

describe("workspaceBusyGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWorkspaceBusyRuntime()
    state.workspaces = [workspace("source"), workspace("target")]
    state.workspaceState = { switchState: null } as WorkspaceState
    state.warmupJobs = {}
    ;(globalThis as any).chrome = {
      storage: {
        session: {
          get: vi.fn(async () => ({
            workspaceTabWarmupJobs: structuredClone(state.warmupJobs)
          }))
        }
      }
    }
  })

  it("orders switch reservation and deletion on the workspace queue", async () => {
    const reservationPromise = reserveWorkspaceSwitchTargets({
      sourceId: "source",
      targetId: "target"
    })
    const deletion = applyWorkspacesUpdate(async (current) => {
      await assertWorkspaceDeletionAllowed(current, {
        kind: "delete",
        id: "target"
      })
      return current.filter((item) => item.id !== "target")
    })

    const reservation = await reservationPromise
    await expect(deletion).rejects.toThrow("workspace-delete-busy")
    expect(state.workspaces.map(({ id }) => id)).toEqual(["source", "target"])

    reservation.release()
    await applyWorkspacesUpdate(async (current) => {
      await assertWorkspaceDeletionAllowed(current, {
        kind: "delete",
        id: "target"
      })
      return current.filter((item) => item.id !== "target")
    })
    expect(state.workspaces.map(({ id }) => id)).toEqual(["source"])
  })

  it("lets a deletion that entered the queue first win cleanly", async () => {
    const deletion = applyWorkspacesUpdate(async (current) => {
      await assertWorkspaceDeletionAllowed(current, {
        kind: "delete",
        id: "target"
      })
      return current.filter((item) => item.id !== "target")
    })
    const reservation = reserveWorkspaceSwitchTargets({
      sourceId: "source",
      targetId: "target"
    })

    await deletion
    await expect(reservation).rejects.toThrow("workspace_not_found")
  })

  it("restores busy state from switch journals and warmup jobs", async () => {
    state.workspaceState = {
      switchState: {
        runId: "switch-run",
        targetId: "target",
        sourceId: "source",
        windowId: 7,
        ts: 1,
        phase: "committing",
        expectedCount: 1,
        openedCount: 1,
        completedCount: 1,
        failedCount: 0,
        sourceSnapshot: { id: "source", tabs: [] },
        updatedAt: 1
      }
    } as WorkspaceState
    state.warmupJobs = {
      "8": { workspaceId: "warm", windowId: 8, runId: "warmup-run" }
    }

    await expect(
      assertWorkspaceDeletionAllowed([...state.workspaces, workspace("warm")], {
        kind: "empty-trash"
      })
    ).resolves.toBeUndefined()
    await expect(
      assertWorkspaceDeletionAllowed(state.workspaces, {
        kind: "remove-tab",
        workspaceId: "source"
      })
    ).rejects.toThrow("workspace-delete-busy")
    await expect(
      assertWorkspaceDeletionAllowed([workspace("warm", 2)], {
        kind: "empty-trash"
      })
    ).rejects.toThrow("workspace-delete-busy")
  })
})
