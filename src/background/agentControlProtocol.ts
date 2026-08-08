import type { PortableTabGroup, TabSpec } from "~core/types"
import { isSafeTabUrl, normalizeEmoji } from "~core/utils"
import { normalizeWorkspaceColor } from "~core/utils/colors"

export type AgentMutableSettingKey =
  "theme" | "language" | "accentColor" | "workspaceSort"

export const AGENT_COMMANDS = [
  "getState",
  "getWorkspace",
  "searchWorkspaces",
  "openHome",
  "openSettings",
  "openShortcuts",
  "createWorkspace",
  "switchWorkspace",
  "renameWorkspace",
  "setWorkspaceColor",
  "setWorkspaceEmoji",
  "trashWorkspace",
  "restoreWorkspace",
  "deleteWorkspace",
  "emptyTrash",
  "setWorkspaceNote",
  "openWorkspaceTab",
  "captureWorkspaceTabs",
  "setTabExcluded",
  "removeWorkspaceTabs",
  "moveWorkspaceTabs",
  "replaceWorkspaceTabs",
  "createWorkspaceSnapshot",
  "restoreWorkspaceSnapshot",
  "updateSetting"
] as const

export type AgentCommand = (typeof AGENT_COMMANDS)[number]

type AgentCommandRequest = {
  command: AgentCommand
  payload?: unknown
  windowId?: number
}

export type AgentProtocolParseResult =
  | { ok: true; request: AgentCommandRequest }
  | { ok: false; error: "invalid-agent-request" }

const HEX_COLOR_PATTERN = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i
const MAX_SEARCH_QUERY_LENGTH = 200
const MAX_WORKSPACE_NAME_LENGTH = 120
const MAX_WORKSPACE_ID_LENGTH = 128
const MAX_NOTE_LENGTH = 100_000
const MAX_TAB_URL_LENGTH = 8_192
const MAX_TAB_TITLE_LENGTH = 512
const MAX_TABS_PER_REQUEST = 500
const INVALID_PAYLOAD = Symbol("invalid-agent-payload")

const PORTABLE_GROUP_COLORS = new Set<PortableTabGroup["color"]>([
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange"
])

const commandSet = new Set<string>(AGENT_COMMANDS)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

const hasExactKeys = (
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = []
) => {
  const keys = Object.keys(value)
  const allowed = new Set([...required, ...optional])
  return (
    required.every((key) => key in value) &&
    keys.every((key) => allowed.has(key))
  )
}

const parseNoPayload = (payload: unknown, hasPayload: boolean) =>
  !hasPayload || payload === undefined ? undefined : INVALID_PAYLOAD

const normalizedString = (value: unknown, maximumLength: number) => {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized && normalized.length <= maximumLength ? normalized : null
}

const parseWorkspaceId = (value: unknown) =>
  normalizedString(value, MAX_WORKSPACE_ID_LENGTH)

const parseWorkspaceIdPayload = (payload: unknown) => {
  if (!isRecord(payload) || !hasExactKeys(payload, ["workspaceId"])) {
    return INVALID_PAYLOAD
  }
  const workspaceId = parseWorkspaceId(payload.workspaceId)
  return workspaceId ? { workspaceId } : INVALID_PAYLOAD
}

const parseConfirmedWorkspacePayload = (payload: unknown) => {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["workspaceId", "confirm"]) ||
    payload.confirm !== true
  ) {
    return INVALID_PAYLOAD
  }
  const workspaceId = parseWorkspaceId(payload.workspaceId)
  return workspaceId ? { workspaceId, confirm: true as const } : INVALID_PAYLOAD
}

const parseEmptyTrashPayload = (payload: unknown) =>
  isRecord(payload) &&
  hasExactKeys(payload, ["confirm"]) &&
  payload.confirm === true
    ? { confirm: true as const }
    : INVALID_PAYLOAD

const parseSearchPayload = (payload: unknown) => {
  if (!isRecord(payload) || !hasExactKeys(payload, ["query"])) {
    return INVALID_PAYLOAD
  }
  if (typeof payload.query !== "string") return INVALID_PAYLOAD
  const query = payload.query.trim()
  return query.length <= MAX_SEARCH_QUERY_LENGTH ? { query } : INVALID_PAYLOAD
}

const parseCreateWorkspacePayload = (payload: unknown) => {
  if (!isRecord(payload) || !hasExactKeys(payload, ["name"])) {
    return INVALID_PAYLOAD
  }
  const name = normalizedString(payload.name, MAX_WORKSPACE_NAME_LENGTH)
  return name ? { name } : INVALID_PAYLOAD
}

