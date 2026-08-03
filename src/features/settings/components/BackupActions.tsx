import React, { useRef, useState, type ChangeEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "~components/ui/button"
import {
  downloadFullBackup,
  readFullBackupFile,
  requestFullBackupExport,
  requestFullBackupImport,
  toBackupErrorCode
} from "~features/settings/logic/fullBackupActions"

type BackupActionsProps = {
  onBeforeAction: () => Promise<void>
}

type BusyAction = "export" | "import" | null
export const BackupActions = ({ onBeforeAction }: BackupActionsProps) => {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [error, setError] = useState<string | null>(null)

  const errorText = (error: unknown) => {
    const code = toBackupErrorCode(error)
    const translationCode = code.startsWith(
      "backup-restore-quota-exceeded:local"
    )
      ? "quotaLocal"
      : code.startsWith("backup-restore-quota-exceeded:sync") ||
          code.startsWith("backup-restore-item-quota-exceeded:sync")
        ? "quotaSync"
        : code.startsWith("backup-restore-item-quota-exceeded:local")
          ? "quotaLocal"
          : code
    return t("settings.recoveryCenter.errors." + translationCode, {
      defaultValue: t("settings.recoveryCenter.errors.generic")
    })
  }

  const handleExport = async () => {
    if (busy) return
    setBusy("export")
    setError(null)
    try {
      await onBeforeAction()
      const { backup, warnings } = await requestFullBackupExport()
      downloadFullBackup(backup)
      toast.success(
        t(
          warnings.length
            ? "storage.backup.exportedWithWarnings"
            : "storage.backup.exported",
          {
            count: backup.payload.workspaces.length,
            warningCount: warnings.length
          }
        ),
        { duration: 1800 }
      )
    } catch (error) {
      setError(errorText(error))
    } finally {
      setBusy(null)
    }
  }

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || busy) return

    setBusy("import")
    setError(null)
    try {
      const raw = await readFullBackupFile(file)
      if (!window.confirm(t("storage.backup.importConfirm"))) return
      await onBeforeAction()
      const result = await requestFullBackupImport(raw)
      toast.success(
        t(
          result.cleanupPending
            ? "storage.backup.restoredCleanupPending"
            : "storage.backup.restored",
          { count: result.importedWorkspaces }
        ),
        { duration: 1800 }
      )
    } catch (error) {
      setError(errorText(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="setting-row settings-backup-row">
      <div className="setting-info min-w-0">
        <span className="setting-title">{t("storage.backup.title")}</span>
        <span className="setting-desc">{t("storage.backup.desc")}</span>
        {error ? (
          <span
            className="setting-hint setting-hint-error"
            role="alert"
            aria-live="assertive">
            {error}
          </span>
        ) : null}
      </div>
      <div className="setting-actions settings-backup-actions">
        <Button
          size="sm"
          variant="ghost"
          className="settings-text-action settings-backup-action"
          disabled={!!busy}
          onClick={() => void handleExport()}
          type="button">
          {busy === "export"
            ? t("storage.backup.exporting")
            : t("storage.backup.export")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="settings-text-action settings-backup-action"
          disabled={!!busy}
          onClick={() => fileInputRef.current?.click()}
          type="button">
          {busy === "import"
            ? t("storage.backup.importing")
            : t("storage.backup.import")}
        </Button>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          tabIndex={-1}
          aria-label={t("storage.backup.import")}
          onChange={(event) => void handleImportFile(event)}
        />
      </div>
    </div>
  )
}
