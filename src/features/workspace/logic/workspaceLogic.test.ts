import { webcrypto } from "crypto"
import { describe, expect, it } from "vitest"

import { createTestTabSpec, createTestWorkspace } from "~src/test-utils/mocks"

import {
  applyTabExclusion,
  buildTabSpecsFromTabs,
  hasStructuralTabChanges,
  recordSnapshot,
  sanitizeTabSpecs,
  sanitizeWorkspace
} from "./workspaceLogic"

if (!globalThis.crypto?.getRandomValues) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto })
}

describe("sanitizeTabSpecs", () => {
  it("should remove invalid URLs", () => {
    const tabs = [
      createTestTabSpec({ url: "https://example.com" }),
      createTestTabSpec({ url: "" }),
      createTestTabSpec({ url: "chrome://extensions" })
    ]
    const result = sanitizeTabSpecs(tabs)
    expect(result).toHaveLength(1)
    expect(result[0].url).toBe("https://example.com")
  })

  it("should keep valid http/https URLs", () => {
    const tabs = [
      createTestTabSpec({ url: "https://example.com" }),
      createTestTabSpec({ url: "http://example.com" })
    ]
    const result = sanitizeTabSpecs(tabs)
    expect(result).toHaveLength(2)
  })

  it("should handle empty array", () => {
    const result = sanitizeTabSpecs([])
    expect(result).toEqual([])
  })

  it("keeps excluded flag in sanitizeTabSpecs", () => {
    const tabs = [createTestTabSpec({ url: "https://a.com", excluded: true })]
    const result = sanitizeTabSpecs(tabs)
    expect(result[0].excluded).toBe(true)
  })

  it("keeps only portable tab group metadata", () => {
    const tabs = [
      createTestTabSpec({
        url: "https://a.com",
        group: {
          key: " research ",
          title: "Research",
          color: "blue",
          collapsed: true,
          groupId: 42
        } as any
      })
    ]

    expect(sanitizeTabSpecs(tabs)[0].group).toEqual({
      key: "research",
      title: "Research",
      color: "blue",
      collapsed: true
    })
  })

  it("drops non-object entries without throwing", () => {
    const tabs = [
      createTestTabSpec({ url: "https://a.com" }),
      null as any,
      "bad" as any,
      { url: "https://b.com" } as any
    ]
    const result = sanitizeTabSpecs(tabs)
    expect(result.map((tab) => tab.url)).toEqual([
      "https://a.com",
      "https://b.com"
    ])
  })
})

describe("hasStructuralTabChanges", () => {
  it("should return false for identical tabs", () => {
    const tabs = [createTestTabSpec()]
    expect(hasStructuralTabChanges(tabs, tabs)).toBe(false)
  })

  it("should return true for different counts", () => {
    const tabs1 = [createTestTabSpec()]
    const tabs2 = [
      createTestTabSpec(),
      createTestTabSpec({ url: "https://other.com" })
    ]
    expect(hasStructuralTabChanges(tabs1, tabs2)).toBe(true)
  })

  it("should return true for different URLs", () => {
    const tabs1 = [createTestTabSpec({ url: "https://example.com" })]
    const tabs2 = [createTestTabSpec({ url: "https://other.com" })]
    expect(hasStructuralTabChanges(tabs1, tabs2)).toBe(true)
  })

  it("should ignore pinned tabs", () => {
    const tabs1 = [
      createTestTabSpec({ url: "https://example.com", pinned: true })
    ]
    const tabs2 = [
      createTestTabSpec({ url: "https://other.com", pinned: true })
    ]
    expect(hasStructuralTabChanges(tabs1, tabs2)).toBe(false)
  })

  it("ignores excluded tabs in structural changes", () => {
    const prev = [createTestTabSpec({ url: "https://a.com", excluded: true })]
    const next = [createTestTabSpec({ url: "https://b.com", excluded: true })]
    expect(hasStructuralTabChanges(prev, next)).toBe(false)
  })
})

describe("recordSnapshot", () => {
  it("recordSnapshot omits excluded tabs", () => {
    const workspace = createTestWorkspace({ history: [] })
    const tabs = [
      createTestTabSpec({ url: "https://a.com" }),
      createTestTabSpec({ url: "https://b.com", excluded: true })
    ]
    const updated = recordSnapshot(workspace, tabs)
    expect(updated.history?.[0].tabs.map((tab) => tab.url)).toEqual([
      "https://a.com"
    ])
  })
})

describe("applyTabExclusion", () => {
  it("applyTabExclusion marks the flat tab and prunes history", () => {
    const target = createTestTabSpec({ url: "https://a.com" })
    const workspace = createTestWorkspace({
      tabs: [target],
      tabsRevision: 2,
      history: [
        {
          id: "h1",
          createdAt: 1,
          tabs: [createTestTabSpec({ url: "https://a.com" })]
        }
      ]
    })
    const next = applyTabExclusion(workspace, 0, true)
    expect(next.tabs[0].excluded).toBe(true)
    expect(next.tabsRevision).toBe(3)
    expect(next.history?.[0].tabs).toEqual([])
  })
})

describe("sanitizeWorkspace", () => {
  it("normalizes a flat collection and defaults tabsRevision", () => {
    const value = sanitizeWorkspace(
      createTestWorkspace({
        tabsRevision: -2,
        tabs: [
          createTestTabSpec({ url: "https://a.com" }),
          createTestTabSpec({
            url: "https://pinned.example",
            pinned: true
          })
        ]
      })
    )

    expect(value.tabs.map((tab) => tab.url)).toEqual(["https://a.com"])
    expect(value.tabsRevision).toBe(0)
  })

  it("drops the retired workspace privacy field from legacy records", () => {
    const legacyWorkspace = {
      ...createTestWorkspace(),
      excluded: true
    }

    expect(sanitizeWorkspace(legacyWorkspace)).not.toHaveProperty("excluded")
  })
})

describe("buildTabSpecsFromTabs", () => {
  it("maps tabs and filters unsafe urls", () => {
    const tabs = [
      {
        url: "https://example.com",
        pendingUrl: "https://pending.com",
        pinned: true,
        title: "Example",
        favIconUrl: "https://example.com/favicon.ico"
      } as chrome.tabs.Tab,
      {
        url: "chrome://extensions",
        pinned: false,
        title: "Extensions"
      } as chrome.tabs.Tab
    ]

    const result = buildTabSpecsFromTabs(tabs)

    expect(result).toEqual([
      {
        url: "https://pending.com",
        pinned: true,
        title: "Example",
        faviconUrl: "https://example.com/favicon.ico"
      }
    ])
  })
})
