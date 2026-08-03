import { describe, expect, it, vi } from "vitest"

import { createTestTabSpec } from "~src/test-utils/mocks"

import {
  clamp,
  dedupeTabSpecs,
  formatDate,
  formatRelativeTime,
  formatShortcutForDisplay,
  formatShortcutFromEvent,
  fuzzyIncludes,
  getCurrentWindowTabs,
  isSafeTabUrl,
  normalizeEmoji,
  normalizeHex,
  normalizeShortcutLabel,
  normalizeUrlForMatch,
  randomWorkspaceEmoji,
  resolveTabUrl,
  setFormattingLocale,
  shortcutMatchesEvent,
  urlsEqualNormalized
} from "./index"

describe("normalizeUrlForMatch", () => {
  it("should remove trailing slash", () => {
    expect(normalizeUrlForMatch("https://example.com/")).toBe(
      "https://example.com"
    )
  })

  it("should keep query parameters", () => {
    expect(normalizeUrlForMatch("https://example.com?foo=bar")).toBe(
      "https://example.com?foo=bar"
    )
  })

  it("should keep hash", () => {
    expect(normalizeUrlForMatch("https://example.com#section")).toBe(
      "https://example.com#section"
    )
  })

  it("should keep path", () => {
    expect(normalizeUrlForMatch("https://example.com/path")).toBe(
      "https://example.com/path"
    )
  })

  it("should handle empty string", () => {
    expect(normalizeUrlForMatch("")).toBe("")
  })

  it("should handle invalid URL", () => {
    expect(normalizeUrlForMatch("not-a-url")).toBe("")
  })

  it.each([
    ["utm_source", "google"],
    ["utm_medium", "email"],
    ["utm_campaign", "promo"],
    ["utm_term", "xxx"],
    ["utm_content", "xxx"],
    ["fbclid", "abc"],
    ["gclid", "abc"],
    ["msclkid", "abc"],
    ["spm", "abc"],
    ["ref", "homepage"],
    ["share", "1"],
    ["igshid", "abc"],
    ["feature", "share"]
  ])("should strip tracking param %s", (key, val) => {
    expect(
      normalizeUrlForMatch(`https://example.com/watch?${key}=${val}`)
    ).toBe("https://example.com/watch")
  })

  it("should keep semantic params while stripping tracking ones", () => {
    expect(
      normalizeUrlForMatch(
        "https://youtube.com/watch?v=abc123&feature=share&utm_source=x"
      )
    ).toBe("https://youtube.com/watch?v=abc123")
  })

  it("should sort remaining query params alphabetically", () => {
    expect(normalizeUrlForMatch("https://example.com?b=2&a=1")).toBe(
      normalizeUrlForMatch("https://example.com?a=1&b=2")
    )
  })

  it("should treat same URL with and without tracking params as equal via urlsEqualNormalized", () => {
    const a = "https://example.com/page?id=1"
    const b = "https://example.com/page?id=1&utm_source=twitter&fbclid=xxx"
    expect(urlsEqualNormalized(a, b)).toBe(true)
  })
})

describe("dedupeTabSpecs", () => {
  it("should dedupe identical URLs", () => {
    const tabs = [
      createTestTabSpec({ url: "https://example.com" }),
      createTestTabSpec({ url: "https://example.com" })
    ]
    const result = dedupeTabSpecs(tabs)
    expect(result).toHaveLength(1)
  })

  it("should keep different URLs", () => {
    const tabs = [
      createTestTabSpec({ url: "https://example.com" }),
      createTestTabSpec({ url: "https://other.com" })
    ]
    const result = dedupeTabSpecs(tabs)
    expect(result).toHaveLength(2)
  })

  it("should keep most recently accessed tab", () => {
    const tabs = [
      createTestTabSpec({ url: "https://example.com", lastAccessedAt: 100 }),
      createTestTabSpec({ url: "https://example.com", lastAccessedAt: 200 })
    ]
    const result = dedupeTabSpecs(tabs)
    expect(result[0].lastAccessedAt).toBe(200)
  })
})

describe("clamp", () => {
  it("should clamp values within bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})

describe("normalizeHex", () => {
  it("should normalize 3-digit hex", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc")
  })

  it("should normalize 6-digit hex", () => {
    expect(normalizeHex("A1B2C3")).toBe("#a1b2c3")
  })

  it("should fall back on invalid input", () => {
    expect(normalizeHex("abcd")).toBe("#6c5ce7")
  })
})

describe("urlsEqualNormalized", () => {
  it("should treat normalized URLs as equal", () => {
    expect(
      urlsEqualNormalized("https://example.com/", "https://example.com")
    ).toBe(true)
  })
})

describe("isSafeTabUrl", () => {
  it("should allow http/https urls", () => {
    expect(isSafeTabUrl("https://example.com")).toBe(true)
    expect(isSafeTabUrl("http://example.com")).toBe(true)
  })

  it("should reject chrome and other unsafe urls", () => {
    expect(isSafeTabUrl("chrome://extensions")).toBe(false)
    expect(isSafeTabUrl("about:blank")).toBe(false)
    expect(isSafeTabUrl("file:///tmp/test")).toBe(false)
  })
})

describe("randomWorkspaceEmoji", () => {
  it("should return a value from the emoji pool", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0)
    const emoji = randomWorkspaceEmoji()
    spy.mockRestore()
    expect(emoji).toBeTruthy()
  })
})

