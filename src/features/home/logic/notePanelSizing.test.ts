import { describe, expect, it } from "vitest"

import {
  clampNotePanelWidth,
  getMaxNotePanelWidth,
  MIN_NOTE_PANEL_WIDTH,
  resolveNotePanelKeyboardWidth
} from "./notePanelSizing"

describe("notePanelSizing", () => {
  it("keeps the note panel inside the available grid width", () => {
    expect(getMaxNotePanelWidth(1000)).toBe(628)
    expect(getMaxNotePanelWidth(400)).toBe(MIN_NOTE_PANEL_WIDTH)
    expect(clampNotePanelWidth(999, 628)).toBe(628)
    expect(clampNotePanelWidth(100, 628)).toBe(MIN_NOTE_PANEL_WIDTH)
  })

  it("maps keyboard controls to bounded note-panel widths", () => {
    expect(
      resolveNotePanelKeyboardWidth({
        currentWidth: 420,
        maxWidth: 620,
        key: "ArrowLeft"
      })
    ).toBe(436)
    expect(
      resolveNotePanelKeyboardWidth({
        currentWidth: 420,
        maxWidth: 620,
        key: "ArrowRight",
        largeStep: true
      })
    ).toBe(380)
    expect(
      resolveNotePanelKeyboardWidth({
        currentWidth: 420,
        maxWidth: 620,
        key: "Home"
      })
    ).toBe(MIN_NOTE_PANEL_WIDTH)
    expect(
      resolveNotePanelKeyboardWidth({
        currentWidth: 420,
        maxWidth: 620,
        key: "End"
      })
    ).toBe(620)
    expect(
      resolveNotePanelKeyboardWidth({
        currentWidth: 420,
        maxWidth: 620,
        key: "Enter"
      })
    ).toBeNull()
  })
})
