import { describe, expect, it } from "vitest"

import type { TabSpec } from "~core/types"
import { prepareTabMove } from "~lib/workspaceUtils"

const createTab = (overrides: Partial<TabSpec> = {}): TabSpec => ({
  url: overrides.url ?? "https://example.com",
  pinned: overrides.pinned,
  title: overrides.title,
  faviconUrl: overrides.faviconUrl
})

describe("prepareTabMove", () => {
  it("returns selected tabs in ascending order and removes them from the source list", () => {
    const source: TabSpec[] = [
      createTab({ url: "https://a.com" }),
      createTab({ url: "https://b.com" }),
      createTab({ url: "https://c.com" })
    ]

    const { movingTabs, nextSourceTabs } = prepareTabMove(source, [2, 0])

    expect(movingTabs.map((tab) => tab.url)).toEqual([
      "https://a.com",
      "https://c.com"
    ])
    expect(nextSourceTabs.map((tab) => tab.url)).toEqual(["https://b.com"])
    expect(source.map((tab) => tab.url)).toEqual([
      "https://a.com",
      "https://b.com",
      "https://c.com"
    ])
  })

  it("returns original tabs when no indexes are provided", () => {
    const source: TabSpec[] = [createTab({ url: "https://a.com" })]

    const { movingTabs, nextSourceTabs } = prepareTabMove(source, [])

    expect(movingTabs).toHaveLength(0)
    expect(nextSourceTabs).toEqual(source)
  })

  it("ignores pinned tabs and keeps them in the source list", () => {
    const source: TabSpec[] = [
      createTab({ url: "https://a.com" }),
      createTab({ url: "https://pinned.com", pinned: true }),
      createTab({ url: "https://c.com" })
    ]

    const { movingTabs, nextSourceTabs } = prepareTabMove(source, [1, 2])

    expect(movingTabs.map((tab) => tab.url)).toEqual(["https://c.com"])
    expect(nextSourceTabs.map((tab) => tab.url)).toEqual([
      "https://a.com",
      "https://pinned.com"
    ])
  })

  it("deduplicates indexes and ignores out-of-bound selections", () => {
    const source: TabSpec[] = [
      createTab({ url: "https://a.com" }),
      createTab({ url: "https://b.com" })
    ]

    const { movingTabs, nextSourceTabs } = prepareTabMove(source, [0, 0, 99])

    expect(movingTabs.map((tab) => tab.url)).toEqual(["https://a.com"])
    expect(nextSourceTabs.map((tab) => tab.url)).toEqual(["https://b.com"])
  })

  it("leaves the source untouched when every selection is pinned or invalid", () => {
    const source: TabSpec[] = [
      createTab({ url: "https://a.com", pinned: true }),
      createTab({ url: "https://b.com" })
    ]

    const { movingTabs, nextSourceTabs } = prepareTabMove(source, [0])

    expect(movingTabs).toHaveLength(0)
    expect(nextSourceTabs).toEqual(source)
  })

  it("clones moving tabs so the caller can mutate safely", () => {
    const source: TabSpec[] = [createTab({ url: "https://a.com" })]

    const { movingTabs } = prepareTabMove(source, [0])

    movingTabs[0].title = "updated"

    expect(source[0].title).toBeUndefined()
  })
})
