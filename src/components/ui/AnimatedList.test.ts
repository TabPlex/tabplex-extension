import { describe, expect, it } from "vitest"

import {
  resolveAnimatedListItemDelay,
  resolveAnimatedListItemMotion
} from "./AnimatedList"

describe("resolveAnimatedListItemMotion", () => {
  it("renders immediately without opacity or transform entry motion", () => {
    expect(
      resolveAnimatedListItemMotion({
        reduceMotion: true,
        inView: false,
        delay: 0.4
      })
    ).toEqual({
      initial: false,
      animate: { scale: 1, opacity: 1, y: 0 },
      transition: { duration: 0 }
    })
  })

  it("retains the staggered entry animation for default motion", () => {
    expect(
      resolveAnimatedListItemMotion({
        reduceMotion: false,
        inView: true,
        delay: 0.08
      })
    ).toEqual({
      initial: { scale: 0.98, opacity: 0, y: 6 },
      animate: { scale: 1, opacity: 1, y: 0 },
      transition: { duration: 0.2, delay: 0.08 }
    })
  })

  it("does not delay list items outside the initial viewport sequence", () => {
    expect(resolveAnimatedListItemDelay(7, 0.04)).toBeCloseTo(0.28)
    expect(resolveAnimatedListItemDelay(8, 0.04)).toBe(0)
    expect(resolveAnimatedListItemDelay(80, 0.04)).toBe(0)
  })
})
