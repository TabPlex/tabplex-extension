import { describe, expect, it, vi } from "vitest"

import { createWorkspaceOperationGate } from "./workspaceOperationGate"

const deferred = () => {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("workspaceOperationGate", () => {
  it("allows normal operations to overlap", async () => {
    const gate = createWorkspaceOperationGate()
    const hold = deferred()
    const events: string[] = []

    const first = gate.runNormal(async () => {
      events.push("first-start")
      await hold.promise
      events.push("first-end")
    })
    const second = gate.runNormal(async () => {
      events.push("second-start")
    })

    await vi.waitFor(() =>
      expect(events).toEqual(["first-start", "second-start"])
    )
    hold.resolve()
    await Promise.all([first, second])
  })

  it("blocks new normal work before draining active work for maintenance", async () => {
    const gate = createWorkspaceOperationGate()
    const hold = deferred()
    const events: string[] = []

    const active = gate.runNormal(async () => {
      events.push("normal-active")
      await hold.promise
      events.push("normal-finished")
    })
    await vi.waitFor(() => expect(events).toEqual(["normal-active"]))

    const maintenance = gate.runExclusive({
      beforeDrain: async () => {
        events.push("maintenance-blocked-new-work")
        hold.resolve()
      },
      task: async () => {
        events.push("maintenance-start")
      }
    })
    const queued = gate.runNormal(async () => {
      events.push("normal-after-maintenance")
    })

    await Promise.all([active, maintenance, queued])
    expect(events).toEqual([
      "normal-active",
      "maintenance-blocked-new-work",
      "normal-finished",
      "maintenance-start",
      "normal-after-maintenance"
    ])
  })

  it("runs queued maintenance transactions before admitting normal work", async () => {
    const gate = createWorkspaceOperationGate()
    const firstHold = deferred()
    const events: string[] = []

    const first = gate.runExclusive({
      task: async () => {
        events.push("maintenance-1-start")
        await firstHold.promise
        events.push("maintenance-1-end")
      }
    })
    const second = gate.runExclusive({
      task: async () => {
        events.push("maintenance-2")
      }
    })
    const normal = gate.runNormal(async () => {
      events.push("normal")
    })

    await vi.waitFor(() => expect(events).toEqual(["maintenance-1-start"]))
    firstHold.resolve()
    await Promise.all([first, second, normal])
    expect(events).toEqual([
      "maintenance-1-start",
      "maintenance-1-end",
      "maintenance-2",
      "normal"
    ])
  })

  it("stops admission when an admitted operation queues maintenance", async () => {
    const gate = createWorkspaceOperationGate()
    const initialHold = deferred()
    const events: string[] = []
    let nestedMaintenance: Promise<void> = Promise.resolve()

    const initialMaintenance = gate.runExclusive({
      task: async () => {
        events.push("initial-maintenance")
        await initialHold.promise
      }
    })
    const firstNormal = gate.runNormal(async () => {
      events.push("normal-1")
      nestedMaintenance = gate.runExclusive({
        task: async () => {
          events.push("nested-maintenance")
        }
      })
    })
    const secondNormal = gate.runNormal(async () => {
      events.push("normal-2")
    })

    initialHold.resolve()
    await initialMaintenance
    await firstNormal
    await nestedMaintenance
    await secondNormal
    expect(events).toEqual([
      "initial-maintenance",
      "normal-1",
      "nested-maintenance",
      "normal-2"
    ])
  })
})
