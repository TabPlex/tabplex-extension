import { describe, expect, it, vi } from "vitest"

import { withAgentOperationLock } from "./agentOperationGate"

describe("withAgentOperationLock", () => {
  it("serializes an Agent command before destructive maintenance", async () => {
    let releaseCommand: () => void = () => undefined
    const commandHold = new Promise<void>((resolve) => {
      releaseCommand = resolve
    })
    const sequence: string[] = []

    const command = withAgentOperationLock(async () => {
      sequence.push("command-start")
      await commandHold
      sequence.push("command-end")
    })
    const restore = withAgentOperationLock(async () => {
      sequence.push("restore")
    })
    await vi.waitFor(() => expect(sequence).toEqual(["command-start"]))

    releaseCommand()
    await Promise.all([command, restore])
    expect(sequence).toEqual(["command-start", "command-end", "restore"])
  })
})
