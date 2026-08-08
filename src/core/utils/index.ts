import {
  DEFAULT_WORKSPACE_EMOJIS,
  FALLBACK_WORKSPACE_EMOJI,
  type TabSpec
} from "~core/types"

export const uuid = () => {
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0"))
  hex[6] = ((parseInt(hex[6], 16) & 0x0f) | 0x40).toString(16)
  hex[8] = ((parseInt(hex[8], 16) & 0x3f) | 0x80).toString(16)
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const normalizeHex = (value: string) => {
  const match = value.trim().replace(/^#/, "").toLowerCase()
  if (match.length === 3) {
    const [r, g, b] = match.split("")
    return `#${r}${r}${g}${g}${b}${b}`
  }
  if (match.length === 6) {
    return `#${match}`
  }
  return "#6c5ce7"
}

// 已知的跟踪/分享参数：这些参数不会改变页面"身份"，因此在 URL 归一化
// 用于 tab 复用匹配时应该被剥离，避免同一个页面被当成不同 URL 反复关闭+重开，
// 导致用户丢失滚动位置、播放进度等。
const TRACKING_QUERY_PREFIXES = ["utm_"] as const
const TRACKING_QUERY_KEYS = new Set<string>([
  "fbclid",
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "yclid",
  "ref",
  "ref_src",
  "ref_url",
  "referrer",
  "source",
  "share",
  "share_id",
  "share_source",
  "spm",
  "scm",
  "mc_cid",
  "mc_eid",
  "igshid",
  "si",
  "feature",
  "from",
  "from_source"
])

const isTrackingQueryKey = (key: string) => {
  const lower = key.toLowerCase()
  if (TRACKING_QUERY_KEYS.has(lower)) return true
  return TRACKING_QUERY_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

export const normalizeUrlForMatch = (value?: string | null) => {
  const trimmed = value?.trim() ?? ""
  if (!trimmed) return ""
  try {
    const parsed = new URL(trimmed)
    let path = parsed.pathname ?? ""
    if (path.endsWith("/")) {
      path = path.replace(/\/+$/, "")
    }

    // 剥离跟踪参数，保留语义参数（例如 ?v=xxx、?id=xxx）；并按字母顺序
    // 重建 query，避免 ?a=1&b=2 与 ?b=2&a=1 被判成两个不同的 URL。
    const keptParams: Array<[string, string]> = []
    for (const [key, val] of parsed.searchParams) {
      if (!isTrackingQueryKey(key)) keptParams.push([key, val])
    }
    keptParams.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    const rebuilt = new URLSearchParams()
    for (const [key, val] of keptParams) rebuilt.append(key, val)
    const searchStr = rebuilt.toString()
    const search = searchStr ? `?${searchStr}` : ""

    return `${parsed.origin}${path}${search}${parsed.hash}`
  } catch {
    return ""
  }
}

export const urlsEqualNormalized = (a?: string | null, b?: string | null) =>
  normalizeUrlForMatch(a) === normalizeUrlForMatch(b)

export const isSafeTabUrl = (value?: string | null) => {
  if (!value) return false
  const trimmed = value.trim()
  if (!trimmed) return false
  const lower = trimmed.toLowerCase()
  if (
    lower.startsWith("chrome-extension://") ||
    lower.startsWith("chrome://") ||
    lower.startsWith("chrome-error://") ||
    lower.startsWith("edge://") ||
    lower.startsWith("about:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("devtools:") ||
    lower.startsWith("view-source:")
  ) {
    return false
  }
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export const randomWorkspaceEmoji = () => {
  const pool = DEFAULT_WORKSPACE_EMOJIS
  if (!pool.length) return FALLBACK_WORKSPACE_EMOJI
  const index = Math.floor(Math.random() * pool.length)
  return pool[index] ?? FALLBACK_WORKSPACE_EMOJI
}

export const dedupeTabSpecs = (tabs: TabSpec[]) => {
  const seen = new Set<string>()
  const out: TabSpec[] = []
  for (let i = tabs.length - 1; i >= 0; i -= 1) {
    const t = tabs[i]
    const key = normalizeUrlForMatch(t.url)
    if (!t.url || !key) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...t })
  }
  return out.reverse()
}

const EMOJI_REGEX = /\p{Extended_Pictographic}/u

export const normalizeEmoji = (value?: string | null) => {
  if (!value) return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  try {
    const Segmenter = (Intl as any)?.Segmenter as
      | (new (
          locale?: string,
          options?: { granularity: "grapheme" }
        ) => Intl.Segmenter)
      | undefined
    if (typeof Segmenter === "function") {
      const segmenter = new Segmenter(undefined, { granularity: "grapheme" })
      let result = ""
      let count = 0
      for (const { segment } of segmenter.segment(trimmed)) {
        if (!segment) continue
        result += segment
        count += 1
        if (count >= 2) break
      }
      const normalized = result.trim()
      if (normalized && EMOJI_REGEX.test(normalized)) return normalized
      return ""
    }
  } catch {}
  const glyphs = Array.from(trimmed)
  if (!glyphs.length) return ""
  const first = glyphs.slice(0, 4).join("").trim()
  if (!first || !EMOJI_REGEX.test(first)) return ""
  return first
}

export const fuzzyIncludes = (haystack = "", needle = "") =>
  haystack.toLowerCase().includes(needle.toLowerCase())

export const formatDate = (ts?: number) => {
  if (!ts) return ""
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ""
  }
}

const RELATIVE_THRESHOLDS: Array<{
  limit: number
  unit: Intl.RelativeTimeFormatUnit
  div: number
}> = [
  { limit: 60, unit: "second", div: 1 },
  { limit: 60 * 60, unit: "minute", div: 60 },
  { limit: 24 * 60 * 60, unit: "hour", div: 60 * 60 },
  { limit: 7 * 24 * 60 * 60, unit: "day", div: 24 * 60 * 60 },
  { limit: 30 * 24 * 60 * 60, unit: "week", div: 7 * 24 * 60 * 60 },
  { limit: 365 * 24 * 60 * 60, unit: "month", div: 30 * 24 * 60 * 60 }
]

let formattingLocale: string | undefined

export const setFormattingLocale = (locale?: string) => {
  formattingLocale = locale || undefined
}

const RELATIVE_FORMATTERS = new Map<string, Intl.RelativeTimeFormat>()

const getRelativeFormatter = () => {
  const key = formattingLocale || "default"
  const cached = RELATIVE_FORMATTERS.get(key)
  if (cached) return cached
  const fmt = new Intl.RelativeTimeFormat(formattingLocale, { numeric: "auto" })
  RELATIVE_FORMATTERS.set(key, fmt)
  return fmt
}

export const formatRelativeTime = (ts?: number) => {
  if (!ts) return ""
  const now = Date.now()
  const diffSeconds = Math.round((ts - now) / 1000)
  const abs = Math.abs(diffSeconds)
  if (abs < 10) return getRelativeFormatter().format(0, "second")
  const fmt = getRelativeFormatter()
  for (const { limit, unit, div } of RELATIVE_THRESHOLDS) {
    if (abs < limit) {
      const value = Math.round(diffSeconds / div)
      return fmt.format(value, unit)
    }
  }
  const years = Math.round(diffSeconds / (365 * 24 * 60 * 60))
  return fmt.format(years, "year")
}

const KEY_MAP: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
  Esc: "Esc",
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Tab: "Tab",
  " ": "Space",
  Spacebar: "Space"
}

export const normalizeShortcutLabel = (input?: string | null) => {
  if (!input) return ""
  const parts = input
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return ""
  const mods: string[] = []
  let key = ""
  for (const p of parts) {
    const up = p.toLowerCase()
    if (up === "ctrl" || up === "control") mods.push("Ctrl")
    else if (up === "shift") mods.push("Shift")
    else if (up === "alt" || up === "option") mods.push("Alt")
    else if (up === "cmd" || up === "command" || up === "meta")
      mods.push("Command")
    else {
      const mapped = KEY_MAP[p] || KEY_MAP[p[0]?.toUpperCase() + p.slice(1)]
      if (mapped) key = mapped
      else if (p.length === 1) key = p.toUpperCase()
      else key = p
    }
  }
  if (!mods.length || !key) return ""
  return `${mods.join("+")}+${key}`
}

export const formatShortcutFromEvent = (event: KeyboardEvent) => {
  const isMac =
    typeof navigator !== "undefined" && navigator.platform.includes("Mac")
  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push("Ctrl")
  if (event.shiftKey) modifiers.push("Shift")
  if (event.altKey) modifiers.push("Alt")
  if (event.metaKey) modifiers.push(isMac ? "Command" : "")
  if (!isMac && event.metaKey) return null
  const blocked = ["Shift", "Control", "Alt", "Meta"]
  if (blocked.includes(event.key)) return null
  if (!modifiers.length) return null
  let key = event.key
  if (key in KEY_MAP) key = KEY_MAP[key]
  else if (key === " ") key = "Space"
  else if (key.length === 1) key = key.toUpperCase()
  else if (/^F\d{1,2}$/i.test(key)) key = key.toUpperCase()
  else {
    const mapped = KEY_MAP[key]
    if (!mapped) return null
    key = mapped
  }
  return `${modifiers.join("+")}+${key}`
}

export const shortcutMatchesEvent = (
  shortcut: string | undefined,
  event: KeyboardEvent
) => {
  if (!shortcut) return false
  const normalized = normalizeShortcutLabel(shortcut)
  if (!normalized) return false
  const expected = normalized.split("+")
  const keyPart = expected[expected.length - 1]
  const mods = new Set(expected.slice(0, -1))
  const needCtrl = mods.has("Ctrl")
  const needShift = mods.has("Shift")
  const needAlt = mods.has("Alt")
  const needCmd = mods.has("Command")
  if (!!event.ctrlKey !== needCtrl) return false
  if (!!event.shiftKey !== needShift) return false
  if (!!event.altKey !== needAlt) return false
  const isMac =
    typeof navigator !== "undefined" && navigator.platform.includes("Mac")
  if (!!event.metaKey && !isMac && needCmd) return false
  if (needCmd !== (isMac && !!event.metaKey)) return false
  const actualKey =
    KEY_MAP[event.key] ||
    (event.key === " "
      ? "Space"
      : event.key.length === 1
        ? event.key.toUpperCase()
        : event.key)
  return String(actualKey).toLowerCase() === String(keyPart).toLowerCase()
}

export const formatShortcutForDisplay = (
  shortcut?: string | null,
  notSetLabel: string = ""
) => {
  if (!shortcut) return notSetLabel
  const normalized = normalizeShortcutLabel(shortcut)
  if (!normalized) return notSetLabel
  const isMac =
    typeof navigator !== "undefined" && navigator.platform.includes("Mac")
  const parts = normalized.split("+")
  const map = (p: string) => {
    if (!isMac) return p
    if (p === "Alt") return "Option"
    if (p === "Ctrl") return "Control"
    return p
  }
  return parts.map(map).join("+")
}

export const resolveTabUrl = (tab: chrome.tabs.Tab) =>
  tab.pendingUrl ?? tab.url ?? ""

export const getCurrentWindowTabs = async (options?: { windowId?: number }) => {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) {
    return []
  }
  let tabs: chrome.tabs.Tab[] = []
  if (typeof options?.windowId === "number") {
    try {
      tabs = await chrome.tabs.query({ windowId: options.windowId })
    } catch {
      return []
    }
  } else {
    try {
      tabs = await chrome.tabs.query({ currentWindow: true })
    } catch {
      return []
    }
  }
  return tabs.filter((t) => isSafeTabUrl(resolveTabUrl(t)))
}
