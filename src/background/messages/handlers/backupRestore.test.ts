import { describe, expect, it, vi } from "vitest"

import { BackupValidationError } from "~features/backup"

import { createBackupRestoreMessageHandler } from "./backupRestore"

const baseDeps = () => {
  const plan = {
    mode: "merge",
    summary: { importedWorkspaces: 1 },
    storagePolicy: {
      resetWorkspaceRuntime: false,
      clearLegacyLayouts: false,
      clearPendingAction: false,
      preserveOnboardingAndLogs: true,
      disableAgentControl: false
    }
  }
  return {
    parseBackupFile: vi.fn(async () => ({
      sourceVersion: 3,
      integrity: "checksum-verified",
      warnings: [],
      payload: { incoming: true }
    })),
    createBackupV3: vi.fn(async () => ({
      backup: { payload: { current: true } }
    })),
    createImportPlan: vi.fn(() => plan),
    loadWorkspaces: vi.fn(async () => []),
    loadWorkspaceState: vi.fn(async () => ({})),
    loadSettings: vi.fn(async () => ({})),
    restoreWithPlanFactory: vi.fn(
      async (factory: () => Promise<unknown>, _dependencies: unknown) => {
        await factory()
        return { transactionId: "transaction", cleanupPending: false }
      }
    ),
    withConsistentSnapshot: vi.fn(
      async (task: () => Promise<unknown>, _dependencies: unknown) => task()
    ),
    abortSwitch: vi.fn(async () => undefined),
    withControllerMaintenance: vi.fn(async (task) => task()),
    withAgentOperation: vi.fn(async (task) => task()),
    revokeAgentAccess: vi.fn(async () => undefined),
    scheduleCleanupRetry: vi.fn(),
    getExtensionVersion: vi.fn(() => "0.0.3")
  }
}

const dispatch = async (
  deps: ReturnType<typeof baseDeps>,
  message: Record<string, unknown>
) => {
  const handler = createBackupRestoreMessageHandler(deps as any)
  let response: unknown
  const keepAlive = handler(
    { _tabplex: true, type: "backup-restore", ...message } as any,
    (value) => {
      response = value
    }
  )
  await vi.waitFor(() => expect(response).toBeDefined())
  return { keepAlive, response }
}

describe("backup restore message handler", () => {
  it("exports a single background-owned snapshot", async () => {
    const deps = baseDeps()
    const { response } = await dispatch(deps, { action: "export" })

    expect(response).toEqual({
      ok: true,
      result: { backup: { payload: { current: true } } }
    })
    expect(deps.withConsistentSnapshot).toHaveBeenCalledOnce()
    expect(deps.createBackupV3).toHaveBeenCalledWith(
      {
        workspaces: [],
        workspaceState: {},
        settings: {}
      },
      { extensionVersion: "0.0.3" }
    )
    expect(deps.withConsistentSnapshot.mock.calls[0]?.[1]).toMatchObject({
      abortSwitch: deps.abortSwitch,
      withControllerMaintenance: deps.withControllerMaintenance,
      withAgentOperation: deps.withAgentOperation
    })
  })

  it("rebuilds the merge plan inside the transaction plan factory", async () => {
    const deps = baseDeps()
    const { keepAlive, response } = await dispatch(deps, {
      action: "restore",
      raw: "valid-backup",
      mode: "merge",
      includeSettings: false
    })

    expect(keepAlive).toBe(true)
    expect(response).toMatchObject({
      ok: true,
      result: {
        transactionId: "transaction",
        integrity: "checksum-verified",
        summary: { importedWorkspaces: 1 }
      }
    })
    expect(deps.restoreWithPlanFactory).toHaveBeenCalledOnce()
    expect(deps.restoreWithPlanFactory.mock.calls[0]?.[1]).toMatchObject({
      revokeAgentAccess: deps.revokeAgentAccess
    })
    expect(deps.createImportPlan).toHaveBeenCalledWith({
      mode: "merge",
      current: { current: true },
      incoming: { incoming: true },
      includeSettings: false
    })
  })

  it("builds replace from minimal current settings when full current data is unreadable", async () => {
    const deps = baseDeps()
    deps.loadWorkspaces.mockRejectedValue(new Error("current-too-large"))
    deps.loadWorkspaceState.mockRejectedValue(new Error("current-too-large"))

    const { response } = await dispatch(deps, {
      action: "restore",
      raw: "small-valid-backup",
      mode: "replace",
      includeSettings: false
    })

    expect(response).toMatchObject({ ok: true })
    expect(deps.loadWorkspaces).not.toHaveBeenCalled()
    expect(deps.loadWorkspaceState).not.toHaveBeenCalled()
    expect(deps.loadSettings).toHaveBeenCalledOnce()
  })

  it("rejects malformed requests before parsing", async () => {
    const deps = baseDeps()
    const { response } = await dispatch(deps, {
      action: "restore",
      raw: 123,
      mode: "merge",
      includeSettings: false
    })

    expect(response).toEqual({
      ok: false,
      error: "invalid-backup-restore-request"
    })
    expect(deps.parseBackupFile).not.toHaveBeenCalled()
  })

  it("returns a bounded validation code without leaking raw error text", async () => {
    const deps = baseDeps()
    deps.parseBackupFile.mockRejectedValue(
      new BackupValidationError("checksum-mismatch", "$.integrity.digest")
    )
    const { response } = await dispatch(deps, {
      action: "restore",
      raw: "tampered",
      mode: "replace",
      includeSettings: true
    })

    expect(response).toEqual({ ok: false, error: "checksum-mismatch" })
  })

  it("schedules journal cleanup when the committed restore could not clear it", async () => {
    const deps = baseDeps()
    deps.restoreWithPlanFactory.mockImplementation(async (factory) => {
      await factory()
      return { transactionId: "transaction", cleanupPending: true }
    })

    const { response } = await dispatch(deps, {
      action: "restore",
      raw: "valid-backup",
      mode: "merge",
      includeSettings: false
    })

    expect(response).toMatchObject({
      ok: true,
      result: { cleanupPending: true }
    })
    expect(deps.scheduleCleanupRetry).toHaveBeenCalledOnce()
  })
})