const parseRenameWorkspacePayload = (payload: unknown) => {
  if (!isRecord(payload) || !hasExactKeys(payload, ["workspaceId", "name"])) {
    return INVALID_PAYLOAD
  }
  const workspaceId = parseWorkspaceId(payload.workspaceId)
  const name = normalizedString(payload.name, MAX_WORKSPACE_NAME_LENGTH)
  return workspaceId && name ? { workspaceId, name } : INVALID_PAYLOAD
}

const parseWorkspaceColorPayload = (payload: unknown) => {
  if (!isRecord(payload) || !hasExactKeys(payload, ["workspaceId", "color"])) {
    return INVALID_PAYLOAD
  }
  const workspaceId = parseWorkspaceId(payload.workspaceId)
  if (!workspaceId) return INVALID_PAYLOAD
  if (payload.color === null) return { workspaceId, color: null }
  if (
    typeof payload.color !== "string" ||
    !HEX_COLOR_PATTERN.test(payload.color)
  ) {
    return INVALID_PAYLOAD
  }
  return {
    workspaceId,
    color: normalizeWorkspaceColor(payload.color) ?? null
  }
}

const parseWorkspaceEmojiPayload = (payload: unknown) => {
  if (!isRecord(payload) || !hasExactKeys(payload, ["workspaceId", "emoji"])) {
    return INVALID_PAYLOAD
  }
  const workspaceId = parseWorkspaceId(payload.workspaceId)
  if (!workspaceId) return INVALID_PAYLOAD
  if (payload.emoji === null) return { workspaceId, emoji: null }
  if (typeof payload.emoji !== "string") return INVALID_PAYLOAD
  const emoji = normalizeEmoji(payload.emoji)
  return emoji ? { workspaceId, emoji } : INVALID_PAYLOAD
}

const parseWorkspaceNotePayload = (payload: unknown) => {
  if (!isRecord(payload) || !hasExactKeys(payload, ["workspaceId", "note"])) {
    return INVALID_PAYLOAD
  }
  const workspaceId = parseWorkspaceId(payload.workspaceId)
  if (
    !workspaceId ||
    typeof payload.note !== "string" ||
    payload.note.length > MAX_NOTE_LENGTH
  ) {
    return INVALID_PAYLOAD
  }
  return { workspaceId, note: payload.note }
}

const parsePortableGroup = (value: unknown): PortableTabGroup | null => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["key"], ["title", "color", "collapsed"])
  ) {
    return null
  }
  const key = normalizedString(value.key, 128)
  if (!key) return null
  if (
    value.title !== undefined &&
    (typeof value.title !== "string" || value.title.length > 128)
  ) {
    return null
  }
  if (
    value.color !== undefined &&
    !PORTABLE_GROUP_COLORS.has(value.color as PortableTabGroup["color"])
  ) {
    return null
  }
  if (value.collapsed !== undefined && typeof value.collapsed !== "boolean") {
    return null
  }
  return {
    key,
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(PORTABLE_GROUP_COLORS.has(value.color as PortableTabGroup["color"])
      ? { color: value.color as PortableTabGroup["color"] }
      : {}),
    ...(typeof value.collapsed === "boolean"
      ? { collapsed: value.collapsed }
      : {})
  }
}

const parseTabSpec = (value: unknown): TabSpec | null => {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      ["url"],
      ["title", "pinned", "lastAccessedAt", "excluded", "group"]
    )
  ) {
    return null
  }
  if (
    typeof value.url !== "string" ||
    value.url.length > MAX_TAB_URL_LENGTH ||
    !isSafeTabUrl(value.url)
  ) {
    return null
  }
  if (
    value.title !== undefined &&
    (typeof value.title !== "string" ||
      value.title.length > MAX_TAB_TITLE_LENGTH)
  ) {
    return null
  }
  if (value.pinned !== undefined && typeof value.pinned !== "boolean") {
    return null
  }
  if (
    value.lastAccessedAt !== undefined &&
    (typeof value.lastAccessedAt !== "number" ||
      !Number.isSafeInteger(value.lastAccessedAt) ||
      value.lastAccessedAt < 0)
  ) {
    return null
  }
  if (value.excluded !== undefined && typeof value.excluded !== "boolean") {
    return null
  }
  const group =
    value.group === undefined ? undefined : parsePortableGroup(value.group)
  if (value.group !== undefined && !group) return null
  return {
    url: value.url.trim(),
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.pinned === "boolean" ? { pinned: value.pinned } : {}),
    ...(typeof value.lastAccessedAt === "number"
      ? { lastAccessedAt: value.lastAccessedAt }
      : {}),
    ...(typeof value.excluded === "boolean"
      ? { excluded: value.excluded }
      : {}),
    ...(group ? { group } : {})
  }
}

