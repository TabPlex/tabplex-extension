import type { TabSpec, WorkspaceState } from "~core/types"

import type { AgentResponse } from "./agentControlCommands"
import type { AgentMutableSettingKey } from "./agentControlProtocol"
import type {
  BackgroundMessageHandler,
  TabplexInternalMessage
} from "./messages/types"

type AgentBridgeHandlers = {
  workspacesApply: BackgroundMessageHandler
  workspaceStatePatch: BackgroundMessageHandler
  settingsApply: BackgroundMessageHandler
  workspaceWindowOperation: BackgroundMessageHandler
}

const normalizeResponse = (value: unknown): AgentResponse => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "agent-control-action-failed" }
  }
  const response = value as Record<string, unknown>
  if (response.ok === true) {
    const details = Object.fromEntries(
      Object.entries(response).filter(([key]) => key !== "ok")
    )
    return {
      ok: true,
      ...(Object.prototype.hasOwnProperty.call(response, "result")
        ? { result: response.result }
        : Object.keys(details).length
          ? { result: details }
          : {})
    }
  }
  return {
    ok: false,
    error:
      typeof response.error === "string"
        ? response.error
        : "agent-control-action-failed"
  }
}

export const invokeAgentBackgroundHandler = (
  handler: BackgroundMessageHandler,
  message: TabplexInternalMessage
) =>
  new Promise<AgentResponse>((resolve) => {
    let responded = false
    const sendResponse = (value?: unknown) => {
      if (responded) return
      responded = true
      resolve(normalizeResponse(value))
    }

    try {
      const keepAlive = handler(message, sendResponse)
      if (keepAlive !== true && !responded) {
        sendResponse({ ok: false, error: "agent-control-action-failed" })
      }
    } catch {
      sendResponse({ ok: false, error: "agent-control-action-failed" })
    }
  })

export const createAgentBackgroundActionBridge = (
  handlers: AgentBridgeHandlers
) => ({
  applyWorkspaceOperation: (
    operation: Record<string, unknown>,
    preferredWindowId?: number
  ) =>
    invokeAgentBackgroundHandler(handlers.workspacesApply, {
      _tabplex: true,
      type: "workspaces-apply",
      op: operation,
      preferredWindowId
    }),
  patchWorkspaceState: (patch: Partial<WorkspaceState>) =>
    invokeAgentBackgroundHandler(handlers.workspaceStatePatch, {
      _tabplex: true,
      type: "workspace-state-patch",
      patch
    }),
  updateSetting: (key: AgentMutableSettingKey, value: unknown) =>
    invokeAgentBackgroundHandler(handlers.settingsApply, {
      _tabplex: true,
      type: "settings-apply",
      key,
      value
    }),
  openWorkspaceTab: (
    workspaceId: string,
    tab: TabSpec,
    preferredWindowId?: number
  ) =>
    invokeAgentBackgroundHandler(handlers.workspaceWindowOperation, {
      _tabplex: true,
      type: "workspace-window-operation",
      operation: "open-tab",
      workspaceId,
      tab,
      preferredWindowId
    }),
  captureWorkspaceTabs: (
    workspaceId: string,
    skipHistory: boolean,
    preferredWindowId?: number
  ) =>
    invokeAgentBackgroundHandler(handlers.workspaceWindowOperation, {
      _tabplex: true,
      type: "workspace-window-operation",
      operation: "capture-tabs",
      workspaceId,
      skipHistory,
      preferredWindowId
    })
})
