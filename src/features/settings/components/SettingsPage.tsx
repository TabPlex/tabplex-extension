import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { AppToaster } from "~components/ui/app-toaster"
import { useTheme } from "~features/home/useTheme"
import { useLocalStorageUsage } from "~features/settings/hooks/useLocalStorageUsage"
import { useWorkspaceManager } from "~hooks/useWorkspaceManager"

import { SettingsSurface } from "./SettingsSurface"

export const SettingsPage = () => {
  const { t, i18n } = useTranslation()
  const { settings, version } = useWorkspaceManager()
  const storageUsage = useLocalStorageUsage()

  useTheme(settings)

  useEffect(() => {
    if (settings.language === i18n.language) return
    void i18n.changeLanguage(settings.language)
  }, [i18n, settings.language])

  return (
    <>
      <AppToaster />
      <div className="options-root settings-page">
        <header className="options-header settings-page-header">
          <div className="settings-page-heading">
            <h1 className="options-title">{t("settings.title")}</h1>
            <p className="settings-page-description">
              {t("settings.description")}
            </p>
          </div>
          <span className="options-meta">TabPlex v{version}</span>
        </header>

        <main className="options-panel settings-page-panel">
          <SettingsSurface
            storageUsage={storageUsage}
            sectionHeadingLevel="h2"
          />
        </main>
      </div>
    </>
  )
}
