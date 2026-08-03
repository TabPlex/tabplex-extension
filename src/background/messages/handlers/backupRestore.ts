import { loadSettings, loadWorkspaces, loadWorkspaceState } from "~core/storage"
import { DEFAULT_WORKSPACE_STATE } from "~core/types"
import {
  BackupValidationError,
  createBackupV3,
  createImportPlan,
  parseBackupFile,
  type ImportMode,
  type ImportPlan
} from "~features/backup"

import { disconnectAgentControl } from "../../agentControl"
import { withAgentOperationLock } from "../../agentOperationGate"
import {
  BACKUP_RESTORE_CLEANUP_ALARM,
  BackupRestoreError,
  restoreBackupWithPlanFactory,
  withConsistentBackupSnapshot
} from "../../services/backupRestoreService"
import {
  abortCurrentSwitch,
  withWorkspaceControllerMaintenance
} from "../../workspaceController"
import type { BackgroundMessageHandler } from "../types"

type BackupRestoreHandlerDeps = {
  parseBackupFile: typeof parseBackupFile
  createBackupV3: typeof createBackupV3
  createImportPlan: typeof createImportPlan
  loadWorkspaces: typeof loadWorkspaces
  loadWorkspaceState: typeof loadWorkspaceState
  loadSettings: typeof loadSettings
  restoreWithPlanFactory: typeof restoreBackupWithPlanFactory
  withConsistentSnapshot: typeof withConsistentBackupSnapshot
  abortSwitch: (reason: string) => Promise<unknown>
  withControllerMaintenance: <T>(task: () => Promise<T>) => Promise<T>
  withAgentOperation: typeof withAgentOperationLock
  revokeAgentAccess: typeof disconnectAgentControl
  scheduleCleanupRetry: () => void
  getExtensionVersion: () => string
}

const knownErrorCode = (error: unknown) => {
  if (
    error instanceof BackupValidationError ||
    error instanceof BackupRestoreError
  ) {
    return error.code
  }
  return "backup-restore-failed"
}

const isImportMode = (value: unknown): value is ImportMode =>
  value === "merge" || value === "replace"

const createCurrentBackup = async (deps: BackupRestoreHandlerDeps) => {
  const [workspaces, workspaceState, settings] = await Promise.all([
    deps.loadWorkspaces(),
    deps.loadWorkspaceState(),
    deps.loadSettings()
  ])
  return deps.createBackupV3(
    { workspaces, workspaceState, settings },
    { extensionVersion: deps.getExtensionVersion() }
  )
}

export const createBackupRestoreMessageHandler = (
  deps: BackupRestoreHandlerDeps
): BackgroundMessageHandler => {
  return (message, sendResponse) => {
    if (message.action === "export") {
      void deps
        .withConsistentSnapshot(() => createCurrentBackup(deps), {
          abortSwitch: deps.abortSwitch,
          withControllerMaintenance: deps.withControllerMaintenance,
          withAgentOperation: deps.withAgentOperation
        })
        .then(
          (result) => sendResponse({ ok: true, result }),
          (error) => {
            console.warn("[TabPlex] message:backup-export failed", error)
            sendResponse({ ok: false, error: knownErrorCode(error) })
          }
        )
      return true
    }

    if (
      message.action !== "restore" ||
      typeof message.raw !== "string" ||
      !isImportMode(message.mode) ||
      typeof message.includeSettings !== "boolean"
    ) {
      sendResponse({ ok: false, error: "invalid-backup-restore-request" })
      return true
    }

    void (async () => {
      const parsed = await deps.parseBackupFile(message.raw as string)
      const committedPlan: { current?: ImportPlan } = {}
      const result = await deps.restoreWithPlanFactory(
        async () => {
          const current =
            message.mode === "replace"
              ? await deps.createBackupV3(
                  {
                    workspaces: [],
                    workspaceState: DEFAULT_WORKSPACE_STATE,
                    settings: await deps.loadSettings()
                  },
                  { extensionVersion: deps.getExtensionVersion() }
                )
              : await createCurrentBackup(deps)
          const plan = deps.createImportPlan({
            mode: message.mode as ImportMode,
            current: current.backup.payload,
            incoming: parsed.payload,
            includeSettings: message.includeSettings as boolean
          })
          committedPlan.current = plan
          return plan
        },
        {
          abortSwitch: deps.abortSwitch,
          withControllerMaintenance: deps.withControllerMaintenance,
          withAgentOperation: deps.withAgentOperation,
          revokeAgentAccess: deps.revokeAgentAccess
        }
      )
      if (!committedPlan.current) {
        throw new BackupRestoreError("backup-restore-plan-missing")
      }
      if (result.cleanupPending) deps.scheduleCleanupRetry()
      return {
        transactionId: result.transactionId,
        cleanupPending: result.cleanupPending,
        sourceVersion: parsed.sourceVersion,
        integrity: parsed.integrity,
        warnings: parsed.warnings,
        summary: committedPlan.current.summary
      }
    })().then(
      (result) => sendResponse({ ok: true, result }),
      (error) => {
        console.warn("[TabPlex] message:backup-restore failed", error)
        sendResponse({ ok: false, error: knownErrorCode(error) })
      }
    )
    return true
  }
}

export const handleBackupRestoreMessage = createBackupRestoreMessageHandler({
  parseBackupFile,
  createBackupV3,
  createImportPlan,
  loadWorkspaces,
  loadWorkspaceState,
  loadSettings,
  restoreWithPlanFactory: restoreBackupWithPlanFactory,
  withConsistentSnapshot: withConsistentBackupSnapshot,
  abortSwitch: abortCurrentSwitch,
  withControllerMaintenance: withWorkspaceControllerMaintenance,
  withAgentOperation: withAgentOperationLock,
  revokeAgentAccess: disconnectAgentControl,
  scheduleCleanupRetry: () => {
    void chrome.alarms.create(BACKUP_RESTORE_CLEANUP_ALARM, {
      delayInMinutes: 1
    })
  },
  getExtensionVersion: () => chrome.runtime.getManifest().version
})
