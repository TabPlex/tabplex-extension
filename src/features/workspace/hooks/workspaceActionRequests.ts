import type { Settings, WorkspaceState } from "~core/types"

const sendMessage = async <T>(message: Record<string, unknown>): Promise<T> => {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    throw new Error("extension-runtime-unavailable")
  }
  return chrome.runtime.sendMessage({
    _tabplex: true,
    ...message
  }) as Promise<T>
}

const withWindowId = (preferredWindowId?: number) =>
  typeof preferredWindowId === "number" ? { preferredWindowId } : {}

export const getCurrentNormalWindowId = async () => {
  if (typeof chrome === "undefined" || !chrome.windows?.getCurrent) {
    return undefined
  }
  try {
    const current = await chrome.windows.getCurrent({ populate: false })
    return current.type && current.type !== "normal" ? undefined : current.id
  } catch {
    return undefined
  }
}

export const requestWorkspaceSwitch = async (
  workspaceId: string | null,
  preferredWindowId?: number
) => {
  const windowId = preferredWindowId ?? (await getCurrentNormalWindowId())
  const response = await sendMessage<{ ok?: boolean; error?: string }>({
    type: "workspace-switch",
    workspaceId,
    ...withWindowId(windowId)
  })
  if (!response || response.ok !== true) {
    throw new Error(response?.error || "workspace-switch failed")
  }
}

export const requestWorkspaceStatePatch = async (
  patch: Partial<WorkspaceState>
) => {
  const response = await sendMessage<{ ok?: boolean; error?: string }>({
    type: "workspace-state-patch",
    patch
  })
  if (!response || response.ok !== true) {
    throw new Error(response?.error || "workspace-state-patch failed")
  }
}

export const requestWorkspacesApply = async (
  op: Record<string, unknown>,
  preferredWindowId?: number
) => {
  const windowId = preferredWindowId ?? (await getCurrentNormalWindowId())
  const response = await sendMessage<{
    ok?: boolean
    error?: string
    result?: unknown
  }>({
    type: "workspaces-apply",
    op,
    ...withWindowId(windowId)
  })
  if (!response || response.ok !== true) {
    throw new Error(response?.error || "workspaces-apply failed")
  }
  return response as { ok: true; result?: unknown }
}

export const requestWorkspaceWindowOperation = async (
  operation: Record<string, unknown>,
  preferredWindowId?: number
) => {
  const windowId = preferredWindowId ?? (await getCurrentNormalWindowId())
  const response = await sendMessage<{ ok?: boolean; error?: string }>({
    type: "workspace-window-operation",
    ...operation,
    ...withWindowId(windowId)
  })
  if (!response || response.ok !== true) {
    throw new Error(response?.error || "workspace-window-operation failed")
  }
  return response
}

export const requestSettingUpdate = async <K extends keyof Settings>(
  key: K,
  value: Settings[K]
) => {
  const response = await sendMessage<{ ok?: boolean; error?: string }>({
    type: "settings-apply",
    key,
    value
  })
  if (!response || response.ok !== true) {
    throw new Error(response?.error || "settings-apply failed")
  }
}
