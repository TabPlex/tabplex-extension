import {
  BACKUP_LIMITS,
  BackupValidationError,
  parseBackupFile,
  type BackupWarning,
  type TabPlexBackupV3
} from "~features/backup"

type FullBackupExportResult = {
  backup: TabPlexBackupV3
  warnings: BackupWarning[]
}

type FullBackupImportResult = {
  importedWorkspaces: number
  cleanupPending: boolean
}

const isBackup = (value: unknown): value is TabPlexBackupV3 => {
  if (!value || typeof value !== "object") return false
  const backup = value as Partial<TabPlexBackupV3>
  return (
    backup.schema === "tabplex-backup" &&
    backup.version === 3 &&
    typeof backup.exportedAt === "string" &&
    Array.isArray(backup.payload?.workspaces)
  )
}

export const toBackupErrorCode = (error: unknown) => {
  if (error instanceof BackupValidationError) return error.code
  if (error instanceof Error && /^[a-z0-9:-]+$/i.test(error.message)) {
    return error.message
  }
  return "backup-restore-failed"
}

export const readFullBackupFile = async (file: File) => {
  if (file.size > BACKUP_LIMITS.maxBytes) {
    throw new BackupValidationError("backup-too-large")
  }
  const raw = await file.text()
  await parseBackupFile(raw)
  return raw
}

export const requestFullBackupExport =
  async (): Promise<FullBackupExportResult> => {
    const response = await chrome.runtime.sendMessage({
      _tabplex: true,
      type: "backup-restore",
      action: "export"
    })
    const backup = response?.result?.backup
    if (!response || response.ok !== true || !isBackup(backup)) {
      throw new Error(response?.error || "backup-export-failed")
    }
    return {
      backup,
      warnings: Array.isArray(response.result?.warnings)
        ? (response.result.warnings as BackupWarning[])
        : []
    }
  }

export const requestFullBackupImport = async (
  raw: string
): Promise<FullBackupImportResult> => {
  const response = await chrome.runtime.sendMessage({
    _tabplex: true,
    type: "backup-restore",
    action: "restore",
    raw,
    mode: "replace",
    includeSettings: true
  })
  if (!response || response.ok !== true) {
    throw new Error(response?.error || "backup-restore-failed")
  }
  return {
    importedWorkspaces:
      Number(response.result?.summary?.importedWorkspaces) || 0,
    cleanupPending: response.result?.cleanupPending === true
  }
}

export const downloadFullBackup = (backup: TabPlexBackupV3) => {
  const blob = new Blob([JSON.stringify(backup)], {
    type: "application/json"
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download =
    "tabplex-backup-" + backup.exportedAt.replace(/[:.]/g, "-") + ".json"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
