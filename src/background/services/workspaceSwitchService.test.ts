import { beforeEach, describe, expect, it, vi } from "vitest"

import { setWorkspaceWindowBinding } from "~core/storage"
import type {
  TabSpec,
  Workspace,
  WorkspaceState,
  WorkspaceWindowBindingMap
} from "~core/types"

import {
  flushWorkspaceWindowAutosave,
  resumeWorkspaceWindowAutosave
} from "./workspaceAutosave"
import { requestCurrentWindowWorkspaceSwitch } from "./workspaceSwitchService"
import {
  captureWorkspaceWindowTabs,
  resolveNormalWindowId
} from "./workspaceWindowTabs"

const state = vi.hoisted(() => ({
  bindings: {} as WorkspaceWindowBindingMap,
  journal: null as WorkspaceState["switchState"],
  workspaces: [] as Workspace[]
}))

const orchestrator = vi.hoisted(() => ({
  switchWorkspace: vi.fn()
}))

vi.mock("~core/storage", () => ({
  getWorkspaceWindowBinding: vi.fn(async (windowId: number) =>
    structuredClone(state.bindings[String(windowId)] ?? null)
  ),
  loadWorkspaces: vi.fn(async () => structuredClone(state.workspaces)),
  loadWorkspaceState: vi.fn(async () => ({ switchState: state.journal })),
  removeWorkspaceWindowBinding: vi.fn(async (windowId: number) => {
    delete state.bindings[String(windowId)]
  }),
  saveWorkspaceSwitchState: vi.fn(async (journal) => {
    state.journal = structuredClone(journal)
  }),
  setWorkspaceWindowBinding: vi.fn(async (windowId, binding) => {
    state.bindings[String(windowId)] = structuredClone(binding)
  })
}))

vi.mock("~core/utils", () => ({
  uuid: vi.fn(() => "run-1")
}))

vi.mock("~features/workspace/logic/workspaceLogic", () => ({
  recordSnapshot: vi.fn((workspace, tabs) => ({
    ...workspace,
    history: [
      { id: "recovery", createdAt: 1, tabs },
      ...(workspace.history ?? [])
    ]
  })),
  sanitizeWorkspace: vi.fn((workspace) => workspace)
}))

vi.mock("~lib/workspacesQueue", () => ({
  applyWorkspacesUpdate: vi.fn(async (updater) => {
    const next = await updater(state.workspaces)
    state.workspaces = next
    return next
  })
}))

vi.mock("./TabOrchestrator", () => ({
  tabOrchestrator: orchestrator
}))

vi.mock("./workspaceAutosave", () => ({
  flushWorkspaceWindowAutosave: vi.fn(async (windowId: number) => {
    const binding = state.bindings[String(windowId)]
    return binding?.stale
      ? { status: "stale", workspaceId: binding.workspaceId }
      : { status: "unchanged", workspaceId: binding?.workspaceId }
  }),
  resumeWorkspaceWindowAutosave: vi.fn(),
  suppressWorkspaceWindowAutosave: vi.fn()
}))

vi.mock("./workspaceWindowTabs", () => ({
  assertNormalWindow: vi.fn(async (windowId: number) => ({ id: windowId })),
  captureWorkspaceWindowTabs: vi.fn(async ({ windowId }) => [
    { url: `https://source-${windowId}.example` }
  ]),
  resolveNormalWindowId: vi.fn(async (windowId?: number) => windowId ?? 7)
}))

const workspace = (
  id: string,
  tabs: TabSpec[],
  tabsRevision: number
): Workspace => ({
  id,
  name: id,
  createdAt: 1,
  tabs,
  tabsRevision,
  history: []
})

