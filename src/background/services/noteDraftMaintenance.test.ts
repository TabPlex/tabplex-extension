import { describe, expect, it, vi } from "vitest"

import { createNoteDraftMaintenance } from "./noteDraftMaintenance"

const setup = () => {
  const dependencies = {
    hasDocument: vi.fn(async () => false),
    createDocument: vi.fn(async () => undefined),
    send: vi.fn(
      async (
        _action: "delete" | "allow",
        _ids: string[]
      ): Promise<{ ok?: boolean } | undefined> => ({
        ok: true
      })
    ),
    closeDocument: vi.fn(async () => undefined)
  }
  return { dependencies, maintain: createNoteDraftMaintenance(dependencies) }
}

describe("note draft maintenance", () => {
  it("serializes document creation and cleanup jobs, then closes each document", async () => {
    const { dependencies, maintain } = setup()
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    dependencies.send.mockImplementationOnce(async () => {
      await held
      return { ok: true }
    })
    const first = maintain("delete", ["A", "A"])
    const second = maintain("delete", ["B"])
    await vi.waitFor(() => expect(dependencies.send).toHaveBeenCalledTimes(1))
    expect(dependencies.createDocument).toHaveBeenCalledTimes(1)
    release()
    await Promise.all([first, second])
    expect(dependencies.send.mock.calls).toEqual([
      ["delete", ["A"]],
      ["delete", ["B"]]
    ])
    expect(dependencies.closeDocument).toHaveBeenCalledTimes(2)
  })

  it.each([undefined, { ok: false }])(
    "does not report success for receipt %s and permits retry",
    async (receipt) => {
      const { dependencies, maintain } = setup()
      dependencies.send.mockResolvedValueOnce(receipt)
      await expect(maintain("delete", ["A"])).rejects.toThrow(
        "note-draft-cleanup-failed"
      )
      await expect(maintain("delete", ["A"])).resolves.toBeUndefined()
      expect(dependencies.closeDocument).toHaveBeenCalledTimes(2)
    }
  )

  it("skips browser work when there are no workspace ids", async () => {
    const { dependencies, maintain } = setup()
    await maintain("delete", [])
    expect(dependencies.hasDocument).not.toHaveBeenCalled()
  })
})
