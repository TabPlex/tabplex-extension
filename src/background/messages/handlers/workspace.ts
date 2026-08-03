import type { WorkspaceLinkedResource, WorkspaceState } from "~core/types"
import { applyWorkspaceStatePatchWithMerge } from "~lib/storageQueues"

import {
  clearCurrentWindowWorkspace,
  discardWorkspaceSwitchRecovery,
  requestWorkspaceSwitch
} from "../../workspaceController"
import type { BackgroundMessageHandler } from "../types"
import { parsePreferredWindowId } from "./preferredWindowId"
import { runAsyncMessage } from "./utils"

const toWorkspacePatch = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const patch = value as Record<string, unknown>
  const nextPatch: Partial<WorkspaceState> = {
    notes:
      patch.notes &&
      typeof patch.notes === "object" &&
      !Array.isArray(patch.notes)
        ? (patch.notes as Record<string, string>)
        : undefined,
    notePreview:
      patch.notePreview &&
      typeof patch.notePreview === "object" &&
      !Array.isArray(patch.notePreview)
        ? (patch.notePreview as Record<string, boolean>)
        : undefined,
    linkedResources:
      patch.linkedResources &&
      typeof patch.linkedResources === "object" &&
      !Array.isArray(patch.linkedResources)
        ? (patch.linkedResources as Record<string, WorkspaceLinkedResource[]>)
        : undefined
  }

  const hasPatch =
    nextPatch.notes || nextPatch.notePreview || nextPatch.linkedResources

  return hasPatch ? nextPatch : null
}

export const handleWorkspaceSwitchMessage: BackgroundMessageHandler = (
  message,
  sendResponse
) => {
  if (message.action === "discard-recovery") {
    if (message.confirm !== true) {
      sendResponse({
        ok: false,
        error: "workspace-switch-recovery-confirmation-required"
      })
      return true
    }
    return runAsyncMessage(
      "workspace-switch",
      sendResponse,
      () => discardWorkspaceSwitchRecovery(true),
      {
        onSuccess: (discarded) => ({ ok: true, discarded }),
        fallbackError: "workspace-switch-recovery-discard failed"
      }
    )
  }

  const rawId = message.workspaceId
  if (rawId !== null && typeof rawId !== "string") {
    sendResponse({ ok: false, error: "invalid-workspace-id" })
    return true
  }

  const workspaceId = typeof rawId === "string" ? rawId.trim() : null
  const preferredWindow = parsePreferredWindowId(message.preferredWindowId)
  if (!preferredWindow.ok) {
    sendResponse({ ok: false, error: "invalid-workspace-window-id" })
    return true
  }
  const preferredWindowId = preferredWindow.value
  if (!workspaceId) {
    return runAsyncMessage(
      "workspace-switch",
      sendResponse,
      () => clearCurrentWindowWorkspace(preferredWindowId),
      {
        onSuccess: () => ({ ok: true }),
        fallbackError: "workspace-switch failed"
      }
    )
  }

  return runAsyncMessage(
    "workspace-switch",
    sendResponse,
    () => requestWorkspaceSwitch(workspaceId, { preferredWindowId }),
    {
      onSuccess: (result) =>
        result.success
          ? { ok: true }
          : {
              ok: false,
              error: result.error || result.reason
            },
      fallbackError: "workspace-switch failed"
    }
  )
}

export const handleWorkspaceStatePatchMessage: BackgroundMessageHandler = (
  message,
  sendResponse
) => {
  const patch = toWorkspacePatch(message.patch)
  if (!patch) {
    const error =
      message.patch &&
      typeof message.patch === "object" &&
      !Array.isArray(message.patch)
        ? "empty-workspace-patch"
        : "invalid-workspace-patch"
    sendResponse({ ok: false, error })
    return true
  }

  return runAsyncMessage(
    "workspace-state-patch",
    sendResponse,
    () => applyWorkspaceStatePatchWithMerge(patch),
    {
      onSuccess: () => ({ ok: true }),
      fallbackError: "workspace-state-patch failed"
    }
  )
}
