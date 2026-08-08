import { withAuxiliaryStorageWriteLock } from "~lib/storageQueues"

import { onboardingCoordinator } from "../../services/onboardingCoordinator"
import type { BackgroundMessageHandler } from "../types"
import { runAsyncMessage } from "./utils"

type OnboardingCoordinator = typeof onboardingCoordinator

const optionalId = (value: unknown): string | null | undefined => {
  if (value === null) return null
  if (typeof value === "string") return value
  return undefined
}

const createTransition = (
  coordinator: OnboardingCoordinator,
  message: Record<string, unknown>
): (() => Promise<unknown>) | null => {
  switch (message.action) {
    case "claim":
      if (
        typeof message.runId !== "string" ||
        typeof message.now !== "number"
      ) {
        return null
      }
      return () =>
        coordinator.claim({
          runId: message.runId as string,
          now: message.now as number
        })
    case "complete": {
      const autoWorkspaceId = optionalId(message.autoWorkspaceId)
      const guideWorkspaceId = optionalId(message.guideWorkspaceId)
      if (
        typeof message.runId !== "string" ||
        autoWorkspaceId === undefined ||
        guideWorkspaceId === undefined
      ) {
        return null
      }
      return () =>
        coordinator.complete({
          runId: message.runId as string,
          autoWorkspaceId,
          guideWorkspaceId
        })
    }
    case "existing-user-ready":
      if (typeof message.now !== "number") return null
      return () => coordinator.markExistingUserReady(message.now as number)
    case "dismiss":
      return () => coordinator.dismiss()
    case "reset-for-developer":
      if (typeof message.now !== "number") return null
      return () => coordinator.resetForDeveloper(message.now as number)
    default:
      return null
  }
}

export const createOnboardingMessageHandler = (
  coordinator: OnboardingCoordinator,
  withWriteLock: typeof withAuxiliaryStorageWriteLock = (task) => task()
): BackgroundMessageHandler => {
  return (message, sendResponse) => {
    const transition = createTransition(coordinator, message)
    if (!transition) {
      sendResponse({ ok: false, error: "invalid-onboarding-transition" })
      return true
    }

    return runAsyncMessage(
      "onboarding-transition",
      sendResponse,
      () => withWriteLock(transition),
      {
        onSuccess: (result) => ({ ok: true, result }),
        fallbackError: "onboarding-transition failed"
      }
    )
  }
}

export const handleOnboardingMessage = createOnboardingMessageHandler(
  onboardingCoordinator,
  withAuxiliaryStorageWriteLock
)
