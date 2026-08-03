import { BackupValidationError } from "./errors"
import { BACKUP_LIMITS } from "./limits"
import type { BackupWarning } from "./types"

export const pushBackupWarning = (
  warnings: BackupWarning[],
  warning: BackupWarning
) => {
  if (warnings.length >= BACKUP_LIMITS.maxWarnings) {
    throw new BackupValidationError("count-limit-exceeded", "$.warnings")
  }
  warnings.push(warning)
}
