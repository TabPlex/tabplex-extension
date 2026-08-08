import { describe, expect, it } from "vitest"

import { resolveNextSelectionState } from "./useDragAndDrop"

describe("resolveNextSelectionState", () => {
  it("creates a range from the last selected flat-list item", () => {
    const result = resolveNextSelectionState({
      selected: [1],
      index: 4,
      options: { range: true },
      anchor: { index: 1 }
    })

    expect(result.selected).toEqual([1, 2, 3, 4])
    expect(result.anchor).toEqual({ index: 4 })
  })

  it("falls back to the current item without an anchor", () => {
    const result = resolveNextSelectionState({
      selected: [1, 2],
      index: 6,
      options: { range: true },
      anchor: null
    })

    expect(result.selected).toEqual([6])
    expect(result.anchor).toEqual({ index: 6 })
  })
})