const parseOpenWorkspaceTabPayload = (payload: unknown) => {
  if (!isRecord(payload) || !hasExactKeys(payload, ["workspaceId", "tab"])) {
    return INVALID_PAYLOAD
  }
  const workspaceId = parseWorkspaceId(payload.workspaceId)
  const tab = parseTabSpec(payload.tab)
  return workspaceId && tab ? { workspaceId, tab } : INVALID_PAYLOAD
}

const parseCaptureWorkspaceTabsPayload = (payload: unknown) => {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["workspaceId"], ["skipHistory"]) ||
    (payload.skipHistory !== undefined &&
      typeof payload.skipHistory !== "boolean")
  ) {
    return INVALID_PAYLOAD
  }
  const workspaceId = parseWorkspaceId(payload.workspaceId)
  return workspaceId
    ? {
        workspaceId,
        ...(typeof payload.skipHistory === "boolean"
          ? { skipHistory: payload.skipHistory }
          : {})
      }
    : INVALID_PAYLOAD
}

const parseTabIndexOrUrl = (value: unknown) => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value
  }
  return normalizedString(value, MAX_TAB_URL_LENGTH)
}

const parseTabExcludedPayload = (payload: unknown) => {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["workspaceId", "tabIndexOrUrl", "excluded"]) ||
    typeof payload.excluded !== "boolean"
  ) {
    return INVALID_PAYLOAD
  }
  const workspaceId = parseWorkspaceId(payload.workspaceId)
  const tabIndexOrUrl = parseTabIndexOrUrl(payload.tabIndexOrUrl)
  return workspaceId && tabIndexOrUrl !== null
    ? { workspaceId, tabIndexOrUrl, excluded: payload.excluded }
    : INVALID_PAYLOAD
}

const parseTabIndexes = (value: unknown) => {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_TABS_PER_REQUEST
  ) {
    return null
  }
  if (
    value.some(
      (item) =>
        typeof item !== "number" || !Number.isSafeInteger(item) || item < 0
    )
  ) {
    return null
  }
  return [...new Set(value as number[])]
}

const parseRemoveWorkspaceTabsPayload = (payload: unknown) => {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["workspaceId", "tabIndexes"])
  ) {
    return INVALID_PAYLOAD
  }
  const workspaceId = parseWorkspaceId(payload.workspaceId)
  const tabIndexes = parseTabIndexes(payload.tabIndexes)
  return workspaceId && tabIndexes
    ? { workspaceId, tabIndexes }
    : INVALID_PAYLOAD
}

const parseMoveWorkspaceTabsPayload = (payload: unknown) => {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["sourceId", "targetId", "tabIndexes"])
  ) {
    return INVALID_PAYLOAD
  }
  const sourceId = parseWorkspaceId(payload.sourceId)
  const targetId = parseWorkspaceId(payload.targetId)
  const tabIndexes = parseTabIndexes(payload.tabIndexes)
  return sourceId && targetId && sourceId !== targetId && tabIndexes
    ? { sourceId, targetId, tabIndexes }
    : INVALID_PAYLOAD
}

const parseReplaceWorkspaceTabsPayload = (payload: unknown) => {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["workspaceId", "tabs"], ["skipHistory"]) ||
    !Array.isArray(payload.tabs) ||
    payload.tabs.length > MAX_TABS_PER_REQUEST ||
    (payload.skipHistory !== undefined &&
      typeof payload.skipHistory !== "boolean")
  ) {
    return INVALID_PAYLOAD
  }
  const workspaceId = parseWorkspaceId(payload.workspaceId)
  const tabs = payload.tabs.map(parseTabSpec)
  if (!workspaceId || tabs.some((tab) => tab === null)) return INVALID_PAYLOAD
  return {
    workspaceId,
    tabs: tabs as TabSpec[],
    ...(typeof payload.skipHistory === "boolean"
      ? { skipHistory: payload.skipHistory }
      : {})
  }
}

const parseRestoreSnapshotPayload = (payload: unknown) => {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["workspaceId", "snapshotId"])
  ) {
    return INVALID_PAYLOAD
  }
  const workspaceId = parseWorkspaceId(payload.workspaceId)
  const snapshotId = normalizedString(payload.snapshotId, 128)
  return workspaceId && snapshotId
    ? { workspaceId, snapshotId }
    : INVALID_PAYLOAD
}

