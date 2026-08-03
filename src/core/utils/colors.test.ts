import { describe, expect, it } from "vitest"

import { ACCENT_PRESET_COLORS } from "~core/types"

import {
  getContrastRatio,
  pickReadableForegroundForHex,
  resolveAccessibleAccentHex,
  type ResolvedColorTheme
} from "./colors"

const SURFACES: Record<ResolvedColorTheme, string> = {
  light: "#FFFFFF",
  dark: "#1E2430"
}

const foregroundHex = (
  value: ReturnType<typeof pickReadableForegroundForHex>
) => (value === "0 0% 0%" ? "#000000" : "#FFFFFF")

describe("accessible accent theme", () => {
  const accents = [...ACCENT_PRESET_COLORS, "#000000", "#FFFFFF", "#777777"]

  it.each(["light", "dark"] as const)(
    "keeps every preset readable on the %s surface",
    (theme) => {
      for (const accent of accents) {
        const accessible = resolveAccessibleAccentHex(accent, theme)
        const foreground = foregroundHex(
          pickReadableForegroundForHex(accessible)
        )

        expect(
          getContrastRatio(accessible, SURFACES[theme]),
          `${accent} against ${theme}`
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          getContrastRatio(accessible, foreground),
          `${accent} foreground in ${theme}`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  )

  it("chooses the higher-contrast black or white foreground", () => {
    expect(pickReadableForegroundForHex("#22C55E")).toBe("0 0% 0%")
    expect(pickReadableForegroundForHex("#111827")).toBe("0 0% 100%")

    for (const accent of accents) {
      expect(
        getContrastRatio(
          accent,
          foregroundHex(pickReadableForegroundForHex(accent))
        ),
        `${accent} button foreground`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})
