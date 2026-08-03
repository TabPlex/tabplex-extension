import { memo } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~components/ui/button"
import { SettingsIcon } from "~components/ui/settings"

interface UserMenuProps {
  onShowSettings: () => void
}

export const UserMenu = memo(function UserMenu({
  onShowSettings
}: UserMenuProps) {
  const { t } = useTranslation()

  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={t("settings.title")}
      title={t("settings.title")}
      className="home-action-button home-action-utility"
      onClick={onShowSettings}>
      <SettingsIcon />
    </Button>
  )
})
