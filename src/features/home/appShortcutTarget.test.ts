import { describe, expect, it } from "vitest"

import { isAppShortcutTargetWindow } from "./appShortcutTarget"

describe("isAppShortcutTargetWindow", () => {
  it("accepts only the exact normal window for targeted actions", () => {
    expect(isAppShortcutTargetWindow(7, { id: 7, type: "normal" })).toBe(true)
    expect(isAppShortcutTargetWindow(7, { id: 8, type: "normal" })).toBe(false)
    expect(isAppShortcutTargetWindow(7, { id: 7, type: "popup" })).toBe(false)
  })

  it("keeps untargeted legacy actions compatible", () => {
    expect(
      isAppShortcutTargetWindow(undefined, { id: 7, type: "normal" })
    ).toBe(true)
  })
})
