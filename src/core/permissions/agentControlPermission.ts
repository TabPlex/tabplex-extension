export const AGENT_CONTROL_PERMISSION = "nativeMessaging" as const

const AGENT_CONTROL_PERMISSION_REQUEST = {
  permissions: [AGENT_CONTROL_PERMISSION]
} satisfies chrome.permissions.Permissions

export const hasAgentControlPermission = () =>
  chrome.permissions.contains(AGENT_CONTROL_PERMISSION_REQUEST)

export const requestAgentControlPermission = () =>
  chrome.permissions.request(AGENT_CONTROL_PERMISSION_REQUEST)

export const removeAgentControlPermission = () =>
  chrome.permissions.remove(AGENT_CONTROL_PERMISSION_REQUEST)

export const includesAgentControlPermission = (
  permissions: chrome.permissions.Permissions
) => permissions.permissions?.includes(AGENT_CONTROL_PERMISSION) === true
