import type { AgentResponse } from "./agentControlCommands"

export const TABPLEX_NATIVE_HOST_NAME = "com.tabplex.agent" as const

type AgentControlConnectionState =
  | "disabled"
  | "connecting"
  | "connected"
  | "unavailable"

export type AgentControlConnectionStatus = {
  state: AgentControlConnectionState
  errorCode?: "native-host-not-installed" | "native-host-disconnected"
}

type NativePortEvent<T extends (...args: any[]) => void> = {
  addListener: (listener: T) => void
}

export type NativeAgentPort = {
  postMessage: (message: unknown) => void
  disconnect: () => void
  onMessage: NativePortEvent<(message: unknown) => void>
  onDisconnect: NativePortEvent<() => void>
}

type NativeAgentPortControllerDeps = {
  connectNative: (hostName: string) => NativeAgentPort
  handleRequest: (request: unknown) => Promise<AgentResponse>
  getLastErrorMessage?: () => string | undefined
  connectionTimeoutMs?: number
  setTimer?: (callback: () => void, delay: number) => TimerHandle
  clearTimer?: (timer: TimerHandle) => void
}

type TimerHandle = number | ReturnType<typeof setTimeout>

type NativeRequestEnvelope = {
  type: "request"
  protocolVersion: 1
  requestId: string
  request: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

const hasExactKeys = (value: Record<string, unknown>, keys: string[]) => {
  const actual = Object.keys(value)
  const expected = new Set(keys)
  return (
    actual.length === expected.size && actual.every((key) => expected.has(key))
  )
}

const parseRequestEnvelope = (
  message: unknown
): NativeRequestEnvelope | null => {
  if (!isRecord(message)) return null
  if (
    !hasExactKeys(message, ["type", "protocolVersion", "requestId", "request"])
  ) {
    return null
  }
  if (message.type !== "request" || message.protocolVersion !== 1) return null
  if (
    typeof message.requestId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(message.requestId)
  ) {
    return null
  }
  return {
    type: "request",
    protocolVersion: 1,
    requestId: message.requestId,
    request: message.request
  }
}

const isReadyMessage = (message: unknown) =>
  isRecord(message) &&
  hasExactKeys(message, ["type", "protocolVersion"]) &&
  message.type === "ready" &&
  message.protocolVersion === 1

const errorCodeFromMessage = (
  message: string | undefined
): AgentControlConnectionStatus["errorCode"] =>
  message && /not found|not registered|forbidden/i.test(message)
    ? "native-host-not-installed"
    : "native-host-disconnected"

export const createNativeAgentPortController = (
  deps: NativeAgentPortControllerDeps
) => {
  const setTimer = deps.setTimer ?? globalThis.setTimeout
  const clearTimer = deps.clearTimer ?? globalThis.clearTimeout
  const connectionTimeoutMs = deps.connectionTimeoutMs ?? 5_000
  const activeRequestIds = new Set<string>()
  let enabled = false
  let port: NativeAgentPort | null = null
  let connectionTimer: TimerHandle | null = null
  let status: AgentControlConnectionStatus = { state: "disabled" }

  const clearConnectionTimer = () => {
    if (connectionTimer === null) return
    clearTimer(connectionTimer)
    connectionTimer = null
  }

  const setUnavailable = (
    errorCode: AgentControlConnectionStatus["errorCode"]
  ) => {
    clearConnectionTimer()
    status = { state: "unavailable", errorCode }
  }

  const sendResponse = (
    currentPort: NativeAgentPort,
    requestId: string,
    response: AgentResponse
  ) => {
    if (port !== currentPort) return
    try {
      currentPort.postMessage({
        type: "response",
        protocolVersion: 1,
        requestId,
        response
      })
    } catch {
      setUnavailable("native-host-disconnected")
    }
  }

  const handleEnvelope = (
    currentPort: NativeAgentPort,
    envelope: NativeRequestEnvelope
  ) => {
    if (activeRequestIds.has(envelope.requestId)) {
      sendResponse(currentPort, envelope.requestId, {
        ok: false,
        error: "duplicate-native-request"
      })
      return
    }

    activeRequestIds.add(envelope.requestId)
    void deps
      .handleRequest(envelope.request)
      .then((response) =>
        sendResponse(currentPort, envelope.requestId, response)
      )
      .catch(() =>
        sendResponse(currentPort, envelope.requestId, {
          ok: false,
          error: "agent-control-failed"
        })
      )
      .finally(() => activeRequestIds.delete(envelope.requestId))
  }

  const connect = () => {
    if (!enabled || port) return
    status = { state: "connecting" }

    let nextPort: NativeAgentPort
    try {
      nextPort = deps.connectNative(TABPLEX_NATIVE_HOST_NAME)
    } catch {
      setUnavailable("native-host-not-installed")
      return
    }

    port = nextPort
    connectionTimer = setTimer(() => {
      if (port !== nextPort) return
      port = null
      setUnavailable("native-host-disconnected")
      try {
        nextPort.disconnect()
      } catch {
        // The native port may already be gone.
      }
    }, connectionTimeoutMs)

    nextPort.onMessage.addListener((message) => {
      if (port !== nextPort) return
      if (isReadyMessage(message)) {
        clearConnectionTimer()
        status = { state: "connected" }
        return
      }
      const envelope = parseRequestEnvelope(message)
      if (envelope) handleEnvelope(nextPort, envelope)
    })

    nextPort.onDisconnect.addListener(() => {
      if (port !== nextPort) return
      port = null
      activeRequestIds.clear()
      if (!enabled) {
        clearConnectionTimer()
        status = { state: "disabled" }
        return
      }
      setUnavailable(errorCodeFromMessage(deps.getLastErrorMessage?.()))
    })
  }

  const disconnect = () => {
    clearConnectionTimer()
    const currentPort = port
    port = null
    activeRequestIds.clear()
    status = { state: "disabled" }
    if (!currentPort) return
    try {
      currentPort.disconnect()
    } catch {
      // Disconnection is best-effort when Chrome already closed the host.
    }
  }

  const setEnabled = (nextEnabled: boolean) => {
    const changed = enabled !== nextEnabled
    enabled = nextEnabled
    if (!enabled) {
      disconnect()
      return status
    }
    if (changed || status.state === "disabled") connect()
    return status
  }

  return {
    setEnabled,
    getStatus: () => status
  }
}
