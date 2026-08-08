import type { TabSpec } from "~core/types"
import { isSafeTabUrl, resolveTabUrl } from "~core/utils"

import {
  captureWorkspaceWindowNow,
  findWorkspaceTabInCurrentWindow,
  runWorkspaceWindowOperation
} from "../../workspaceController"
import type { BackgroundMessageHandler } from "../types"
import { parsePreferredWindowId } from "./preferredWindowId"
import { runAsyncMessage } from "./utils"

const toWorkspaceId = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null

const toSafeTabSpec = (value: unknown): TabSpec | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.url !== "string" || !isSafeTabUrl(raw.url)) return null
  return {
    url: raw.url,
    title: typeof raw.title === "string" ? raw.title : undefined,
    faviconUrl: typeof raw.faviconUrl === "string" ? raw.faviconUrl : undefined
  }
}

const openWorkspaceTab = (
  workspaceId: string,
  preferredWindowId: number | undefined,
  spec: TabSpec
) =>
  runWorkspaceWindowOperation(
    workspaceId,
    preferredWindowId,
    async ({ windowId, assertStillBound }) => {
      const targetUrl = spec.url.trim()
      const existing = await findWorkspaceTabInCurrentWindow(
        windowId,
        targetUrl
      )
      if (typeof existing?.id === "number") {
        await assertStillBound()
        const verified = await chrome.tabs.get(existing.id)
        if (
          verified.windowId !== windowId ||
          resolveTabUrl(verified).trim() !== targetUrl
        ) {
          throw new Error("workspace-window-operation-tab-changed")
        }
        await chrome.tabs.update(existing.id, { active: true })
        await chrome.windows.update(windowId, { focused: true })
        return { created: false, tabId: existing.id }
      }

      await assertStillBound()
      const created = await chrome.tabs.create({
        windowId,
        url: spec.url,
        active: true
      })
      try {
        await assertStillBound()
      } catch (error) {
        if (typeof created.id === "number") {
          await chrome.tabs.remove(created.id).catch(() => undefined)
        }
        throw error
      }
      return { created: true, tabId: created.id }
    }
  )

export const handleWorkspaceWindowOperationMessage: BackgroundMessageHandler = (
  message,
  sendResponse
) => {
  const workspaceId = toWorkspaceId(message.workspaceId)
  if (!workspaceId) {
    sendResponse({ ok: false, error: "invalid-workspace-id" })
    return true
  }
  const preferredWindow = parsePreferredWindowId(message.preferredWindowId)
  if (!preferredWindow.ok) {
    sendResponse({ ok: false, error: "invalid-workspace-window-id" })
    return true
  }
  const preferredWindowId = preferredWindow.value

  if (message.operation === "open-tab") {
    const spec = toSafeTabSpec(message.tab)
    if (!spec) {
      sendResponse({ ok: false, error: "invalid-workspace-window-tab" })
      return true
    }
    return runAsyncMessage(
      "workspace-window-operation",
      sendResponse,
      () => openWorkspaceTab(workspaceId, preferredWindowId, spec),
      {
        onSuccess: (result) => ({ ok: true, ...result }),
        fallbackError: "workspace-window-operation failed"
      }
    )
  }

  if (message.operation === "capture-tabs") {
    return runAsyncMessage(
      "workspace-window-operation",
      sendResponse,
      () =>
        captureWorkspaceWindowNow(workspaceId, preferredWindowId, {
          skipHistory: message.skipHistory === true
        }),
      {
        onSuccess: () => ({ ok: true }),
        fallbackError: "workspace-window-operation failed"
      }
    )
  }

  sendResponse({ ok: false, error: "invalid-workspace-window-operation" })
  return true
}
