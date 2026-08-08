import type { BackupRestoreJournal } from "./services/restoreJournal"

type BackupRestorePhase = BackupRestoreJournal["phase"]

type BackupRestoreCleanupDependencies = {
  readPhase: () => Promise<BackupRestorePhase | null>
  recoverCommitted: () => Promise<unknown>
  recoverUncommitted: () => Promise<unknown>
  clearAlarm: () => Promise<unknown>
  scheduleRetry: () => void
}

export const runBackupRestoreCleanupAlarm = async (
  dependencies: BackupRestoreCleanupDependencies
) => {
  try {
    const phase = await dependencies.readPhase()
    if (!phase) {
      await dependencies.clearAlarm()
      return "no-journal" as const
    }

    if (phase === "committed") {
      await dependencies.recoverCommitted()
    } else {
      await dependencies.recoverUncommitted()
    }
    await dependencies.clearAlarm()
    return "cleaned" as const
  } catch (error) {
    dependencies.scheduleRetry()
    throw error
  }
}
