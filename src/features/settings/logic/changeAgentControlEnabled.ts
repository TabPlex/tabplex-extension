import {
  hasAgentControlPermission,
  removeAgentControlPermission,
  requestAgentControlPermission
} from "~core/permissions/agentControlPermission"

export type AgentControlEnabledChangeResult =
  "enabled" | "disabled" | "permission-denied" | "permission-removal-failed"

type AgentControlPermissionDeps = {
  requestPermission: () => Promise<boolean>
  removePermission: () => Promise<boolean>
  hasPermission: () => Promise<boolean>
}

const defaultPermissionDeps: AgentControlPermissionDeps = {
  requestPermission: requestAgentControlPermission,
  removePermission: removeAgentControlPermission,
  hasPermission: hasAgentControlPermission
}

const permissionStillGranted = async (deps: AgentControlPermissionDeps) => {
  try {
    return await deps.hasPermission()
  } catch {
    return true
  }
}

export const changeAgentControlEnabled = async (
  nextEnabled: boolean,
  persistEnabled: (enabled: boolean) => Promise<void>,
  deps: AgentControlPermissionDeps = defaultPermissionDeps
): Promise<AgentControlEnabledChangeResult> => {
  if (nextEnabled) {
    // Keep this as the first asynchronous call so Chrome sees it in the
    // switch's user gesture and can show the optional-permission prompt.
    const granted = await deps.requestPermission()
    if (!granted) return "permission-denied"

    try {
      await persistEnabled(true)
      return "enabled"
    } catch (error) {
      // The feature stayed off, so retain no permission solely for it.
      await deps.removePermission().catch(() => false)
      throw error
    }
  }

  await persistEnabled(false)
  try {
    const removed = await deps.removePermission()
    if (removed || !(await permissionStillGranted(deps))) return "disabled"
  } catch {
    if (!(await permissionStillGranted(deps))) return "disabled"
  }
  return "permission-removal-failed"
}
