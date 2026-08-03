import type { Settings } from "~core/types"
import { applySettingsUpdate } from "~lib/storageQueues"

import type { BackgroundMessageHandler } from "../types"
import { runAsyncMessage } from "./utils"

type MutableSettingKey =
  | "theme"
  | "language"
  | "accentColor"
  | "devMode"
  | "agentControlEnabled"
  | "workspaceSort"

type SettingsUpdater = typeof applySettingsUpdate

const mutableSettingValue = (
  key: unknown,
  value: unknown
): { key: MutableSettingKey; value: Settings[MutableSettingKey] } | null => {
  if (key === "theme" && ["dark", "light", "system"].includes(String(value))) {
    return { key, value: value as Settings["theme"] }
  }
  if (key === "language" && (value === "zh-CN" || value === "en-US")) {
    return { key, value }
  }
  if (
    key === "accentColor" &&
    typeof value === "string" &&
    /^#[0-9a-f]{6}$/i.test(value)
  ) {
    return { key, value: value.toUpperCase() }
  }
  if (
    (key === "devMode" || key === "agentControlEnabled") &&
    typeof value === "boolean"
  ) {
    return { key, value }
  }
  if (
    key === "workspaceSort" &&
    (value === "lastUsed" || value === "created")
  ) {
    return { key, value }
  }
  return null
}

export const createSettingsApplyMessageHandler = (
  updateSettings: SettingsUpdater
): BackgroundMessageHandler => {
  return (message, sendResponse) => {
    const setting = mutableSettingValue(message.key, message.value)
    if (!setting) {
      sendResponse({ ok: false, error: "invalid-setting-update" })
      return true
    }

    return runAsyncMessage(
      "settings-apply",
      sendResponse,
      () =>
        updateSettings((current) => ({
          ...current,
          [setting.key]: setting.value
        })),
      {
        onSuccess: (result) => ({ ok: true, result }),
        fallbackError: "settings-apply failed"
      }
    )
  }
}

export const handleSettingsApplyMessage =
  createSettingsApplyMessageHandler(applySettingsUpdate)
