import { isSafeTabUrl } from "~core/utils"

import { BackupValidationError } from "./errors"
import { BACKUP_LIMITS } from "./limits"
import type { BackupWarning, PortableTab, PortableTabGroup } from "./types"
import {
  asRecord,
  requiredId,
  requiredString,
  requiredTimestamp
} from "./validation"
import { pushBackupWarning } from "./warnings"

export type SanitizeContext = {
  warnings: BackupWarning[]
  totalTabRecords: number
}

const PORTABLE_TAB_GROUP_COLORS = new Set<
  NonNullable<PortableTabGroup["color"]>
>([
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

const warn = (
  context: SanitizeContext,
  code: BackupWarning["code"],
  path: string,
  message: string
) => pushBackupWarning(context.warnings, { code, path, message })

const sanitizeTabGroup = (
  value: unknown,
  path: string
): PortableTabGroup | undefined => {
  if (value === undefined || value === null) return undefined
  const raw = asRecord(value, path)
  const key = requiredId(
    raw.key,
    `${path}.key`,
    BACKUP_LIMITS.maxIdLength
  ).trim()
  const title =
    raw.title === undefined || raw.title === null
      ? undefined
      : requiredString(
          raw.title,
          `${path}.title`,
          BACKUP_LIMITS.maxTitleLength,
          { allowEmpty: true }
        )

  let color: PortableTabGroup["color"]
  if (raw.color !== undefined && raw.color !== null) {
    if (
      typeof raw.color !== "string" ||
      !PORTABLE_TAB_GROUP_COLORS.has(
        raw.color as NonNullable<PortableTabGroup["color"]>
      )
    ) {
      throw new BackupValidationError(
        "invalid-tab-group-color",
        `${path}.color`
      )
    }
    color = raw.color as NonNullable<PortableTabGroup["color"]>
  }

  let collapsed: boolean | undefined
  if (raw.collapsed !== undefined && raw.collapsed !== null) {
    if (typeof raw.collapsed !== "boolean") {
      throw new BackupValidationError(
        "invalid-tab-group-collapsed",
        `${path}.collapsed`
      )
    }
    collapsed = raw.collapsed
  }

  // Runtime groupId is deliberately not part of the allowlist. Chrome assigns
  // it per browser session, so carrying it through a backup would be unsafe.
  return {
    key,
    ...(title !== undefined ? { title } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(collapsed !== undefined ? { collapsed } : {})
  }
}

const sanitizeTab = (
  value: unknown,
  path: string,
  context: SanitizeContext
): PortableTab | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    warn(context, "invalid-tab-dropped", path, "无效标签已忽略")
    return null
  }
  const raw = asRecord(value, path)
  if (typeof raw.url !== "string") {
    warn(context, "invalid-tab-dropped", path, "缺少 URL 的标签已忽略")
    return null
  }
  if (raw.url.length > BACKUP_LIMITS.maxUrlLength) {
    throw new BackupValidationError("string-too-long", `${path}.url`)
  }
  if (!isSafeTabUrl(raw.url)) {
    warn(context, "invalid-tab-dropped", path, "不安全的标签 URL 已忽略")
    return null
  }

  const title =
    raw.title === undefined || raw.title === null || raw.title === ""
      ? null
      : requiredString(
          raw.title,
          `${path}.title`,
          BACKUP_LIMITS.maxTitleLength,
          { allowEmpty: true }
        )
  const lastAccessedAt =
    raw.lastAccessedAt === undefined || raw.lastAccessedAt === null
      ? null
      : requiredTimestamp(raw.lastAccessedAt, `${path}.lastAccessedAt`)
  const group = sanitizeTabGroup(raw.group, `${path}.group`)

  return {
    url: raw.url.trim(),
    pinned: raw.pinned === true,
    title,
    // Favicons are presentation cache, not portable workspace data. Keep the
    // nullable field for v1-v3 schema compatibility, but never export or
    // restore the original URL.
    faviconUrl: null,
    lastAccessedAt,
    excluded: raw.excluded === true,
    ...(group ? { group } : {})
  }
}

export const sanitizeTabs = (
  value: unknown,
  path: string,
  context: SanitizeContext
) => {
  if (!Array.isArray(value)) {
    throw new BackupValidationError("invalid-array", path)
  }
  context.totalTabRecords += value.length
  if (context.totalTabRecords > BACKUP_LIMITS.maxTotalTabRecords) {
    throw new BackupValidationError("count-limit-exceeded", "$.tabs")
  }
  return value.flatMap((item, index) => {
    const tab = sanitizeTab(item, `${path}[${index}]`, context)
    return tab ? [tab] : []
  })
}
