import { DEFAULT_SETTINGS } from "~core/types"
import { clamp, normalizeHex } from "~core/utils"

const hexToRgb = (hex: string) => {
  const normalized = normalizeHex(hex).replace(/^#/, "")
  const int = parseInt(normalized, 16)
  return {
    r: (int >> 16) & 0xff,
    g: (int >> 8) & 0xff,
    b: int & 0xff
  }
}

const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (v: number) =>
    clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const hexToHsl = (hex: string) => {
  const { r, g, b } = hexToRgb(hex)
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  const delta = max - min
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    switch (max) {
      case rn:
        h = (gn - bn) / delta + (gn < bn ? 6 : 0)
        break
      case gn:
        h = (bn - rn) / delta + 2
        break
      default:
        h = (rn - gn) / delta + 4
        break
    }
    h /= 6
  }

  return { h: h * 360, s, l }
}

const hslToHex = (h: number, s: number, l: number) => {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp(s, 0, 1)
  const lig = clamp(l, 0, 1)

  if (sat === 0) {
    const gray = lig * 255
    return rgbToHex(gray, gray, gray)
  }

  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat
  const p = 2 * lig - q
  const hk = hue / 360

  const channel = (t: number) => {
    let temp = t
    if (temp < 0) temp += 1
    if (temp > 1) temp -= 1
    if (temp < 1 / 6) return p + (q - p) * 6 * temp
    if (temp < 1 / 2) return q
    if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6
    return p
  }

  const r = channel(hk + 1 / 3) * 255
  const g = channel(hk) * 255
  const b = channel(hk - 1 / 3) * 255

  return rgbToHex(r, g, b)
}

const shift = (
  base: { h: number; s: number; l: number },
  delta: { h?: number; s?: number; l?: number }
) => {
  const nextH = (((base.h + (delta.h ?? 0)) % 360) + 360) % 360
  const nextS = clamp(base.s + (delta.s ?? 0), 0, 1)
  const nextL = clamp(base.l + (delta.l ?? 0), 0, 1)
  return { h: nextH, s: nextS, l: nextL }
}

export const normalizeWorkspaceColor = (value?: string | null) => {
  if (value === null) return null
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const lowered = trimmed.toLowerCase()
  if (lowered === "transparent" || lowered === "none") {
    return null
  }
  return normalizeHex(trimmed).toUpperCase()
}

export const isWorkspaceColorTransparent = (value?: string | null) => {
  if (value === null) return true
  if (!value) return false
  return value.trim().toLowerCase() === "transparent"
}

export const resolveWorkspaceColor = (
  value: string | null | undefined,
  fallback: string
) => {
  if (isWorkspaceColorTransparent(value)) return "transparent"
  if (value && value.trim()) return value
  return fallback
}

export const colorChoices = (accent?: string) => {
  const fallback = DEFAULT_SETTINGS.accentColor ?? "#6C5CE7"
  const baseHex = accent ? normalizeHex(accent) : fallback
  const baseHsl = hexToHsl(baseHex)
  const seen = new Set<string>()
  const palette: string[] = []

  const push = (h: number, s: number, l: number) => {
    const hex = hslToHex(h, s, l).toUpperCase()
    if (seen.has(hex)) return
    seen.add(hex)
    palette.push(hex)
  }

  push(baseHsl.h, baseHsl.s, baseHsl.l)

  const adjustments: Array<{ h?: number; s?: number; l?: number }> = [
    { l: 0.18 },
    { l: 0.1 },
    { l: -0.12 },
    { h: -25, l: 0.08 },
    { h: 20, l: 0.04 },
    { h: -12, s: 0.08, l: -0.08 },
    { h: 12, s: 0.06, l: -0.04 },
    { h: 180, s: -0.1, l: 0.06 },
    { h: 180, s: -0.08, l: -0.08 },
    { h: 150, l: 0.12 }
  ]

  adjustments.forEach((delta) => {
    const { h, s, l } = shift(baseHsl, delta)
    push(h, s, l)
  })

  // Fill up to 16 colors with bounded attempts to avoid infinite loops
  for (let i = 0; i < 80 && palette.length < 16; i += 1) {
    const extra = shift(baseHsl, {
      h: i * 23 - 120,
      s: ((i % 5) - 2) * 0.05,
      l: ((i % 3) - 1) * 0.12
    })
    push(extra.h, extra.s, extra.l)
  }

  return palette.slice(0, 16)
}

const toLinearChannel = (channel: number) => {
  const normalized = channel / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

const relativeLuminance = (hex: string) => {
  const { r, g, b } = hexToRgb(hex)
  return (
    0.2126 * toLinearChannel(r) +
    0.7152 * toLinearChannel(g) +
    0.0722 * toLinearChannel(b)
  )
}

export const getContrastRatio = (first: string, second: string) => {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

export const pickReadableForegroundForHex = (hex: string) =>
  getContrastRatio(hex, "#000000") >= getContrastRatio(hex, "#FFFFFF")
    ? ("0 0% 0%" as const)
    : ("0 0% 100%" as const)

export type ResolvedColorTheme = "light" | "dark"

const THEME_SURFACES: Record<ResolvedColorTheme, string> = {
  light: "#FFFFFF",
  dark: "#1E2430"
}

export const resolveAccessibleAccentHex = (
  accent: string,
  theme: ResolvedColorTheme,
  minimumContrast = 4.5
) => {
  const normalized = normalizeHex(accent).toUpperCase()
  const surface = THEME_SURFACES[theme]
  if (getContrastRatio(normalized, surface) >= minimumContrast) {
    return normalized
  }

  const base = hexToHsl(normalized)
  const direction = theme === "dark" ? 1 : -1
  for (let step = 1; step <= 100; step += 1) {
    const lightness = clamp(base.l + direction * (step / 100), 0, 1)
    const candidate = hslToHex(base.h, base.s, lightness).toUpperCase()
    if (getContrastRatio(candidate, surface) >= minimumContrast) {
      return candidate
    }
  }

  return theme === "dark" ? "#FFFFFF" : "#000000"
}

export const applyAccentTheme = (
  accent?: string,
  resolvedTheme?: ResolvedColorTheme
) => {
  if (typeof document === "undefined") return
  try {
    const docEl = document.documentElement
    const base = normalizeHex(
      accent || DEFAULT_SETTINGS.accentColor || "#6C5CE7"
    )
    const theme =
      resolvedTheme ?? (docEl.classList.contains("dark") ? "dark" : "light")
    const accessibleAccent = resolveAccessibleAccentHex(base, theme)
    const baseHsl = hexToHsl(base)
    const accessibleHsl = hexToHsl(accessibleAccent)
    const primary = `${Math.round(baseHsl.h)} ${Math.round(
      baseHsl.s * 100
    )}% ${Math.round(baseHsl.l * 100)}%`
    const primaryReadable = `${Math.round(accessibleHsl.h)} ${Math.round(
      accessibleHsl.s * 100
    )}% ${Math.round(accessibleHsl.l * 100)}%`

    const primaryForeground = pickReadableForegroundForHex(base)

    docEl.style.setProperty("--primary", primary)
    docEl.style.setProperty("--primary-readable", primaryReadable)
    docEl.style.setProperty("--ring", primaryReadable)
    docEl.style.setProperty("--primary-foreground", primaryForeground)
    docEl.style.setProperty("--accent", primary)
    docEl.style.setProperty("--accent-foreground", primaryForeground)
  } catch (err) {
    console.warn("[TabPlex] 应用主题色失败", err)
  }
}
