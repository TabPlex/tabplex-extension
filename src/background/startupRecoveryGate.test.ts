import { describe, expect, it, vi } from "vitest"

import {
  createStartupRecoveryGate,
  gateBackgroundMessageHandler
} from "./startupRecoveryGate"

const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined
  let reject: (error: unknown) => void = () => undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe("startupRecoveryGate", () => {
  it("holds internal side effects until backup recovery succeeds", async () => {
    const recovery = deferred<void>()
    const gate = createStartupRecoveryGate(recovery.promise)
    const sideEffect = vi.fn()
    const sendResponse = vi.fn()
    const handler = gateBackgroundMessageHandler(
      gate.ready,
      (_message, respond) => {
        sideEffect()
        respond({ ok: true })
        return true
      }
    )

    expect(
      handler({ _tabplex: true, type: "settings-apply" }, sendResponse)
    ).toBe(true)
    await Promise.resolve()
    expect(sideEffect).not.toHaveBeenCalled()

    recovery.resolve()
    await gate.ready
    await Promise.resolve()
    expect(sideEffect).toHaveBeenCalledOnce()
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })

  it("fails closed when backup recovery rejects", async () => {
    const recovery = deferred<void>()
    const gate = createStartupRecoveryGate(recovery.promise)
    const sideEffect = vi.fn()
    const sendResponse = vi.fn()
    const handler = gateBackgroundMessageHandler(gate.ready, () => {
      sideEffect()
      return true
    })

    handler({ _tabplex: true, type: "workspaces-apply" }, sendResponse)
    recovery.reject(new Error("invalid-restore-journal"))
    await expect(gate.ready).rejects.toThrow("invalid-restore-journal")
    await Promise.resolve()

    expect(gate.hasSucceeded()).toBe(false)
    expect(sideEffect).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: "startup-recovery-failed"
    })
  })

  it("orders backup rollback before controller switch-journal recovery", async () => {
    const sequence: string[] = []
    const recovery = deferred<void>()
    const gate = createStartupRecoveryGate(
      recovery.promise.then(() => {
        sequence.push("backup-journal-rolled-back")
      })
    )
    const controllerInit = gate.ready.then(() => {
      sequence.push("switch-journal-recovered")
    })

    recovery.resolve()
    await controllerInit
    expect(sequence).toEqual([
      "backup-journal-rolled-back",
      "switch-journal-recovered"
    ])
  })
})
