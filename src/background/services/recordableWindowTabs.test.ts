import { describe, expect, it } from "vitest"

import {
  projectRecordableWindowTabs,
  type RecordableWindowTabLike
} from "./recordableWindowTabs"

const tab = (
  index: number,
  url: string,
  overrides: Partial<RecordableWindowTabLike> = {}
): RecordableWindowTabLike => ({
  id: index + 10,
  index,
  url,
  pinned: false,
  status: "complete",
  title: `Tab ${index}`,
  favIconUrl: `https://icons.example/${index}.png`,
  ...overrides
})

const isHomeUrl = (url: string) =>
  url === "chrome-extension://tabplex/popup.html?mode=home"

describe("projectRecordableWindowTabs", () => {
  it("sorts strictly by index and excludes protected tabs", () => {
    const result = projectRecordableWindowTabs({
      tabs: [
        tab(6, "https://last.example/path"),
        tab(1, "https://pinned.example", { pinned: true }),
        tab(0, "chrome-extension://tabplex/popup.html?mode=home"),
        tab(3, "chrome://extensions"),
        tab(2, "https://first.example/path"),
        tab(4, "about:blank")
      ],
      isHomeUrl
    })

    expect(result.tabs).toEqual([
      expect.objectContaining({
        url: "https://first.example/path",
        pinned: false
      }),
      expect.objectContaining({
        url: "https://last.example/path",
        pinned: false
      })
    ])
    expect(result.recordableTabIds).toEqual([12, 16])
    expect(result.busy).toBe(false)
    expect(result.unverifiable).toBe(false)
  })

  it("uses the exact pending URL for a loading tab and reports busy", () => {
    const result = projectRecordableWindowTabs({
      tabs: [
        tab(0, "https://old.example/path", {
          id: 21,
          pendingUrl: "https://new.example/path?token=keep#section",
          status: "loading"
        })
      ],
      isHomeUrl
    })

    expect(result.tabs[0]?.url).toBe(
      "https://new.example/path?token=keep#section"
    )
    expect(result.busy).toBe(true)
    expect(result.diagnostics.busy).toEqual([
      {
        tabId: 21,
        index: 0,
        reason: "loading",
        urlSource: "pendingUrl"
      }
    ])
    expect(result.unverifiable).toBe(false)
  })

  it("uses a safe pending URL to identify a loading Chrome error page", () => {
    const result = projectRecordableWindowTabs({
      tabs: [
        tab(0, "chrome-error://chromewebdata/", {
          id: 22,
          pendingUrl: "http://localhost:3000/exact?retry=1",
          status: "loading"
        })
      ],
      isHomeUrl
    })

    expect(result.tabs).toEqual([
      expect.objectContaining({
        url: "http://localhost:3000/exact?retry=1"
      })
    ])
    expect(result.busy).toBe(true)
    expect(result.unverifiable).toBe(false)
  })

  it("marks an error page without a safe pending URL as unverifiable", () => {
    const result = projectRecordableWindowTabs({
      tabs: [
        tab(0, "chrome-error://chromewebdata/", {
          id: 23,
          pendingUrl: undefined
        })
      ],
      isHomeUrl
    })

    expect(result.tabs).toEqual([])
    expect(result.busy).toBe(false)
    expect(result.unverifiable).toBe(true)
    expect(result.diagnostics.unverifiable).toEqual([
      {
        tabId: 23,
        index: 0,
        reason: "error-page-without-safe-pending-url"
      }
    ])
  })

  it("does not accept an unsafe pending URL as error-page identity", () => {
    const result = projectRecordableWindowTabs({
      tabs: [
        tab(0, "chrome://chromewebdata/", {
          pendingUrl: "chrome://settings",
          status: "loading"
        })
      ],
      isHomeUrl
    })

    expect(result.tabs).toEqual([])
    expect(result.unverifiable).toBe(true)
  })

  it("marks a pending Chrome error destination as unverifiable", () => {
    const result = projectRecordableWindowTabs({
      tabs: [
        tab(0, "https://previous.example", {
          pendingUrl: "chrome-error://chromewebdata/",
          status: "loading"
        })
      ],
      isHomeUrl
    })

    expect(result.tabs).toEqual([])
    expect(result.unverifiable).toBe(true)
  })

  it("reports a loading safe tab as busy when pendingUrl is unavailable", () => {
    const result = projectRecordableWindowTabs({
      tabs: [
        tab(0, "https://loading.example/exact", {
          id: undefined,
          status: "loading"
        })
      ],
      isHomeUrl
    })

    expect(result.tabs[0]?.url).toBe("https://loading.example/exact")
    expect(result.diagnostics.busy).toEqual([
      {
        tabId: null,
        index: 0,
        reason: "loading",
        urlSource: "url"
      }
    ])
  })

  it("preserves duplicate URLs and exact query/hash values", () => {
    const exact = "https://example.com/path?utm_source=keep&a=1#frag"
    const result = projectRecordableWindowTabs({
      tabs: [tab(1, exact), tab(0, exact)],
      isHomeUrl
    })

    expect(result.tabs.map((item) => item.url)).toEqual([exact, exact])
  })
})
