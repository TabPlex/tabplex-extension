import { useRef } from "react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "~components/ui/dialog"
import { requestSettingsDialogClose } from "~features/settings/logic/settingsDialogLifecycle"

import { SettingsSurface, type SettingsSurfaceHandle } from "./SettingsSurface"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  localStorageBytes: number
  flushPendingNotes?: () => Promise<void>
}

export const SettingsDialog = ({
  open,
  onOpenChange,
  localStorageBytes,
  flushPendingNotes
}: SettingsDialogProps) => {
  const { t } = useTranslation()
  const surfaceRef = useRef<SettingsSurfaceHandle>(null)

  const handleSettingsOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true)
      return
    }
    void requestSettingsDialogClose({
      flushPendingChanges: async () => {
        await surfaceRef.current?.flushPendingChanges()
      },
      close: () => onOpenChange(false),
      onFlushError: (error) => {
        console.warn("[TabPlex] 关闭设置前保存失败", error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleSettingsOpenChange}>
      <DialogContent className="settings-dialog" aria-describedby={undefined}>
        <DialogHeader className="settings-dialog-header">
          <DialogTitle>{t("settings.title")}</DialogTitle>
        </DialogHeader>
        <SettingsSurface
          ref={surfaceRef}
          storageUsage={{ status: "ready", bytes: localStorageBytes }}
          flushPendingNotes={flushPendingNotes}
          sectionHeadingLevel="h3"
        />
      </DialogContent>
    </Dialog>
  )
}
