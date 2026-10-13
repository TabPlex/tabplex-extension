import { memo } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~components/ui/button"
import { DeleteIcon } from "~components/ui/delete"
import { SettingsIcon } from "~components/ui/settings"

interface UserMenuProps {
  onShowSettings: () => void
  onShowTrash: () => void
  trashCount: number
}

export const UserMenu = memo(function UserMenu({
  onShowSettings,
  onShowTrash,
  trashCount
}: UserMenuProps) {
  const { t } = useTranslation()

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        aria-label={t("home.trash.title")}
        title={t("home.trash.tooltip", { count: trashCount })}
        className="home-action-button home-action-utility"
        onClick={onShowTrash}>
        <DeleteIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label={t("settings.title")}
        title={t("settings.title")}
        className="home-action-button home-action-utility"
        onClick={onShowSettings}>
        <SettingsIcon />
      </Button>
    </>
  )
})
