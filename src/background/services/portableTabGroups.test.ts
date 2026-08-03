import { describe, expect, it, vi } from "vitest"

import type { TabSpec } from "~core/types"

import {
  capturePortableTabGroups,
  preservePortableTabGroups
} from "./portableTabGroups"

describe("preservePortableTabGroups", () => {
  it("preserves group metadata by normalized URL and multiplicity", () => {
    const live: TabSpec[] = [
      { url: "https://a.example/?utm_source=test", pinned: false },
      { url: "https://a.example", pinned: false },
      { url: "https://b.example", pinned: false }
    ]
    const previous: TabSpec[] = [
      {
        url: "https://a.example",
        pinned: false,
        group: { key: "first", title: "First" }
      },
      {
        url: "https://a.example/",
        pinned: false,
        group: { key: "second", color: "blue" }
      }
    ]

    expect(preservePortableTabGroups(live, previous)).toEqual([
      expect.objectContaining({ group: { key: "first", title: "First" } }),
      expect.objectContaining({ group: { key: "second", color: "blue" } }),
      expect.not.objectContaining({ group: expect.anything() })
    ])
  })

  it("never copies a runtime group id from untrusted legacy data", () => {
    const result = preservePortableTabGroups(
      [{ url: "https://a.example", pinned: false }],
      [
        {
          url: "https://a.example",
          pinned: false,
          group: { key: "safe", groupId: 99 } as any
        }
      ]
    )

    expect(result[0].group).toEqual({ key: "safe" })
  })

  it("preserves excluded privacy metadata by URL multiplicity", () => {
    const result = preservePortableTabGroups(
      [
        { url: "https://private.example", pinned: false },
        { url: "https://private.example", pinned: false }
      ],
      [
        {
          url: "https://private.example",
          pinned: false,
          excluded: true
        },
        {
          url: "https://private.example",
          pinned: false,
          excluded: false
        }
      ]
    )

    expect(result.map((tab) => tab.excluded)).toEqual([true, false])
  })

  it("captures live Chrome group metadata without persisting its runtime id", async () => {
    ;(globalThis as any).chrome = {
      tabGroups: {
        get: vi.fn().mockResolvedValue({
          id: 99,
          title: "Live group",
          color: "red",
          collapsed: true
        })
      }
    }
    const liveTabs = [
      { id: 1, groupId: 99, url: "https://a.example" },
      { id: 2, groupId: 99, url: "https://b.example" }
    ] as chrome.tabs.Tab[]

    const result = await capturePortableTabGroups({
      liveTabs,
      liveSpecs: liveTabs.map((tab) => ({ url: tab.url!, pinned: false })),
      previousTabs: []
    })

    expect(result[0].group).toEqual({
      key: "tab-group-1",
      title: "Live group",
      color: "red",
      collapsed: true
    })
    expect(result[1].group).toEqual(result[0].group)
    expect(result[0].group).not.toHaveProperty("groupId")
  })

  it("keeps a portable key while refreshing changed live group metadata", async () => {
    ;(globalThis as any).chrome = {
      tabGroups: {
        get: vi.fn().mockResolvedValue({
          id: 99,
          title: "Renamed",
          color: "green",
          collapsed: false
        })
      }
    }

    const result = await capturePortableTabGroups({
      liveTabs: [
        { id: 1, groupId: 99, url: "https://a.example" } as chrome.tabs.Tab
      ],
      liveSpecs: [{ url: "https://a.example", pinned: false }],
      previousTabs: [
        {
          url: "https://a.example",
          pinned: false,
          group: { key: "stable", title: "Old", color: "blue" }
        }
      ]
    })

    expect(result[0].group).toEqual({
      key: "stable",
      title: "Renamed",
      color: "green",
      collapsed: false
    })
  })

  it("clears prior metadata when the live tab is explicitly ungrouped", async () => {
    ;(globalThis as any).chrome = { tabGroups: { get: vi.fn() } }

    const result = await capturePortableTabGroups({
      liveTabs: [
        { id: 1, groupId: -1, url: "https://a.example" } as chrome.tabs.Tab
      ],
      liveSpecs: [{ url: "https://a.example", pinned: false }],
      previousTabs: [
        {
          url: "https://a.example",
          pinned: false,
          group: { key: "old" }
        }
      ]
    })

    expect(result[0].group).toBeUndefined()
  })
})
