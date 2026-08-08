import { describe, expect, it, vi } from "vitest"

import { copyToClipboard } from "./copyToClipboard"

const createFakeDocument = (execResult: boolean) => {
  const textarea = {
    value: "",
    setAttribute: vi.fn(),
    style: {},
    select: vi.fn()
  }
  return {
    createElement: vi.fn().mockReturnValue(textarea),
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn()
    },
    execCommand: vi.fn().mockReturnValue(execResult)
  }
}

describe("copyToClipboard", () => {
  it("uses clipboard api when available", async () => {
    const clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined)
    }

    const ok = await copyToClipboard("hello", { clipboard })

    expect(ok).toBe(true)
    expect(clipboard.writeText).toHaveBeenCalledWith("hello")
  })

  it("falls back to execCommand when clipboard api fails", async () => {
    const clipboard = {
      writeText: vi.fn().mockRejectedValue(new Error("denied"))
    }
    const document = createFakeDocument(true)

    const ok = await copyToClipboard("hello", { clipboard, document })

    expect(ok).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith("copy")
  })

  it("returns false when clipboard api fails and no document is available", async () => {
    const clipboard = {
      writeText: vi.fn().mockRejectedValue(new Error("denied"))
    }

    const ok = await copyToClipboard("hello", { clipboard })

    expect(ok).toBe(false)
  })

  it("returns false when execCommand fails", async () => {
    const document = createFakeDocument(false)

    const ok = await copyToClipboard("hello", { document })

    expect(ok).toBe(false)
    expect(document.execCommand).toHaveBeenCalledWith("copy")
  })
})