describe("normalizeEmoji", () => {
  it("should keep valid emoji", () => {
    expect(normalizeEmoji("🧪")).toBe("🧪")
  })

  it("should remove invalid characters", () => {
    expect(normalizeEmoji("abc")).toBe("")
  })
})

describe("formatDate", () => {
  it("should format valid timestamps", () => {
    expect(formatDate(1700000000000)).toBeTruthy()
  })

  it("should return empty string for invalid input", () => {
    expect(formatDate(undefined)).toBe("")
  })
})

describe("formatRelativeTime", () => {
  it("should format relative time strings", () => {
    setFormattingLocale("en")
    const now = Date.now()
    const result = formatRelativeTime(now + 60 * 1000)
    expect(result).toBeTruthy()
  })

  it("should return empty string when timestamp is missing", () => {
    expect(formatRelativeTime(undefined)).toBe("")
  })
})

describe("fuzzyIncludes", () => {
  it("should match identical strings", () => {
    expect(fuzzyIncludes("hello", "hello")).toBe(true)
  })

  it("should ignore case", () => {
    expect(fuzzyIncludes("Hello", "hello")).toBe(true)
  })

  it("should match substrings", () => {
    expect(fuzzyIncludes("hello world", "world")).toBe(true)
  })

  it("should return false on mismatch", () => {
    expect(fuzzyIncludes("hello", "xyz")).toBe(false)
  })
})

describe("normalizeShortcutLabel", () => {
  it("should normalize shortcut labels", () => {
    expect(normalizeShortcutLabel("ctrl + shift + a")).toBe("Ctrl+Shift+A")
  })

  it("should return empty on invalid input", () => {
    expect(normalizeShortcutLabel("shift")).toBe("")
  })
})

describe("formatShortcutFromEvent", () => {
  it("should format shortcut from event on mac", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { platform: "MacIntel" },
      configurable: true
    })
    const shortcut = formatShortcutFromEvent({
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
      metaKey: true,
      key: "k"
    } as KeyboardEvent)
    expect(shortcut).toBe("Shift+Command+K")
  })
})

describe("shortcutMatchesEvent", () => {
  it("should match shortcut with event", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { platform: "Win32" },
      configurable: true
    })
    const matches = shortcutMatchesEvent("Ctrl+Shift+A", {
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      key: "a"
    } as KeyboardEvent)
    expect(matches).toBe(true)
  })
})

describe("formatShortcutForDisplay", () => {
  it("should format shortcut for display on mac", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { platform: "MacIntel" },
      configurable: true
    })
    expect(formatShortcutForDisplay("Ctrl+Alt+A")).toBe("Control+Option+A")
  })

  it("should return not-set label when invalid", () => {
    expect(formatShortcutForDisplay("invalid", "N/A")).toBe("N/A")
  })
})

describe("resolveTabUrl", () => {
  it("prefers pendingUrl when available", () => {
    expect(
      resolveTabUrl({
        url: "https://example.com",
        pendingUrl: "https://new.com"
      } as any)
    ).toBe("https://new.com")
  })

  it("falls back to url when pendingUrl is missing", () => {
    expect(resolveTabUrl({ url: "https://example.com" } as any)).toBe(
      "https://example.com"
    )
  })

  it("returns empty string when no url is present", () => {
    expect(resolveTabUrl({} as any)).toBe("")
  })
})

describe("getCurrentWindowTabs", () => {
  it("should return empty list when chrome tabs not available", async () => {
    const original = (globalThis as any).chrome
    delete (globalThis as any).chrome
    const result = await getCurrentWindowTabs()
    expect(result).toEqual([])
    ;(globalThis as any).chrome = original
  })

  it("should filter unsafe urls using pendingUrl when available", async () => {
    ;(globalThis as any).chrome = {
      tabs: {
        query: vi
          .fn()
          .mockResolvedValue([
            { url: "https://example.com" },
            { url: "chrome://extensions", pendingUrl: "https://new-site.com" },
            { url: "https://safe.com", pendingUrl: "chrome://settings" }
          ])
      }
    }
    const result = await getCurrentWindowTabs()
    expect(result).toHaveLength(2)
    expect(result[0]?.url).toBe("https://example.com")
    expect(result[1]?.pendingUrl).toBe("https://new-site.com")
  })

  it("should return empty list when windowId query fails", async () => {
    ;(globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockImplementation((query: any) => {
          if (query?.windowId !== undefined) {
            throw new Error("window not found")
          }
          return Promise.resolve([{ url: "https://example.com" }])
        })
      }
    }
    const result = await getCurrentWindowTabs({ windowId: 999 })
    expect(result).toEqual([])
  })
})
