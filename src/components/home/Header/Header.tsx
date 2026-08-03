import { memo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { WorkspaceSwitchProgress } from "~components/WorkspaceSwitchProgress"
import { getTabplexWebsiteUrl } from "~core/utils/tabplexUrls"
import type { HomeNotice } from "~features/home/notice"

import { UserMenu } from "./UserMenu"

interface HeaderProps {
  createAction: ReactNode
  onShowSettings: () => void
  notice: HomeNotice
}

export const Header = memo(function Header({
  createAction,
  onShowSettings,
  notice
}: HeaderProps) {
  const { t, i18n } = useTranslation()
  const websiteUrl = getTabplexWebsiteUrl(
    i18n.resolvedLanguage ?? i18n.language
  )
  const manifestIcons =
    typeof chrome !== "undefined" && chrome.runtime?.getManifest
      ? chrome.runtime.getManifest().icons
      : undefined
  const manifestIconPath = manifestIcons?.["32"] ?? manifestIcons?.["48"]
  const brandIconUrl =
    typeof chrome !== "undefined" && chrome.runtime?.getURL && manifestIconPath
      ? chrome.runtime.getURL(manifestIconPath)
      : "icon.png"

  const handleOpenWebsite = () => {
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      void chrome.tabs.create({ url: websiteUrl })
      return
    }

    if (typeof window !== "undefined") {
      window.open(websiteUrl, "_blank", "noopener,noreferrer")
    }
  }

  return (
    <header className="home-header">
      <div className="home-title">
        <button
          type="button"
          className="home-brand-link"
          onClick={handleOpenWebsite}
          aria-label={t("common.visitWebsite")}>
          <img
            src={brandIconUrl}
            alt=""
            aria-hidden="true"
            width={24}
            height={24}
            className="home-brand-icon"
          />
          <span className="home-brand">TabPlex</span>
        </button>
      </div>
      <WorkspaceSwitchProgress notice={notice} />
      <div className="home-header-actions">
        <div className="home-header-secondary">{createAction}</div>
        <div className="home-header-primary">
          <UserMenu onShowSettings={onShowSettings} />
        </div>
      </div>
    </header>
  )
})
