import { beforeEach, describe, expect, it, vi } from "vitest"

import { STORAGE_KEYS } from "~core/types"

import {
  formatLogEntries,
  getLogEntries,
  logWarn,
  MAX_LOG_ENTRIES
} from "./logger"

const setupChromeStorage = () => {
  const store: Record<string, any> = {}
  const local = {
    get: vi.fn(async (key: string) => ({ [key]: store[key] })),
    set: vi.fn(async (items: Record<string, any>) => {
      Object.assign(store, items)
    }),
    remove: vi.fn(async (key: string) => {
      delete store[key]
    })
  }
  ;(globalThis as any).chrome = { storage: { local } }
  return store
}

describe("logger", () => {
  beforeEach(() => {
    setupChromeStorage()
  })

  it("trims entries to the max size", async () => {
    const total = MAX_LOG_ENTRIES + 5
    for (let i = 0; i < total; i += 1) {
      await logWarn("test", `msg-${i}`)
    }

    const entries = await getLogEntries()
    expect(entries).toHaveLength(MAX_LOG_ENTRIES)
    expect(entries[0]?.message).toBe("msg-5")
    expect(entries.at(-1)?.message).toBe(`msg-${total - 1}`)
  })

  it("formats entries as readable lines", () => {
    const text = formatLogEntries([
      {
        id: "log-1",
        ts: 0,
        level: "warn",
        area: "core",
        message: "boom",
        detail: "detail"
      }
    ])

    expect(text).toContain("1970-01-01T00:00:00.000Z")
    expect(text).toContain("[WARN]")
    expect(text).toContain("[core]")
    expect(text).toContain("boom")
    expect(text).toContain("detail")
  })

  it("returns empty when storage is unavailable", async () => {
    const original = (globalThis as any).chrome
    delete (globalThis as any).chrome
    try {
      const entries = await getLogEntries()
      expect(entries).toEqual([])
    } finally {
      ;(globalThis as any).chrome = original
    }
  })

  it("persists logs under STORAGE_KEYS.LOGS", async () => {
    await logWarn("storage", "saved")
    const entries = await getLogEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.message).toBe("saved")
    const chromeLocal = (globalThis as any).chrome.storage.local
    expect(chromeLocal.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.LOGS]: entries
    })
  })

  it("exports sync warning details for copy/download logs", async () => {
    await logWarn("cloud-sync:ui", "手动同步失败提示", {
      code: "CONFLICT",
      error: "同步发现冲突",
      logId: "req_sync_123"
    })

    const entries = await getLogEntries()
    const text = formatLogEntries(entries)

    expect(text).toContain("[cloud-sync:ui]")
    expect(text).toContain("CONFLICT")
    expect(text).toContain("req_sync_123")
  })
})
