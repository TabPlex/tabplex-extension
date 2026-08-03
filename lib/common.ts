import type { TabSpec } from "~core/types"

export const formatBytes = (value: number, decimals = 1) => {
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  const precision = unitIndex === 0 || size >= 100 ? 0 : decimals
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

export const countVisibleTabs = (tabs?: TabSpec[]) =>
  (tabs ?? []).reduce((sum, tab) => (tab.pinned ? sum : sum + 1), 0)

export const toErrorMessage = (error: unknown, fallback = "Unknown error") => {
  if (typeof error === "string") {
    const trimmed = error.trim()
    return trimmed || fallback
  }

  if (error instanceof Error) {
    const message = error.message?.trim()
    return message || fallback
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    const candidate = record.message ?? record.error ?? record.details
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
    try {
      const json = JSON.stringify(error)
      if (json && json !== "{}") return json
    } catch {}
  }

  return fallback
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const getNextIndexedName = (
  names: Array<string | null | undefined>,
  base: string
) => {
  const trimmedBase = base.trim()
  if (!trimmedBase) return base
  const pattern = new RegExp(`^${escapeRegExp(trimmedBase)}\\s*(\\d+)$`)
  let max = 0
  for (const name of names) {
    if (!name) continue
    const match = name.match(pattern)
    if (!match) continue
    const index = Number(match[1])
    if (!Number.isFinite(index)) continue
    if (index > max) max = index
  }
  return `${trimmedBase} ${max + 1}`
}

export type ThemePreference = "dark" | "light" | "system"
export type ResolvedTheme = "dark" | "light"

const THEME_PREFERENCE_KEY = "tabplex.themePreference"
const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)"
const THEME_COLOR_PRIORITY = [
  "toolbar",
  "frame",
  "frame_inactive",
  "ntp_background",
  "omnibox_background",
  "button_background"
] as const

const isThemePreference = (value?: string | null): value is ThemePreference =>
  value === "dark" || value === "light" || value === "system"

export const readCachedThemePreference = (): ThemePreference | null => {
  if (typeof localStorage === "undefined") return null
  try {
    const value = localStorage.getItem(THEME_PREFERENCE_KEY)
    return isThemePreference(value) ? value : null
  } catch {
    return null
  }
}

export const writeCachedThemePreference = (value?: ThemePreference | null) => {
  if (typeof localStorage === "undefined") return
  try {
    if (!isThemePreference(value)) {
      localStorage.removeItem(THEME_PREFERENCE_KEY)
      return
    }
    localStorage.setItem(THEME_PREFERENCE_KEY, value)
  } catch {}
}

const resolveMediaTheme = (): ResolvedTheme => {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return "light"
  }
  return window.matchMedia(THEME_MEDIA_QUERY).matches ? "dark" : "light"
}

const normalizeThemeChannel = (value: number) => {
  if (!Number.isFinite(value)) return 0
  return value > 0 && value < 1 ? value * 255 : value
}

const normalizeThemeColor = (color: number[]) => {
  const [rawR, rawG, rawB, rawA] = color
  const alphaRaw = typeof rawA === "number" ? rawA : 1
  const alpha = alphaRaw <= 1 ? alphaRaw : alphaRaw / 255
  const r = normalizeThemeChannel(rawR)
  const g = normalizeThemeChannel(rawG)
  const b = normalizeThemeChannel(rawB)
  if (alpha >= 1) return [r, g, b]
  const blend = (channel: number) => channel * alpha + 255 * (1 - alpha)
  return [blend(r), blend(g), blend(b)]
}

