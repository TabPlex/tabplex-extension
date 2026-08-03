import { describe, expect, it, vi } from "vitest"

import {
  createNativeAgentPortController,
  TABPLEX_NATIVE_HOST_NAME,
  type NativeAgentPort
} from "./agentControlNativePort"

const createEvent = <T extends (...args: any[]) => void>() => {
  const listeners: T[] = []
  return {
    addListener: (listener: T) => listeners.push(listener),
    emit: (...args: Parameters<T>) => {
      for (const listener of listeners) listener(...args)
    }
  }
}

const createPort = () => {
  const onMessage = createEvent<(message: unknown) => void>()
  const onDisconnect = createEvent<() => void>()
  const port: NativeAgentPort = {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage,
    onDisconnect
  }
  return { port, onMessage, onDisconnect }
}

describe("native Agent port controller", () => {
  it("connects on enable and relays validated host requests", async () => {
    const native = createPort()
    const handleRequest = vi.fn(async () => ({ ok: true as const }))
    const connectNative = vi.fn(() => native.port)
    const controller = createNativeAgentPortController({
      connectNative,
      handleRequest,
      setTimer: () => 1,
      clearTimer: vi.fn()
    })

    expect(controller.setEnabled(true)).toEqual({ state: "connecting" })
    expect(connectNative).toHaveBeenCalledWith(TABPLEX_NATIVE_HOST_NAME)

    native.onMessage.emit({ type: "ready", protocolVersion: 1 })
    expect(controller.getStatus()).toEqual({ state: "connected" })

    const request = {
      _tabplexAgent: true,
      protocolVersion: 1,
      command: "getState"
    }
    native.onMessage.emit({
      type: "request",
      protocolVersion: 1,
      requestId: "request-1",
      request
    })

    await vi.waitFor(() => expect(handleRequest).toHaveBeenCalledWith(request))
    expect(native.port.postMessage).toHaveBeenCalledWith({
      type: "response",
      protocolVersion: 1,
      requestId: "request-1",
      response: { ok: true }
    })
  })

  it("disconnects immediately when the user disables control", () => {
    const native = createPort()
    const controller = createNativeAgentPortController({
      connectNative: () => native.port,
      handleRequest: vi.fn(),
      setTimer: () => 1,
      clearTimer: vi.fn()
    })

    controller.setEnabled(true)
    expect(controller.setEnabled(false)).toEqual({ state: "disabled" })
    expect(native.port.disconnect).toHaveBeenCalledOnce()

    native.onDisconnect.emit()
    expect(controller.getStatus()).toEqual({ state: "disabled" })
  })

  it("reports a missing registered native host without retry polling", () => {
    const native = createPort()
    const connectNative = vi.fn(() => native.port)
    const controller = createNativeAgentPortController({
      connectNative,
      handleRequest: vi.fn(),
      getLastErrorMessage: () => "Specified native messaging host not found.",
      setTimer: () => 1,
      clearTimer: vi.fn()
    })

    controller.setEnabled(true)
    native.onDisconnect.emit()

    expect(controller.getStatus()).toEqual({
      state: "unavailable",
      errorCode: "native-host-not-installed"
    })
    controller.setEnabled(true)
    expect(connectNative).toHaveBeenCalledOnce()
  })
})
