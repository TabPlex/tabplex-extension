import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react"
import { useTranslation } from "react-i18next"

import { DEFAULT_SETTINGS } from "~core/types"
import { normalizeHex, setFormattingLocale } from "~core/utils"
import type { LocalStorageUsageState } from "~features/settings/hooks/useLocalStorageUsage"
import { copyToClipboard } from "~features/settings/utils/copyToClipboard"
import { createDebouncedAccentColorUpdater } from "~features/settings/utils/createDebouncedAccentColorUpdater"
import { useWorkspaceManager } from "~hooks/useWorkspaceManager"
import { formatLogEntries, getLogEntries } from "~lib/logger"

import {
  AboutAndDeveloperSections,
  AppearanceSettingsSection,
  ControlSettingsSection,
  StorageSettingsSection
} from "./SettingsSections"
import type { SettingsSectionHeadingLevel } from "./SettingsSectionTitle"

const ACCENT_SAVE_DEBOUNCE_MS = 800

export type SettingsSurfaceHandle = {
  flushPendingChanges: () => Promise<void>
}

type SettingsSurfaceProps = {
  storageUsage: LocalStorageUsageState
  flushPendingNotes?: () => Promise<void>
  sectionHeadingLevel: SettingsSectionHeadingLevel
}

export const SettingsSurface = forwardRef<
  SettingsSurfaceHandle,
  SettingsSurfaceProps
>(function SettingsSurface(
  { storageUsage, flushPendingNotes, sectionHeadingLevel },
  ref
) {
  const { t, i18n } = useTranslation()
  const { settings, updateSetting, version, resolvedTheme } =
    useWorkspaceManager()
  const accentColorNormalized = normalizeHex(
    settings.accentColor ?? DEFAULT_SETTINGS.accentColor ?? "#6C5CE7"
  ).toUpperCase()
  const [accentDraft, setAccentDraft] = useState(accentColorNormalized)
  const [developerVisible, setDeveloperVisible] = useState(false)
  const [onboardingStatus, setOnboardingStatus] = useState<string | null>(null)
  const [logExportStatus, setLogExportStatus] = useState<string | null>(null)
  const accentUpdaterRef = useRef(
    createDebouncedAccentColorUpdater(
      async (value) => updateSetting("accentColor", value),
      ACCENT_SAVE_DEBOUNCE_MS
    )
  )
  const devTapCountRef = useRef(0)

  useImperativeHandle(
    ref,
    () => ({
      flushPendingChanges: () => accentUpdaterRef.current.flush()
    }),
    []
  )

  useEffect(() => {
    setAccentDraft(accentColorNormalized)
  }, [accentColorNormalized])

  useEffect(() => {
    return () => {
      void accentUpdaterRef.current.dispose()
    }
  }, [])

  useEffect(() => {
    if (!logExportStatus) return
    const timer = window.setTimeout(() => setLogExportStatus(null), 3000)
    return () => window.clearTimeout(timer)
  }, [logExportStatus])

  const handleAccentChange = (value: string) => {
    const normalized = accentUpdaterRef.current.enqueue(value)
    setAccentDraft(normalized)
  }

  const handleAccentCommit = (value: string) => {
    const normalized = accentUpdaterRef.current.enqueue(value)
    setAccentDraft(normalized)
    void accentUpdaterRef.current.flush()
  }

  const handleLanguageChange = (language: "zh-CN" | "en-US") => {
    void updateSetting("language", language)
    setFormattingLocale(language)
    void i18n.changeLanguage(language)
  }

  const handleRerunOnboarding = async () => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return
    try {
      const response = await chrome.runtime.sendMessage({
        _tabplex: true,
        type: "onboarding-transition",
        action: "reset-for-developer",
        now: Date.now()
      })
      if (!response || response.ok !== true) {
        throw new Error(response?.error || "onboarding reset failed")
      }
      setOnboardingStatus(t("settings.developer.onboarding.triggered"))
    } catch (error) {
      console.warn("[TabPlex] Failed to reset onboarding", error)
    }
  }

  const buildLogText = async () => {
    const entries = await getLogEntries()
    const header = [
      "TabPlex Logs",
      `Version: ${version}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Entries: ${entries.length}`
    ].join("\n")
    const body = formatLogEntries(entries)
    return body ? `${header}\n\n${body}\n` : `${header}\n`
  }

  const handleCopyLogs = async () => {
    try {
      const copied = await copyToClipboard(await buildLogText())
      setLogExportStatus(
        t(
          copied
            ? "settings.about.feedback.copied"
            : "settings.about.feedback.copyFailed"
        )
      )
    } catch {
      setLogExportStatus(t("settings.about.feedback.copyFailed"))
    }
  }

  const handleEmailFeedback = async () => {
    const copied = await copyToClipboard(await buildLogText())
    setLogExportStatus(
      t(
        copied
          ? "settings.about.feedback.mailHint"
          : "settings.about.feedback.copyFailed"
      )
    )
    const subject = t("settings.about.feedback.emailSubject", { version })
    const body = t("settings.about.feedback.emailBody", {
      version,
      timestamp: new Date().toISOString()
    })
    if (typeof window !== "undefined") {
      window.location.href = `mailto:feedback@tabplex.com?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(body)}`
    }
  }

  const handleAboutTap = () => {
    devTapCountRef.current = Math.min(5, devTapCountRef.current + 1)
    if (devTapCountRef.current === 5) setDeveloperVisible(true)
  }

  const flushBeforeBackup = async () => {
    await accentUpdaterRef.current.flush()
    await flushPendingNotes?.()
  }

  return (
    <div className="settings-body">
      <div className="settings-grid">
        <AppearanceSettingsSection
          headingLevel={sectionHeadingLevel}
          language={i18n.language}
          resolvedTheme={resolvedTheme}
          accentDraft={accentDraft}
          onLanguageChange={handleLanguageChange}
          onThemeChange={(theme) => void updateSetting("theme", theme)}
          onAccentChange={handleAccentChange}
          onAccentCommit={handleAccentCommit}
        />
        <StorageSettingsSection
          storageUsage={storageUsage}
          headingLevel={sectionHeadingLevel}
          onBeforeBackup={flushBeforeBackup}
        />
        <ControlSettingsSection
          headingLevel={sectionHeadingLevel}
          agentControlEnabled={!!settings.agentControlEnabled}
          onAgentControlEnabledChange={(enabled) =>
            updateSetting("agentControlEnabled", enabled)
          }
        />
        <div className="settings-section-stack">
          <AboutAndDeveloperSections
            headingLevel={sectionHeadingLevel}
            version={version}
            feedbackDescription={t("settings.about.feedback.desc")}
            logExportStatus={logExportStatus}
            developerVisible={developerVisible}
            onboardingStatus={onboardingStatus}
            devModeEnabled={!!settings.devMode}
            onAboutTap={handleAboutTap}
            onCopyLogs={() => void handleCopyLogs()}
            onEmailFeedback={() => void handleEmailFeedback()}
            onRerunOnboarding={handleRerunOnboarding}
            onDevModeChange={(enabled) =>
              void updateSetting("devMode", enabled)
            }
          />
        </div>
      </div>
    </div>
  )
})
