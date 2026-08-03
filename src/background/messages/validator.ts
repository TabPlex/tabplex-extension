import type {
  BackgroundMessageValidationResult,
  BackgroundMessageValidator,
  TabplexInternalMessage
} from "./types"

const hasType = (value: unknown): value is { type: unknown } => {
  return !!value && typeof value === "object" && "type" in value
}

export const createBackgroundMessageValidator = (
  isTrustedSender: (sender: chrome.runtime.MessageSender) => boolean
): BackgroundMessageValidator => {
  return (message, sender): BackgroundMessageValidationResult => {
    if (!isTrustedSender(sender)) return { ok: false }
    if (!message || typeof message !== "object") return { ok: false }

    const internal = message as { _tabplex?: unknown }
    if (internal._tabplex !== true) return { ok: false }

    if (
      !hasType(message) ||
      typeof message.type !== "string" ||
      !message.type
    ) {
      return {
        ok: false,
        response: { ok: false, error: "invalid-message-type" }
      }
    }

    return { ok: true, message: message as TabplexInternalMessage }
  }
}
