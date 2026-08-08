import { describe, expect, it, vi } from "vitest"

import {
  observeLocalStorageUsage,
  type LocalStorageUsageState
} from "./useLocalStorageUsage"

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("observeLocalStorageUsage", () => {
  it("reads usage, refreshes only for local changes, and removes its listener", async () => {
    const getBytesInUse = vi
      .fn<(keys?: string | string[] | null) => Promise<number>>()
      .mockResolvedValueOnce(128)
      .mockResolvedValueOnce(256)
    let listener:
      | ((
          changes: { [key: string]: chrome.storage.StorageChange },
          areaName: string
        ) => void)
      | null = null
    const addListener = vi.fn((nextListener) => {
      listener = nextListener
    })
    const removeListener = vi.fn()
    const states: LocalStorageUsageState[] = []

    const dispose = observeLocalStorageUsage({
      storageArea: { getBytesInUse },
      storageChanges: { addListener, removeListener },
      onStateChange: (state) => states.push(state)
    })

    await flushPromises()
    expect(states).toEqual([{ status: "ready", bytes: 128 }])

    listener?.({}, "sync")
    await flushPromises()
    expect(getBytesInUse).toHaveBeenCalledTimes(1)

    listener?.({}, "local")
    await flushPromises()
    expect(states.at(-1)).toEqual({ status: "ready", bytes: 256 })

    dispose()
    expect(removeListener).toHaveBeenCalledWith(listener)
  })

  it("reports unavailable instead of presenting a failed read as zero bytes", async () => {
    const states: LocalStorageUsageState[] = []
    const dispose = observeLocalStorageUsage({
      storageArea: {
        getBytesInUse: vi.fn().mockRejectedValue(new Error("unavailable"))
      },
      storageChanges: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      },
      onStateChange: (state) => states.push(state)
    })

    await flushPromises()
    expect(states).toEqual([{ status: "unavailable", bytes: null }])
    dispose()
  })

  it("reports invalid byte counts as unavailable", async () => {
    const states: LocalStorageUsageState[] = []
    const dispose = observeLocalStorageUsage({
      storageArea: {
        getBytesInUse: vi.fn().mockResolvedValue(Number.NaN)
      },
      storageChanges: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      },
      onStateChange: (state) => states.push(state)
    })

    await flushPromises()
    expect(states).toEqual([{ status: "unavailable", bytes: null }])
    dispose()
  })

  it("ignores an in-flight read after disposal", async () => {
    let resolveRead: ((bytes: number) => void) | null = null
    const states: LocalStorageUsageState[] = []
    const dispose = observeLocalStorageUsage({
      storageArea: {
        getBytesInUse: () =>
          new Promise<number>((resolve) => {
            resolveRead = resolve
          })
      },
      storageChanges: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      },
      onStateChange: (state) => states.push(state)
    })

    dispose()
    resolveRead?.(512)
    await flushPromises()
    expect(states).toEqual([])
  })
})
