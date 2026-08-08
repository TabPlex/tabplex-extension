import { describe, expect, it } from "vitest"

import { isTabClosing, markTabsClosing, unmarkTabClosing } from "./closingTabs"

describe("closingTabs", () => {
  it("tracks closing tabs and clears them", () => {
    markTabsClosing([1, 2])
    expect(isTabClosing(1)).toBe(true)
    expect(isTabClosing(2)).toBe(true)

    unmarkTabClosing(1)
    expect(isTabClosing(1)).toBe(false)
    expect(isTabClosing(2)).toBe(true)

    unmarkTabClosing(2)
  })

  it("ignores non-number ids", () => {
    markTabsClosing([3, "4" as any])
    expect(isTabClosing(3)).toBe(true)
    expect(isTabClosing(4)).toBe(false)

    unmarkTabClosing(3)
  })
})
