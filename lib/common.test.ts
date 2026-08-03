import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTestTabSpec } from "~src/test-utils/mocks"

import {
  applyThemePreference,
  countVisibleTabs,
  describeUrl,
  formatBytes,
  getNextIndexedName,
  readCachedThemePreference,
  resolveThemePreference,
  toErrorMessage,
  writeCachedThemePreference
} from "./common"

const setupLocalStorage = () => {
  const store = new Map<string, string>()
  const localStorageMock = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    })
  }
  return { store, localStorageMock }
}

describe("lib/common", () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const originalLocalStorage = globalThis.localStorage

  beforeEach(() => {
    const { localStorageMock } = setupLocalStorage()
    ;(globalThis as any).localStorage = localStorageMock
    ;(globalThis as any).window = {
      matchMedia: vi.fn().mockReturnValue({ matches: true })
    }
    const classSet = new Set<string>()
    const classList = {
      add: vi.fn((value: string) => classSet.add(value)),
      remove: vi.fn((value: string) => classSet.delete(value)),
      contains: (value: string) => classSet.has(value)
    }
    ;(globalThis as any).document = {
      documentElement: {
        classList,
        style: { colorScheme: "" },
        dataset: {}
      }
    }
  })

  afterEach(() => {
    ;(globalThis as any).window = originalWindow
    ;(globalThis as any).document = originalDocument
    ;(globalThis as any).localStorage = originalLocalStorage
  })

  it("formatBytes should format values", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(1024)).toBe("1.0 KB")
  })

  it("read/write cached theme preference", () => {
    writeCachedThemePreference("dark")
    expect(readCachedThemePreference()).toBe("dark")

    writeCachedThemePreference("invalid" as any)
    expect(readCachedThemePreference()).toBeNull()
  })

  it("resolveThemePreference respects browser theme", () => {
    expect(resolveThemePreference("light")).toBe("light")
    expect(resolveThemePreference("system")).toBe("dark")
  })

  it("applyThemePreference updates document attributes", () => {
    applyThemePreference("dark")
    const root = globalThis.document!.documentElement as any
    expect(root.classList.add).toHaveBeenCalledWith("dark")
    expect(root.style.colorScheme).toBe("dark")
    expect(root.dataset.themeResolved).toBe("dark")
  })

  it("describeUrl formats valid URLs", () => {
    const info = describeUrl("https://www.example.com/path/to?x=1")
    expect(info.host).toBe("example.com")
    expect(info.display).toContain("example.com")
  })

  it("describeUrl handles invalid URLs", () => {
    const info = describeUrl("not-a-url")
    expect(info.host).toBe("not-a-url")
    expect(info.display).toBe("not-a-url")
  })

  it("getNextIndexedName increments numeric suffixes", () => {
    expect(getNextIndexedName([], "Workspace")).toBe("Workspace 1")
    expect(
      getNextIndexedName(["Workspace 1", "Workspace 2"], "Workspace")
    ).toBe("Workspace 3")
    expect(getNextIndexedName(["Workspace 9", "Custom"], "Workspace")).toBe(
      "Workspace 10"
    )
  })

  it("countVisibleTabs excludes pinned tabs", () => {
    const tabs = [
      createTestTabSpec({ url: "https://a.com", pinned: true }),
      createTestTabSpec({ url: "https://b.com", pinned: false }),
      createTestTabSpec({ url: "https://c.com" })
    ]

    expect(countVisibleTabs(tabs)).toBe(2)
  })

  it("countVisibleTabs returns 0 for empty input", () => {
    expect(countVisibleTabs()).toBe(0)
  })

  it("toErrorMessage extracts message from objects", () => {
    expect(toErrorMessage({ message: "Auth session missing" })).toBe(
      "Auth session missing"
    )
    expect(toErrorMessage({ error: "bad request" })).toBe("bad request")
    expect(toErrorMessage({ details: "forbidden" })).toBe("forbidden")
  })

  it("toErrorMessage falls back for empty values", () => {
    expect(toErrorMessage("   ", "fallback")).toBe("fallback")
    expect(toErrorMessage(null, "fallback")).toBe("fallback")
  })
})
