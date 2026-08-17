import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  runWorkspaceDataOperation,
  withWorkspaceControllerMaintenance
} from "./workspaceController"

const storage = vi.hoisted(() => ({
  getWorkspaceWindowBinding: vi.fn()
}))
const autosave = vi.hoisted(() => ({
  flushAllWorkspaceWindowAutosaves: vi.fn(),
  flushWorkspaceWindowAutosave: vi.fn(),
  markOtherWorkspaceBindingsStale: vi.fn()
}))
const switching = vi.hoisted(() => ({
  abortCurrentWorkspaceSwitch: vi.fn(),
  recoverPendingWorkspaceSwitch: vi.fn(),
  requestCurrentWindowWorkspaceSwitch: vi.fn()
}))

vi.mock("~core/storage", () => ({
  getWorkspaceWindowBinding: storage.getWorkspaceWindowBinding,
  loadSettings: vi.fn(),
  loadWorkspaces: vi.fn(),
  removeWorkspaceWindowBinding: vi.fn()
}))

vi.mock("./services/closingTabs", () => ({
  isTabClosing: vi.fn(() => false),
  unmarkTabClosing: vi.fn()
}))

vi.mock("./services/workspaceShortcutSwitch", () => ({
  requestAdjacentWorkspaceSwitch: vi.fn()
}))

vi.mock("./services/workspaceAutosave", () => ({
  flushAllWorkspaceWindowAutosaves: autosave.flushAllWorkspaceWindowAutosaves,
  flushWorkspaceWindowAutosave: autosave.flushWorkspaceWindowAutosave,
  markOtherWorkspaceBindingsStale: autosave.markOtherWorkspaceBindingsStale,
  noteWorkspaceWindowMutation: vi.fn()
}))

vi.mock("./services/workspaceSwitchService", () => ({
  abortCurrentWorkspaceSwitch: switching.abortCurrentWorkspaceSwitch,
  clearCurrentWindowWorkspaceBinding: vi.fn(),
  discardPendingWorkspaceSwitch: vi.fn(),
  handleWorkspaceSwitchTimeoutAlarm: vi.fn(),
  recoverPendingWorkspaceSwitch: switching.recoverPendingWorkspaceSwitch,
  requestCurrentWindowWorkspaceSwitch:
    switching.requestCurrentWindowWorkspaceSwitch
}))

vi.mock("./services/workspaceTabWarmup", () => ({
  cancelWorkspaceTabWarmup: vi.fn(),
  handleWorkspaceTabWarmupActivated: vi.fn(),
  handleWorkspaceTabWarmupAlarm: vi.fn(),
  handleWorkspaceTabWarmupRemoved: vi.fn(),
  handleWorkspaceTabWarmupUpdated: vi.fn(),
  resumeWorkspaceTabWarmups: vi.fn()
}))

vi.mock("./services/workspaceWindowTabs", () => ({
  assertNormalWindow: vi.fn(),
  resolveNormalWindowId: vi.fn(async (windowId?: number) => windowId ?? 7)
}))

const event = () => ({ addListener: vi.fn() })

describe("runWorkspaceDataOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).chrome = {
      alarms: { onAlarm: event() },
      tabs: {
        onActivated: event(),
        onAttached: event(),
        onCreated: event(),
        onDetached: event(),
        onMoved: event(),
        onRemoved: event(),
        onUpdated: event()
      },
      windows: { onRemoved: event() }
    }
    storage.getWorkspaceWindowBinding.mockResolvedValue({
      workspaceId: "current",
      tabsRevision: 0,
      updatedAt: 1
    })
    autosave.flushWorkspaceWindowAutosave.mockResolvedValue({
      status: "unchanged",
      workspaceId: "current"
    })
    switching.recoverPendingWorkspaceSwitch.mockResolvedValue(true)
    switching.abortCurrentWorkspaceSwitch.mockResolvedValue(false)
    autosave.flushAllWorkspaceWindowAutosaves.mockResolvedValue(undefined)
    switching.requestCurrentWindowWorkspaceSwitch.mockResolvedValue({
      success: true
    })
  })

  it("does not reload bindings for a no-op mutation", async () => {
    await runWorkspaceDataOperation(async () => undefined, {
      materializeWorkspaceIds: () => [],
      preferredWindowId: 7
    })

    expect(autosave.markOtherWorkspaceBindingsStale).not.toHaveBeenCalled()
    expect(switching.requestCurrentWindowWorkspaceSwitch).not.toHaveBeenCalled()
  })

  it("can create an unrelated record without flushing a busy window", async () => {
    const task = vi.fn().mockResolvedValue("created")

    await expect(
      runWorkspaceDataOperation(task, {
        materializeWorkspaceIds: [],
        preferredWindowId: 7,
        flushPreferredWindowAutosave: false
      })
    ).resolves.toBe("created")

    expect(autosave.flushWorkspaceWindowAutosave).not.toHaveBeenCalled()
    expect(task).toHaveBeenCalledTimes(1)
  })

  it("reloads the acting window while only staling other copies", async () => {
    await runWorkspaceDataOperation(async () => undefined, {
      materializeWorkspaceIds: () => ["current"],
      preferredWindowId: 7
    })

    expect(autosave.markOtherWorkspaceBindingsStale).toHaveBeenCalledWith(
      "current",
      7
    )
    expect(switching.requestCurrentWindowWorkspaceSwitch).toHaveBeenCalledWith(
      "current",
      { preferredWindowId: 7, skipSourceSave: true }
    )
  })

  it("stales every copy of a changed non-current workspace", async () => {
    await runWorkspaceDataOperation(async () => undefined, {
      materializeWorkspaceIds: ["other"],
      preferredWindowId: 7
    })

    expect(autosave.markOtherWorkspaceBindingsStale).toHaveBeenCalledWith(
      "other",
      undefined
    )
    expect(switching.requestCurrentWindowWorkspaceSwitch).not.toHaveBeenCalled()
  })

  it("blocks new data operations while maintenance drains active work", async () => {
    let releaseActive: () => void = () => undefined
    const activeHold = new Promise<void>((resolve) => {
      releaseActive = resolve
    })
    const events: string[] = []

    const active = runWorkspaceDataOperation(async () => {
      events.push("active-start")
      await activeHold
      events.push("active-end")
    })
    await vi.waitFor(() => expect(events).toEqual(["active-start"]))

    switching.abortCurrentWorkspaceSwitch.mockImplementationOnce(async () => {
      events.push("abort-switch")
      releaseActive()
      return true
    })
    const maintenance = withWorkspaceControllerMaintenance(async () => {
      events.push("maintenance")
    })
    const queued = runWorkspaceDataOperation(async () => {
      events.push("queued-normal")
    })

    await Promise.all([active, maintenance, queued])
    expect(events).toEqual([
      "active-start",
      "abort-switch",
      "active-end",
      "maintenance",
      "queued-normal"
    ])
    expect(autosave.flushAllWorkspaceWindowAutosaves).toHaveBeenCalledOnce()
  })
})
