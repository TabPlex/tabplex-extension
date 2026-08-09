type AgentControlPermissionStateDeps = {
  isEnabled: () => Promise<boolean>
  hasPermission: () => Promise<boolean>
  removePermission: () => Promise<boolean>
  disable: () => Promise<void>
}

export const reconcileAgentControlPermissionState = async (
  deps: AgentControlPermissionStateDeps
) => {
  const enabled = await deps.isEnabled()
  const hasPermission = await deps.hasPermission()
  if (!enabled) {
    if (hasPermission) await deps.removePermission().catch(() => false)
    return false
  }
  if (hasPermission) return true
  await deps.disable()
  return false
}