const parseSettingPayload = (payload: unknown) => {
  if (!isRecord(payload) || !hasExactKeys(payload, ["key", "value"])) {
    return INVALID_PAYLOAD
  }
  const key = payload.key
  const value = payload.value
  if (
    key === "theme" &&
    (value === "dark" || value === "light" || value === "system")
  ) {
    return { key, value }
  }
  if (key === "language" && (value === "zh-CN" || value === "en-US")) {
    return { key, value }
  }
  if (
    key === "accentColor" &&
    typeof value === "string" &&
    /^#[0-9a-f]{6}$/i.test(value)
  ) {
    return { key, value: value.toUpperCase() }
  }
  if (
    key === "workspaceSort" &&
    (value === "lastUsed" || value === "created")
  ) {
    return { key, value }
  }
  return INVALID_PAYLOAD
}

type PayloadParser = (
  payload: unknown,
  hasPayload: boolean
) => unknown | typeof INVALID_PAYLOAD

const payloadParsers: Record<AgentCommand, PayloadParser> = {
  getState: parseNoPayload,
  getWorkspace: (payload) => parseWorkspaceIdPayload(payload),
  searchWorkspaces: (payload) => parseSearchPayload(payload),
  openHome: parseNoPayload,
  openSettings: parseNoPayload,
  openShortcuts: parseNoPayload,
  createWorkspace: (payload) => parseCreateWorkspacePayload(payload),
  switchWorkspace: (payload) => parseWorkspaceIdPayload(payload),
  renameWorkspace: (payload) => parseRenameWorkspacePayload(payload),
  setWorkspaceColor: (payload) => parseWorkspaceColorPayload(payload),
  setWorkspaceEmoji: (payload) => parseWorkspaceEmojiPayload(payload),
  trashWorkspace: (payload) => parseWorkspaceIdPayload(payload),
  restoreWorkspace: (payload) => parseWorkspaceIdPayload(payload),
  deleteWorkspace: (payload) => parseConfirmedWorkspacePayload(payload),
  emptyTrash: (payload) => parseEmptyTrashPayload(payload),
  setWorkspaceNote: (payload) => parseWorkspaceNotePayload(payload),
  openWorkspaceTab: (payload) => parseOpenWorkspaceTabPayload(payload),
  captureWorkspaceTabs: (payload) => parseCaptureWorkspaceTabsPayload(payload),
  setTabExcluded: (payload) => parseTabExcludedPayload(payload),
  removeWorkspaceTabs: (payload) => parseRemoveWorkspaceTabsPayload(payload),
  moveWorkspaceTabs: (payload) => parseMoveWorkspaceTabsPayload(payload),
  replaceWorkspaceTabs: (payload) => parseReplaceWorkspaceTabsPayload(payload),
  createWorkspaceSnapshot: (payload) => parseWorkspaceIdPayload(payload),
  restoreWorkspaceSnapshot: (payload) => parseRestoreSnapshotPayload(payload),
  updateSetting: (payload) => parseSettingPayload(payload)
}

const isAgentCommand = (value: unknown): value is AgentCommand =>
  typeof value === "string" && commandSet.has(value)

const parseCommandRequest = (
  message: Record<string, unknown>
): AgentCommandRequest | null => {
  if (
    !hasExactKeys(
      message,
      ["_tabplexAgent", "protocolVersion", "command"],
      ["payload", "windowId"]
    )
  ) {
    return null
  }
  if (!isAgentCommand(message.command)) return null
  if (
    message.windowId !== undefined &&
    (typeof message.windowId !== "number" ||
      !Number.isSafeInteger(message.windowId) ||
      message.windowId < 0)
  ) {
    return null
  }
  const hasPayload = Object.prototype.hasOwnProperty.call(message, "payload")
  const payload = payloadParsers[message.command](message.payload, hasPayload)
  if (payload === INVALID_PAYLOAD) return null
  return {
    command: message.command,
    ...(payload === undefined ? {} : { payload }),
    ...(typeof message.windowId === "number"
      ? { windowId: message.windowId }
      : {})
  }
}

export const parseAgentCommandRequest = (
  message: unknown
): AgentProtocolParseResult => {
  if (!isRecord(message)) return { ok: false, error: "invalid-agent-request" }
  if (message._tabplexAgent !== true || message.protocolVersion !== 1) {
    return { ok: false, error: "invalid-agent-request" }
  }
  const request = parseCommandRequest(message)
  return request
    ? { ok: true, request }
    : { ok: false, error: "invalid-agent-request" }
}