const toRelativeLuminance = (channel: number) => {
  const normalized = channel / 255
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

const resolveThemeFromColors = (
  colors?: Record<string, number[] | null | undefined> | null
): ResolvedTheme | null => {
  if (!colors) return null
  for (const key of THEME_COLOR_PRIORITY) {
    const value = colors[key]
    if (!Array.isArray(value) || value.length < 3) continue
    const [r, g, b] = normalizeThemeColor(value)
    const luminance =
      0.2126 * toRelativeLuminance(r) +
      0.7152 * toRelativeLuminance(g) +
      0.0722 * toRelativeLuminance(b)
    return luminance < 0.5 ? "dark" : "light"
  }
  return null
}

const readChromeTheme = () =>
  new Promise<ResolvedTheme | null>((resolve) => {
    if (typeof chrome === "undefined") {
      resolve(null)
      return
    }
    const themeApi = (chrome as any).theme
    if (!themeApi || typeof themeApi.getCurrent !== "function") {
      resolve(null)
      return
    }
    try {
      themeApi.getCurrent((theme: any) => {
        if ((chrome as any).runtime?.lastError) {
          resolve(null)
          return
        }
        resolve(resolveThemeFromColors(theme?.colors ?? null))
      })
    } catch {
      resolve(null)
    }
  })

let cachedBrowserTheme: ResolvedTheme | null = null

export const resolveBrowserThemeSync = (): ResolvedTheme =>
  cachedBrowserTheme ?? resolveMediaTheme()

export const watchBrowserTheme = (onChange: (theme: ResolvedTheme) => void) => {
  if (typeof window === "undefined") return () => {}
  let active = true
  let hasChromeTheme = false
  let media: MediaQueryList | null = null
  let removeMediaListener: (() => void) | null = null

  const applyTheme = (theme: ResolvedTheme, fromChrome: boolean) => {
    if (!active) return
    cachedBrowserTheme = theme
    hasChromeTheme = fromChrome
    onChange(theme)
  }

  const updateFromChrome = async () => {
    const chromeTheme = await readChromeTheme()
    if (!active) return
    if (chromeTheme) {
      applyTheme(chromeTheme, true)
      return
    }
    applyTheme(resolveMediaTheme(), false)
  }

  if (typeof window.matchMedia === "function") {
    media = window.matchMedia(THEME_MEDIA_QUERY)
    const listener = (event: MediaQueryListEvent) => {
      if (hasChromeTheme) return
      applyTheme(event.matches ? "dark" : "light", false)
    }
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", listener)
      removeMediaListener = () => {
        media?.removeEventListener("change", listener)
      }
    } else if (typeof media.addListener === "function") {
      media.addListener(listener)
      removeMediaListener = () => {
        media?.removeListener(listener)
      }
    }
  }

  const themeApi = typeof chrome === "undefined" ? null : (chrome as any).theme
  const themeEvent = themeApi?.onUpdated ?? themeApi?.onThemeChanged
  const handleThemeUpdate = (info: any) => {
    const resolved = resolveThemeFromColors(
      info?.theme?.colors ?? info?.colors ?? null
    )
    if (resolved) {
      applyTheme(resolved, true)
      return
    }
    void updateFromChrome()
  }
  if (themeEvent?.addListener) {
    themeEvent.addListener(handleThemeUpdate)
  }

  void updateFromChrome()

  return () => {
    active = false
    removeMediaListener?.()
    if (themeEvent?.removeListener) {
      themeEvent.removeListener(handleThemeUpdate)
    }
    cachedBrowserTheme = null
  }
}

export const resolveThemePreference = (
  preference: ThemePreference
): ResolvedTheme => {
  if (preference !== "system") return preference
  return resolveBrowserThemeSync()
}

export const applyThemePreference = (preference?: ThemePreference | null) => {
  if (typeof document === "undefined") return
  const resolved = resolveThemePreference(preference ?? "system")
  const root = document.documentElement
  if (resolved === "dark") root.classList.add("dark")
  else root.classList.remove("dark")
  root.style.colorScheme = resolved
  root.dataset.themePreference = preference ?? "system"
  root.dataset.themeResolved = resolved
}

export const describeUrl = (url: string) => {
  const truncate = (value: string, max = 60) =>
    value.length > max ? `${value.slice(0, max - 1)}…` : value

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, "")
    const rawPath = parsed.pathname.replace(/\/$/, "")
    const path = rawPath && rawPath !== "/" ? rawPath : ""
    const decodedPath = (() => {
      if (!path) return ""
      try {
        return decodeURI(path)
      } catch {
        return path
      }
    })()
    const prettyPath = truncate(decodedPath, 48)
    const display = prettyPath ? `${host}${prettyPath}` : host
    return { host, path: prettyPath, display }
  } catch {
    return { host: url, path: "", display: url }
  }
}
