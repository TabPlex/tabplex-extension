import { syncAgentControlRuntime } from "../../agentControl"
import type { BackgroundMessageHandler } from "../types"
import { runAsyncMessage } from "./utils"

type AgentControlMessageDeps = {
  sync: typeof syncAgentControlRuntime
}

export const createAgentControlMessageHandler = (
  deps: AgentControlMessageDeps
): BackgroundMessageHandler => {
  return (message, sendResponse) => {
    if (message.action !== "status") {
      sendResponse({ ok: false, error: "invalid-agent-control-request" })
      return true
    }

    return runAsyncMessage("agent-control", sendResponse, deps.sync, {
      onSuccess: (result) => ({ ok: true, result }),
      fallbackError: "agent-control-status-failed"
    })
  }
}

export const handleAgentControlMessage = createAgentControlMessageHandler({
  sync: syncAgentControlRuntime
})
