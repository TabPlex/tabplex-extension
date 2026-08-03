import { useTranslation } from "react-i18next"

import { AccentColorPicker } from "~components/AccentColorPicker"
import { Button } from "~components/ui/button"
import { ExternalLinkIcon } from "~components/ui/external-link"
import { MoonIcon } from "~components/ui/moon"
import { Progress } from "~components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "~components/ui/select"
import { SunDimIcon } from "~components/ui/sun-dim"
import { Switch } from "~components/ui/switch"
import { ACCENT_PRESET_COLORS } from "~core/types"
import type { LocalStorageUsageState } from "~features/settings/hooks/useLocalStorageUsage"
import { openShortcutsManager } from "~features/shortcuts/commandShortcuts"
import { cn } from "~lib/utils"

import { AgentControlSettings } from "./AgentControlSettings"
import { BackupActions } from "./BackupActions"
import { getLocalStorageModel } from "./localStorageModel"
import {
  SettingsSectionTitle,
  type SettingsSectionHeadingLevel
} from "./SettingsSectionTitle"

type StorageSettingsSectionProps = {
  storageUsage: LocalStorageUsageState
  headingLevel: SettingsSectionHeadingLevel
  onBeforeBackup: () => Promise<void>
}

export const StorageSettingsSection = ({
  storageUsage,
  headingLevel,
  onBeforeBackup
}: StorageSettingsSectionProps) => {
  const { t } = useTranslation()
  const localStorage =
    storageUsage.status === "ready"
      ? getLocalStorageModel({ usedBytes: storageUsage.bytes, t })
      : null
  const localStorageStatus =
    storageUsage.status === "loading"
      ? t("storage.reading")
      : storageUsage.status === "unavailable"
        ? t("storage.unavailable")
        : localStorage?.usageLabel

  return (
    <div className="settings-section settings-storage">
      <SettingsSectionTitle as={headingLevel}>
        {t("storage.title")}
      </SettingsSectionTitle>
      <div className="settings-storage-content">
        <div className="settings-storage-card flex flex-col gap-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-foreground">
              {t("storage.localTitle")}
            </span>
            <span className="shrink-0">{localStorageStatus}</span>
          </div>
          {localStorage ? (
            <Progress
              value={localStorage.percent}
              className="h-1.5"
              aria-label={t("storage.localTitle")}
              aria-valuetext={localStorageStatus}
            />
          ) : null}
          <span className="text-[11px] text-muted-foreground">
            {localStorage?.hintLabel ?? localStorageStatus}
          </span>
        </div>

        <div className="setting-list settings-storage-actions">
          <BackupActions onBeforeAction={onBeforeBackup} />
        </div>
      </div>
    </div>
  )
}

type ControlSettingsSectionProps = {
  headingLevel: SettingsSectionHeadingLevel
  agentControlEnabled: boolean
  onAgentControlEnabledChange: (enabled: boolean) => Promise<void>
}

export const ControlSettingsSection = ({
  headingLevel,
  agentControlEnabled,
  onAgentControlEnabledChange
}: ControlSettingsSectionProps) => {
  const { t } = useTranslation()

  return (
    <div className="settings-section settings-control">
      <SettingsSectionTitle as={headingLevel}>
        {t("settings.sections.control")}
      </SettingsSectionTitle>
      <div className="setting-list">
        <div className="setting-row settings-control-row">
          <div className="setting-info min-w-0">
            <span className="setting-title">
              {t("settings.shortcuts.title")}
            </span>
            <span className="setting-desc">{t("settings.shortcuts.desc")}</span>
          </div>
          <div className="setting-actions">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="settings-text-action settings-control-action"
              onClick={openShortcutsManager}>
              <span>{t("settings.shortcuts.manage")}</span>
              <ExternalLinkIcon
                className="shortcuts-manage-icon"
                size={13}
                aria-hidden="true"
              />
            </Button>
          </div>
        </div>
        <AgentControlSettings
          enabled={agentControlEnabled}
          onEnabledChange={onAgentControlEnabledChange}
        />
      </div>
    </div>
  )
}

type AppearanceSettingsSectionProps = {
  headingLevel: SettingsSectionHeadingLevel
  language: string
  resolvedTheme: "dark" | "light"
  accentDraft: string
  onLanguageChange: (language: "zh-CN" | "en-US") => void
  onThemeChange: (theme: "dark" | "light") => void
  onAccentChange: (value: string) => void
  onAccentCommit: (value: string) => void
}

