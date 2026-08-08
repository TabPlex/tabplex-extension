import { STORAGE_KEYS } from "~core/types"

export type LogLevel = "warn" | "error"

export type LogEntry = {
  id: string
  ts: number
  level: LogLevel
  area: string
  message: string
  detail?: string
}

export const MAX_LOG_ENTRIES = 100

let consoleEnabled = false
let writeQueue: Promise<void> = Promise.resolve()

const getStorage = () => {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null
  return chrome.storage.local
}

const enqueueWrite = async <T>(task: () => Promise<T>) => {
  const run = writeQueue.then(task, task)
  writeQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

const createLogId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const normalizeDetail = (detail?: unknown) => {
  if (detail === null || detail === undefined) return undefined
  if (detail instanceof Error) {
    return detail.stack || detail.message || String(detail)
  }
  try {
    return typeof detail === "string" ? detail : JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

const logToConsole = (entry: LogEntry) => {
  if (!consoleEnabled) return
  const prefix = `[TabPlex] ${entry.area}`
  if (entry.level === "error") {
    if (entry.detail) {
      console.error(prefix, entry.message, entry.detail)
    } else {
      console.error(prefix, entry.message)
    }
    return
  }
  if (entry.detail) {
    console.warn(prefix, entry.message, entry.detail)
  } else {
    console.warn(prefix, entry.message)
  }
}

const toLogLine = (entry: LogEntry) => {
  const ts = new Date(entry.ts).toISOString()
  const level = entry.level.toUpperCase()
  const area = entry.area || "app"
  const detail = entry.detail ? ` | ${entry.detail}` : ""
  return `${ts} [${level}] [${area}] ${entry.message}${detail}`
}

export const setLoggerConsoleEnabled = (enabled: boolean) => {
  consoleEnabled = enabled
}

export const getLogEntries = async (): Promise<LogEntry[]> => {
  const storage = getStorage()
  if (!storage) return []
  try {
    const result = await storage.get(STORAGE_KEYS.LOGS)
    const raw = result?.[STORAGE_KEYS.LOGS]
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (entry) =>
        entry &&
        typeof entry.ts === "number" &&
        (entry.level === "warn" || entry.level === "error") &&
        typeof entry.area === "string" &&
        typeof entry.message === "string"
    )
  } catch {
    return []
  }
}

export const formatLogEntries = (entries: LogEntry[]) =>
  entries.map(toLogLine).join("\n")

const appendLogEntry = async (entry: LogEntry) =>
  enqueueWrite(async () => {
    const storage = getStorage()
    if (!storage) {
      logToConsole(entry)
      return []
    }
    const entries = await getLogEntries()
    const next = [...entries, entry]
    const trimmed =
      next.length > MAX_LOG_ENTRIES ? next.slice(-MAX_LOG_ENTRIES) : next
    try {
      await storage.set({ [STORAGE_KEYS.LOGS]: trimmed })
    } catch {}
    logToConsole(entry)
    return trimmed
  })

const log = async (
  level: LogLevel,
  area: string,
  message: string,
  detail?: unknown
) => {
  const entry: LogEntry = {
    id: createLogId(),
    ts: Date.now(),
    level,
    area,
    message,
    detail: normalizeDetail(detail)
  }
  return appendLogEntry(entry)
}

export const logWarn = async (
  area: string,
  message: string,
  detail?: unknown
) => log("warn", area, message, detail)

export const logError = async (
  area: string,
  message: string,
  detail?: unknown
) => log("error", area, message, detail)
