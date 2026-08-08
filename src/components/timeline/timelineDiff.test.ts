import { describe, expect, it } from "vitest"

import type { TabSpec, WorkspaceSnapshot } from "~core/types"

import {
  buildTimelineSummariesAgainstCurrent,
  diffSnapshotAgainstCurrent
} from "./timelineDiff"

const tab = (url: string, extra?: Partial<TabSpec>): TabSpec => ({
  url,
  pinned: false,
  ...extra
})

describe("diffSnapshotAgainstCurrent", () => {
  it("returns no diff when snapshot equals current", () => {
    const current = [tab("https://a.com"), tab("https://b.com")]
    const snapshot = [tab("https://a.com"), tab("https://b.com")]

    const diff = diffSnapshotAgainstCurrent(current, snapshot)

    expect(diff.additions).toHaveLength(0)
    expect(diff.removals).toHaveLength(0)
  })

  it("returns additions from snapshot when snapshot has extra tabs", () => {
    const current = [tab("https://a.com")]
    const snapshot = [tab("https://a.com"), tab("https://b.com")]

    const diff = diffSnapshotAgainstCurrent(current, snapshot)

    expect(diff.additions.map((item) => item.url)).toEqual(["https://b.com"])
    expect(diff.removals).toHaveLength(0)
  })

  it("returns removals when current has extra tabs", () => {
    const current = [tab("https://a.com"), tab("https://b.com")]
    const snapshot = [tab("https://a.com")]

    const diff = diffSnapshotAgainstCurrent(current, snapshot)

    expect(diff.additions).toHaveLength(0)
    expect(diff.removals.map((item) => item.url)).toEqual(["https://b.com"])
  })

  it("counts duplicated urls correctly", () => {
    const current = [tab("https://a.com")]
    const snapshot = [tab("https://a.com"), tab("https://a.com")]

    const diff = diffSnapshotAgainstCurrent(current, snapshot)

    expect(diff.additions).toHaveLength(1)
    expect(diff.additions[0].url).toBe("https://a.com")
    expect(diff.removals).toHaveLength(0)
  })

  it("ignores pinned and excluded tabs", () => {
    const current = [
      tab("https://a.com"),
      tab("https://pinned.com", { pinned: true })
    ]
    const snapshot = [
      tab("https://a.com"),
      tab("https://excluded.com", { excluded: true })
    ]

    const diff = diffSnapshotAgainstCurrent(current, snapshot)

    expect(diff.additions).toHaveLength(0)
    expect(diff.removals).toHaveLength(0)
  })
})

describe("buildTimelineSummariesAgainstCurrent", () => {
  it("filters unchanged entries and keeps changed entries", () => {
    const current = [tab("https://a.com")]
    const history: WorkspaceSnapshot[] = [
      { id: "s1", createdAt: 1000, tabs: [tab("https://a.com")] },
      {
        id: "s2",
        createdAt: 2000,
        tabs: [tab("https://a.com"), tab("https://b.com")]
      }
    ]

    const summaries = buildTimelineSummariesAgainstCurrent(history, current)

    expect(summaries.map((item) => item.entry.id)).toEqual(["s2"])
    expect(summaries[0].additions.map((item) => item.url)).toEqual([
      "https://b.com"
    ])
  })
})
