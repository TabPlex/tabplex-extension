import { useCallback, useMemo } from "react"

import type { WorkspaceState } from "~core/types"
import { useWorkspaceManager } from "~hooks/useWorkspaceManager"

const SWITCH_PROGRESS_TTL_MS = 60000

export const shouldExposeSwitchState = (
  state: WorkspaceState["switchState"],
  now = Date.now()
) => {
  if (!state?.targetId || typeof state.ts !== "number") return false
  if (state.phase === "recovery_failed") return true
  return now - state.ts <= SWITCH_PROGRESS_TTL_MS
}

export const isWorkspaceSwitchInProgress = (
  state: WorkspaceState["switchState"]
) => !!state && state.phase !== "recovery_failed"

export const useWorkspaceSwitching = () => {
  const { workspaceState, workspaces } = useWorkspaceManager()

  const activeSwitchState = useMemo(() => {
    const state = workspaceState.switchState
    return shouldExposeSwitchState(state) ? state : null
  }, [workspaceState.switchState])

  const discardRecovery = useCallback(async () => {
    const response = await chrome.runtime.sendMessage({
      _tabplex: true,
      type: "workspace-switch",
      action: "discard-recovery",
      confirm: true
    })
    if (!response?.ok) {
      throw new Error(
        response?.error || "workspace-switch-recovery-discard failed"
      )
    }
    return !!response.discarded
  }, [])

  const switchTargetId = activeSwitchState?.targetId ?? null
  const switchTargetWorkspace = useMemo(() => {
    if (!switchTargetId) return null
    return workspaces.find((ws) => ws.id === switchTargetId) ?? null
  }, [switchTargetId, workspaces])

  const switchExpectedCount =
    activeSwitchState?.expectedCount ?? switchTargetWorkspace?.tabs?.length ?? 0
  const switchCompletedCount =
    activeSwitchState?.completedCount ?? activeSwitchState?.openedCount ?? 0
  const switchFailedCount = activeSwitchState?.failedCount ?? 0

  const switchProgressRatio =
    switchExpectedCount > 0
      ? Math.min(1, switchCompletedCount / switchExpectedCount)
      : 0

  const isSwitching = !!activeSwitchState
  const isRecoveryFailed = activeSwitchState?.phase === "recovery_failed"
  const isSwitchingInProgress = isWorkspaceSwitchInProgress(activeSwitchState)

  return {
    isSwitching,
    isSwitchingInProgress,
    isRecoveryFailed,
    recoveryError: activeSwitchState?.recoveryError ?? null,
    discardRecovery,
    targetName: switchTargetWorkspace?.name || "工作区",
    targetWorkspace: switchTargetWorkspace,
    progressRatio: switchProgressRatio,
    counts: {
      completed: switchCompletedCount,
      expected: switchExpectedCount,
      failed: switchFailedCount
    }
  }
}
