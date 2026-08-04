import React, { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~components/ui/button"
import { Switch } from "~components/ui/switch"
import { createAgentControlInstructions } from "~features/settings/logic/agentControlInstructions"
import { copyToClipboard } from "~features/settings/utils/copyToClipboard"

type AgentControlStatus = {
  state: "disabled" | "connecting" | "connected" | "unavailable"
  errorCode?: "native-host-not-installed" | "native-host-disconnected"
}

type AgentControlSettingsProps = {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => Promise<void>
}

type AgentFeedback = {
  source: "control" | "copy"
  message: string
}

const requestStatus = async () => {
  const response = await chrome.runtime.sendMessage({
    _tabplex: true,
    type: "agent-control",
    action: "status"
  })
  if (!response || response.ok !== true) {
    throw new Error(response?.error || "agent-control-status failed")
  }
  return response.result as AgentControlStatus
}

export const AgentControlSettings = ({
  enabled,
  onEnabledChange
}: AgentControlSettingsProps) => {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<AgentControlStatus | null>(null)
  const [feedback, setFeedback] = useState<AgentFeedback | null>(null)

  const refreshStatus = useCallback(async () => {
    const next = await requestStatus()
    setStatus(next)
    return next
  }, [])

  useEffect(() => {
    void refreshStatus().catch(() =>
      setStatus({ state: enabled ? "unavailable" : "disabled" })
    )
  }, [enabled, refreshStatus])

  useEffect(() => {
    if (!enabled || status?.state !== "connecting") return
    const timer = window.setTimeout(() => {
      void refreshStatus().catch(() => setStatus({ state: "unavailable" }))
    }, 750)
    return () => window.clearTimeout(timer)
  }, [enabled, refreshStatus, status?.state])

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(null), 3_000)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const handleEnabledChange = (nextEnabled: boolean) => {
    if (busy) return
    setBusy(true)
    setFeedback(null)
    void onEnabledChange(nextEnabled)
      .then(refreshStatus)
      .catch(() => {
        setStatus({ state: nextEnabled ? "unavailable" : "disabled" })
        setFeedback({
          source: "control",
          message: t("settings.control.agentControl.failed")
        })
      })
      .finally(() => setBusy(false))
  }

  const handleCopyInstructions = async () => {
    const copied = await copyToClipboard(
      createAgentControlInstructions(chrome.runtime.id)
    )
    setFeedback({
      source: "copy",
      message: t(
        copied
          ? "settings.control.agentControl.copied"
          : "settings.control.agentControl.copyFailed"
      )
    })
  }

  const state = !enabled ? "disabled" : (status?.state ?? "connecting")
  const statusLabel = t(`settings.control.agentControl.status.${state}`)
  const copyLabel =
    feedback?.source === "copy"
      ? feedback.message
      : t("settings.control.agentControl.copyInstructions")

  return (
    <div className="setting-row settings-control-row items-start">
      <div className="setting-info min-w-0">
        <div className="settings-agent-heading">
          <span className="setting-title">
            {t("settings.control.agentControl.title")}
          </span>
          <span
            className="settings-agent-status"
            data-state={state}
            role="status"
            aria-live="polite">
            {statusLabel}
          </span>
        </div>
        <span className="setting-desc settings-agent-description">
          {t("settings.control.agentControl.desc")}
        </span>
        {feedback?.source === "control" ? (
          <span className="sr-only" role="status" aria-live="polite">
            {feedback.message}
          </span>
        ) : null}
      </div>
      <div className="setting-actions settings-agent-controls">
        <Switch
          checked={enabled}
          disabled={busy}
          aria-label={t("settings.control.agentControl.title")}
          onCheckedChange={handleEnabledChange}
        />
        <Button
          size="sm"
          type="button"
          variant="ghost"
          className="settings-text-action settings-agent-copy"
          onClick={() => void handleCopyInstructions()}>
          <span aria-live="polite">{copyLabel}</span>
        </Button>
      </div>
    </div>
  )
}
