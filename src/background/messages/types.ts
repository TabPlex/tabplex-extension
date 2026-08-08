// 所有已注册的内部消息类型
export type TabplexMessageType =
  // 工作区
  | "workspace-switch"
  | "workspace-window-operation"
  | "workspace-state-patch"
  | "workspaces-apply"
  | "settings-apply"
  | "pending-action-consume"
  | "backup-restore"
  | "onboarding-transition"
  | "agent-control"
  // Home / 管理窗口
  | "ensure-home"
  | "open-home"
  | "app-shortcut"

export type TabplexInternalMessage = {
  _tabplex: true
  type: TabplexMessageType
  [key: string]: unknown
}

export type BackgroundMessageHandler = (
  message: TabplexInternalMessage,
  sendResponse: (response?: unknown) => void
) => boolean | void

export type BackgroundMessageRouter = (
  type: TabplexMessageType
) => BackgroundMessageHandler | undefined

export type BackgroundMessageValidationResult =
  | { ok: true; message: TabplexInternalMessage }
  | { ok: false; response?: unknown }

export type BackgroundMessageValidator = (
  message: unknown,
  sender: chrome.runtime.MessageSender
) => BackgroundMessageValidationResult