export const AppearanceSettingsSection = ({
  headingLevel,
  language,
  resolvedTheme,
  accentDraft,
  onLanguageChange,
  onThemeChange,
  onAccentChange,
  onAccentCommit
}: AppearanceSettingsSectionProps) => {
  const { t } = useTranslation()

  return (
    <div className="settings-section settings-appearance-section">
      <div className="settings-appearance-block">
        <SettingsSectionTitle as={headingLevel}>
          {t("settings.sections.appearance")}
        </SettingsSectionTitle>
        <div className="settings-appearance-row flex items-center justify-between gap-3">
          <span className="settings-appearance-label shrink-0 whitespace-nowrap">
            {t("settings.appearance.language")}
          </span>
          <Select value={language} onValueChange={onLanguageChange}>
            <SelectTrigger
              className={cn(
                "settings-language-trigger !w-[104px] shrink-0",
                "focus:!ring-0 focus:!ring-offset-0 focus-visible:!ring-0 focus-visible:!ring-offset-0",
                "[&>span]:w-full [&>span]:text-right"
              )}
              aria-label={t("settings.appearance.language")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="settings-select-content !w-[120px] !min-w-[120px]">
              <SelectItem className="settings-select-item" value="zh-CN">
                简体中文
              </SelectItem>
              <SelectItem className="settings-select-item" value="en-US">
                English
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="settings-appearance-row flex items-center justify-between gap-3">
          <span className="settings-appearance-label shrink-0 whitespace-nowrap">
            {t("settings.appearance.theme")}
          </span>
          <div className="flex items-center gap-2">
            <SunDimIcon
              className={cn(
                resolvedTheme === "light"
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
              aria-hidden="true"
            />
            <Switch
              checked={resolvedTheme === "dark"}
              onCheckedChange={(checked) =>
                onThemeChange(checked ? "dark" : "light")
              }
              aria-label={t("settings.appearance.theme")}
            />
            <MoonIcon
              className={cn(
                resolvedTheme === "dark"
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      <div className="settings-appearance-block">
        <AccentColorPicker
          value={accentDraft}
          presets={ACCENT_PRESET_COLORS}
          onChange={onAccentChange}
          onCommit={onAccentCommit}
          classPrefix="settings"
          inputId="accent-color-input"
          inputLabel={t("settings.appearance.custom")}
          srLabel={t("settings.appearance.accentColor")}
          title={t("settings.appearance.accentColor")}
          titleClassName="settings-appearance-label"
        />
      </div>
    </div>
  )
}

type AboutAndDeveloperSectionsProps = {
  headingLevel: SettingsSectionHeadingLevel
  version: string
  feedbackDescription: string
  logExportStatus: string | null
  developerVisible: boolean
  onboardingStatus: string | null
  devModeEnabled: boolean
  onAboutTap: () => void
  onCopyLogs: () => void
  onEmailFeedback: () => void
  onRerunOnboarding: () => Promise<void>
  onDevModeChange: (enabled: boolean) => void
}

export const AboutAndDeveloperSections = ({
  headingLevel,
  version,
  feedbackDescription,
  logExportStatus,
  developerVisible,
  onboardingStatus,
  devModeEnabled,
  onAboutTap,
  onCopyLogs,
  onEmailFeedback,
  onRerunOnboarding,
  onDevModeChange
}: AboutAndDeveloperSectionsProps) => {
  const { t } = useTranslation()

  return (
    <>
      <div className="settings-section settings-about">
        <SettingsSectionTitle as={headingLevel}>
          {t("settings.sections.about")}
        </SettingsSectionTitle>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="settings-about-brand"
              onClick={onAboutTap}>
              TabPlex
            </button>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              v{version}
            </span>
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            {t("settings.about.desc")}
          </div>
        </div>
        <div className="setting-list">
          <div className="setting-row settings-feedback-row">
            <div className="setting-info settings-feedback-info">
              <span className="setting-title settings-feedback-title">
                {t("settings.about.feedback.title")}
              </span>
              {feedbackDescription.trim() ? (
                <span className="setting-desc">{feedbackDescription}</span>
              ) : null}
              {logExportStatus ? (
                <span className="setting-hint" role="status">
                  {logExportStatus}
                </span>
              ) : null}
            </div>
            <div className="setting-actions settings-feedback-actions">
              <Button
                size="sm"
                variant="ghost"
                className="settings-text-action settings-feedback-action"
                onClick={onCopyLogs}
                type="button">
                {t("settings.about.feedback.copy")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="settings-text-action settings-feedback-action"
                onClick={onEmailFeedback}
                type="button">
                {t("settings.about.feedback.email")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {developerVisible ? (
        <div className="settings-section">
          <SettingsSectionTitle as={headingLevel}>
            {t("settings.sections.developer")}
          </SettingsSectionTitle>
          <div className="setting-list">
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-title">
                  {t("settings.developer.onboarding.title")}
                </span>
                <span className="setting-desc">
                  {t("settings.developer.onboarding.desc")}
                </span>
                <span className="setting-hint muted">
                  {t("settings.developer.onboarding.hint")}
                </span>
                {onboardingStatus ? (
                  <span className="setting-hint" role="status">
                    {onboardingStatus}
                  </span>
                ) : null}
              </div>
              <div className="setting-actions">
                <Button
                  size="sm"
                  className="settings-soft-button"
                  onClick={() => void onRerunOnboarding()}
                  type="button">
                  {t("settings.developer.onboarding.reseed")}
                </Button>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-title">
                  {t("settings.developer.logs.title")}
                </span>
                <span className="setting-desc">
                  {t("settings.developer.logs.desc")}
                </span>
              </div>
              <div className="setting-actions">
                <Switch
                  checked={devModeEnabled}
                  aria-label={t("settings.developer.logs.title")}
                  onCheckedChange={onDevModeChange}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