const deferred = <T = void>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("workspaceSwitchService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).chrome = {
      alarms: {
        clear: vi.fn().mockResolvedValue(true),
        create: vi.fn()
      }
    }
    state.journal = null
    state.workspaces = [
      workspace("source", [{ url: "https://source.example" }], 0),
      workspace("target", [{ url: "https://target.example" }], 2)
    ]
    state.bindings = {
      "7": {
        workspaceId: "source",
        tabsRevision: 0,
        updatedAt: 1
      },
      "8": {
        workspaceId: "source",
        tabsRevision: 0,
        updatedAt: 1
      }
    }
    orchestrator.switchWorkspace.mockImplementation(
      async (_windowId, _tabs, options) => {
        await options.onBeforeCommit?.()
        return undefined
      }
    )
  })

  it("updates the window binding only after the tab transaction commits", async () => {
    const committed = deferred()
    const release = deferred()
    orchestrator.switchWorkspace.mockImplementationOnce(
      async (_windowId, _tabs, options) => {
        await options.onBeforeCommit?.()
        committed.resolve()
        await release.promise
        return undefined
      }
    )

    const pending = requestCurrentWindowWorkspaceSwitch("target", {
      preferredWindowId: 7
    })
    await committed.promise

    expect(state.bindings["7"].workspaceId).toBe("source")
    expect(setWorkspaceWindowBinding).not.toHaveBeenCalled()

    release.resolve()
    await expect(pending).resolves.toEqual({ success: true })
    expect(state.bindings["7"]).toMatchObject({
      workspaceId: "target",
      tabsRevision: 2,
      stale: false
    })
    expect(state.journal).toBeNull()
    expect(resumeWorkspaceWindowAutosave).toHaveBeenLastCalledWith(7, {
      discardPending: true
    })
  })

  it("persists batch preparation progress without committing the binding", async () => {
    state.workspaces[1] = workspace(
      "target",
      Array.from({ length: 13 }, (_, index) => ({
        url: `https://target-${index}.example`
      })),
      2
    )
    const progressReported = deferred()
    const releaseCommit = deferred()
    orchestrator.switchWorkspace.mockImplementationOnce(
      async (_windowId, _tabs, options) => {
        await options.onBatchPrepared?.({
          preparedCount: 6,
          batchSize: 6,
          remainingCount: 7
        })
        await options.onBatchPrepared?.({
          preparedCount: 12,
          batchSize: 6,
          remainingCount: 1
        })
        progressReported.resolve()
        await releaseCommit.promise
        await options.onBeforeCommit?.()
      }
    )

    const pending = requestCurrentWindowWorkspaceSwitch("target", {
      preferredWindowId: 7
    })
    await progressReported.promise

    expect(state.journal).toMatchObject({
      phase: "preparing",
      expectedCount: 13,
      openedCount: 12,
      completedCount: 12
    })
    expect(state.bindings["7"].workspaceId).toBe("source")

    releaseCommit.resolve()
    await expect(pending).resolves.toEqual({ success: true })
  })

  it("cancels an in-flight switch and commits only the latest intent", async () => {
    state.workspaces.push(
      workspace("middle-target", [{ url: "https://middle.example" }], 3),
      workspace("latest-target", [{ url: "https://latest.example" }], 4)
    )
    const started = deferred()
    let firstSignal: AbortSignal | undefined
    orchestrator.switchWorkspace.mockImplementationOnce(
      async (_windowId, _tabs, options) => {
        firstSignal = options.signal
        started.resolve()
        await new Promise<void>((_resolve, reject) => {
          const rejectAborted = () =>
            reject(new Error("workspace-switch-aborted"))
          if (options.signal?.aborted) {
            rejectAborted()
            return
          }
          options.signal?.addEventListener("abort", rejectAborted, {
            once: true
          })
        })
      }
    )

    const first = requestCurrentWindowWorkspaceSwitch("target", {
      preferredWindowId: 7
    })
    await started.promise

    const middle = requestCurrentWindowWorkspaceSwitch("middle-target", {
      preferredWindowId: 7
    })
    const latest = requestCurrentWindowWorkspaceSwitch("latest-target", {
      preferredWindowId: 7
    })

    await expect(first).resolves.toEqual({ success: true })
    await expect(middle).resolves.toEqual({ success: true })
    await expect(latest).resolves.toEqual({ success: true })
    expect(firstSignal?.aborted).toBe(true)
    expect(orchestrator.switchWorkspace).toHaveBeenCalledTimes(3)
    expect(state.bindings["7"]).toMatchObject({
      workspaceId: "latest-target",
      tabsRevision: 4,
      stale: false
    })
  })

  it("ignores an older click whose window lookup finishes after the latest click", async () => {
    state.workspaces.push(
      workspace("latest-target", [{ url: "https://latest.example" }], 4)
    )
    const delayedWindow = deferred<number>()
    vi.mocked(resolveNormalWindowId)
      .mockImplementationOnce(() => delayedWindow.promise)
      .mockResolvedValueOnce(7)

    const older = requestCurrentWindowWorkspaceSwitch("target", {
      preferredWindowId: 7
    })
    const latest = requestCurrentWindowWorkspaceSwitch("latest-target", {
      preferredWindowId: 7
    })

    await expect(latest).resolves.toEqual({ success: true })
    delayedWindow.resolve(7)
    await expect(older).resolves.toEqual({ success: true })

    expect(orchestrator.switchWorkspace).toHaveBeenCalledTimes(1)
    expect(state.bindings["7"]).toMatchObject({
      workspaceId: "latest-target",
      tabsRevision: 4,
      stale: false
    })
  })

  it("lets two windows use the same collection without switching each other", async () => {
    await requestCurrentWindowWorkspaceSwitch("target", {
      preferredWindowId: 7
    })
    await requestCurrentWindowWorkspaceSwitch("target", {
      preferredWindowId: 8
    })

    expect(orchestrator.switchWorkspace).toHaveBeenNthCalledWith(
      1,
      7,
      state.workspaces[1].tabs,
      expect.any(Object)
    )
    expect(orchestrator.switchWorkspace).toHaveBeenNthCalledWith(
      2,
      8,
      state.workspaces[1].tabs,
      expect.any(Object)
    )
    expect(state.bindings["7"].workspaceId).toBe("target")
    expect(state.bindings["8"].workspaceId).toBe("target")
    expect(captureWorkspaceWindowTabs).toHaveBeenCalledWith(
      expect.objectContaining({ windowId: 7 })
    )
    expect(captureWorkspaceWindowTabs).toHaveBeenCalledWith(
      expect.objectContaining({ windowId: 8 })
    )
  })

  it("restores the source in the same window when target switching fails", async () => {
    orchestrator.switchWorkspace
      .mockRejectedValueOnce(new Error("target-failed"))
      .mockResolvedValueOnce(undefined)

    await expect(
      requestCurrentWindowWorkspaceSwitch("target", {
        preferredWindowId: 7
      })
    ).resolves.toEqual({
      success: false,
      reason: "target-failed",
      error: "target-failed"
    })

    expect(orchestrator.switchWorkspace).toHaveBeenNthCalledWith(
      2,
      7,
      [{ url: "https://source-7.example" }],
      expect.any(Object)
    )
    expect(state.bindings["7"].workspaceId).toBe("source")
    expect(state.bindings["8"].workspaceId).toBe("source")
    expect(state.journal).toBeNull()
    expect(resumeWorkspaceWindowAutosave).toHaveBeenLastCalledWith(7, {
      discardPending: true
    })
  })

  it("switches from a window that changes during capture without saving partial tabs", async () => {
    vi.mocked(flushWorkspaceWindowAutosave).mockRejectedValueOnce(
      new Error("workspace-autosave-tabs-changed-during-capture")
    )
    vi.mocked(captureWorkspaceWindowTabs).mockRejectedValueOnce(
      new Error("workspace-window-tabs-busy")
    )

    await expect(
      requestCurrentWindowWorkspaceSwitch("target", {
        preferredWindowId: 7
      })
    ).resolves.toEqual({ success: true })

    expect(orchestrator.switchWorkspace).toHaveBeenCalledTimes(1)
    expect(state.workspaces[0].tabs).toEqual([
      { url: "https://source.example" }
    ])
    expect(resumeWorkspaceWindowAutosave).toHaveBeenLastCalledWith(7, {
      discardPending: true
    })
  })

  it("switches from a loading window without saving its partial tabs", async () => {
    vi.mocked(flushWorkspaceWindowAutosave).mockRejectedValueOnce(
      new Error("workspace-window-tabs-busy")
    )
    vi.mocked(captureWorkspaceWindowTabs).mockRejectedValueOnce(
      new Error("workspace-window-tabs-busy")
    )
    orchestrator.switchWorkspace.mockImplementationOnce(
      async (_windowId, _tabs, options) => {
        expect(state.journal?.sourceSnapshot?.tabs).toEqual([
          { url: "https://source.example" }
        ])
        await options.onBeforeCommit?.()
      }
    )

    await expect(
      requestCurrentWindowWorkspaceSwitch("target", {
        preferredWindowId: 7
      })
    ).resolves.toEqual({ success: true })

    expect(orchestrator.switchWorkspace).toHaveBeenCalledTimes(1)
    expect(state.bindings["7"]).toMatchObject({
      workspaceId: "target",
      tabsRevision: 2,
      stale: false
    })
    expect(state.workspaces[0].tabs).toEqual([
      { url: "https://source.example" }
    ])
  })

  it("discards pending autosave when switch recovery fails", async () => {
    orchestrator.switchWorkspace
      .mockRejectedValueOnce(new Error("target-failed"))
      .mockRejectedValueOnce(new Error("recovery-failed"))

    await expect(
      requestCurrentWindowWorkspaceSwitch("target", {
        preferredWindowId: 7
      })
    ).resolves.toEqual({
      success: false,
      reason: "recovery_required",
      error: "recovery-failed"
    })

    expect(resumeWorkspaceWindowAutosave).toHaveBeenLastCalledWith(7, {
      discardPending: true
    })
  })

  it("creates an orphan recovery workspace if the source was deleted mid-switch", async () => {
    orchestrator.switchWorkspace.mockImplementationOnce(async () => {
      state.workspaces = state.workspaces.filter(
        (workspace) => workspace.id !== "source"
      )
      throw new Error("target-failed")
    })

    await requestCurrentWindowWorkspaceSwitch("target", {
      preferredWindowId: 7
    })

    expect(state.bindings["7"]).toBeUndefined()
    expect(state.workspaces[0]).toMatchObject({
      id: "run-1",
      emoji: "🛟",
      tabs: [{ url: "https://source-7.example" }]
    })
    expect(state.journal).toBeNull()
  })

  it("keeps a recovered stale source read-only after a failed switch", async () => {
    state.workspaces[0] = {
      ...state.workspaces[0],
      tabsRevision: 1,
      tabs: [{ url: "https://canonical-newer.example" }]
    }
    state.bindings["7"] = {
      ...state.bindings["7"],
      stale: true
    }
    orchestrator.switchWorkspace.mockRejectedValueOnce(
      new Error("target-failed")
    )

    await requestCurrentWindowWorkspaceSwitch("target", {
      preferredWindowId: 7
    })

    expect(state.bindings["7"]).toMatchObject({
      workspaceId: "source",
      tabsRevision: 0,
      stale: true
    })
    expect(state.workspaces[0].tabs).toEqual([
      { url: "https://canonical-newer.example" }
    ])
  })
})
