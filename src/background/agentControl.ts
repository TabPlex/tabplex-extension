import type { Settings } from "~core/types"

import {
  createAgentCommandHandler,
  type AgentControlDeps,
  type AgentResponse
} from "./agentControlCommands"
import {
  createNativeAgentPortController,
  type AgentControlConnectionStatus,
  type NativeAgentPort
} from "./agentControlNativePort"
import { parseAgentCommandRequest } from "./agentControlProtocol"

export {
  createAgentCommandHandler,
  createAgentWorkspaceFactory
} from "./agentControlCommands"
export type { AgentControlDeps, AgentResponse } from "./agentControlCommands"

type AgentRequestProcessorOptions = {
  withAgentOperation: <T>(task: () => Promise<T>) => Promise<T>
  getCurrentWindowId: () => Promise<number | undefined>
}

export const createAgentRequestProcessor = (
  deps: AgentControlDeps,
  options: AgentRequestProcessorOptions
) => {
  const handleCommand = createAgentCommandHandler(deps)

  return async (message: unknown): Promise<AgentResponse> => {
    const parsed = parseAgentCommandRequest(message)
    if ("error" in parsed) return { ok: false, error: parsed.error }

    try {
      return await options.withAgentOperation(async () => {
        const settings = await deps.loadSettings()
        if (!settings.agentControlEnabled) {
          return { ok: false, error: "agent-control-disabled" }
        }

        const preferredWindowId =
          parsed.request.windowId ?? (await options.getCurrentWindowId())
        return handleCommand(
          {
            _tabplexAgent: true,
            command: parsed.request.command,
            payload: parsed.request.payload
          },
          { preferredWindowId }
        )
      })
    } catch {
      return { ok: false, error: "agent-control-failed" }
    }
  }
}

type AgentControlRuntimeDeps = {
  loadSettings: () => Promise<Settings>
  connectNative: (hostName: string) => NativeAgentPort
  handleRequest: (request: unknown) => Promise<AgentResponse>
  getLastErrorMessage?: () => string | undefined
}

export const createAgentControlRuntime = (deps: AgentControlRuntimeDeps) => {
  const controller = createNativeAgentPortController({
    connectNative: deps.connectNative,
    handleRequest: deps.handleRequest,
    getLastErrorMessage: deps.getLastErrorMessage
  })

  const syncWithSettings = async () => {
    const settings = await deps.loadSettings()
    return controller.setEnabled(settings.agentControlEnabled === true)
  }

  return {
    syncWithSettings,
    setEnabled: controller.setEnabled,
    disconnect: () => controller.setEnabled(false),
    getStatus: controller.getStatus
  }
}

export type AgentControlRuntime = ReturnType<typeof createAgentControlRuntime>

let defaultRuntime: AgentControlRuntime | null = null

const LEGACY_AGENT_LOCAL_KEYS = ["tabplexAgentPairingV1", "tabplexAgentAuditV1"]
const LEGACY_AGENT_SESSION_KEYS = [
  "tabplexAgentSessionV1",
  "tabplexAgentPairBucketV1"
]

export const clearLegacyAgentControlState = async () => {
  await Promise.allSettled([
    chrome.storage.local.remove(LEGACY_AGENT_LOCAL_KEYS),
    chrome.storage.session?.remove(LEGACY_AGENT_SESSION_KEYS) ??
      Promise.resolve()
  ])
}

export const registerAgentControlRuntime = (runtime: AgentControlRuntime) => {
  defaultRuntime = runtime
}

export const syncAgentControlRuntime =
  async (): Promise<AgentControlConnectionStatus> => {
    if (!defaultRuntime) return { state: "unavailable" }
    return defaultRuntime.syncWithSettings()
  }

export const disconnectAgentControl = async () => {
  defaultRuntime?.disconnect()
  await clearLegacyAgentControlState()
}
