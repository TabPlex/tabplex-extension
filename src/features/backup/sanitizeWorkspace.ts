import { normalizeEmoji } from "~core/utils"

import { BackupValidationError } from "./errors"
import { BACKUP_LIMITS } from "./limits"
import { sanitizeTabs, type SanitizeContext } from "./sanitizeValues"
import type { PortableSnapshot, PortableWorkspace } from "./types"
import {
  asRecord,
  assertCount,
  finiteNumber,
  nullableTimestamp,
  requiredId,
  requiredString,
  requiredTimestamp
} from "./validation"
import { pushBackupWarning } from "./warnings"

export type WorkspaceSource = "current" | "v1" | "v2" | "v3"

const sanitizeColor = (value: unknown, path: string) => {
  if (value === undefined || value === null) return null
  const color = requiredString(value, path, 32)
  if (color === "transparent" || color === "none") return null
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw new BackupValidationError("invalid-color", path)
  }
  return color.toUpperCase()
}

const flattenLegacyWindowSlots = (
  value: unknown,
  path: string,
  context: SanitizeContext
) => {
  if (!Array.isArray(value)) {
    throw new BackupValidationError("invalid-array", path)
  }
  assertCount(value.length, BACKUP_LIMITS.maxSlotsPerWorkspace, path)
  if (!value.length) {
    throw new BackupValidationError("missing-window-slot", path)
  }

  const slots = value.map((slot, index) => {
    const slotPath = `${path}[${index}]`
    const raw = asRecord(slot, slotPath)
    return {
      index,
      order: finiteNumber(raw.order, `${slotPath}.order`, index),
      tabs: sanitizeTabs(raw.tabs ?? [], `${slotPath}.tabs`, context)
    }
  })

  slots.sort(
    (left, right) => left.order - right.order || left.index - right.index
  )
  pushBackupWarning(context.warnings, {
    code: "legacy-window-slots-flattened",
    path,
    message: "旧版多窗口布局已按顺序合并为扁平标签列表"
  })
  return slots.flatMap((slot) => slot.tabs)
}

const sanitizeWorkspaceTabs = (
  raw: Record<string, unknown>,
  path: string,
  source: WorkspaceSource,
  context: SanitizeContext
) => {
  if (source === "v1" || source === "v2") {
    const legacySlots = raw.windowSlots
    if (Array.isArray(legacySlots) && legacySlots.length) {
      return flattenLegacyWindowSlots(
        legacySlots,
        `${path}.windowSlots`,
        context
      )
    }
    if (source === "v2") {
      throw new BackupValidationError(
        "missing-window-slot",
        `${path}.windowSlots`
      )
    }
  }

  return sanitizeTabs(raw.tabs ?? [], `${path}.tabs`, context)
}

const sanitizeHistory = (
  value: unknown,
  path: string,
  source: WorkspaceSource,
  context: SanitizeContext
): PortableSnapshot[] => {
  const rawHistory = value === undefined ? [] : value
  if (!Array.isArray(rawHistory)) {
    throw new BackupValidationError("invalid-array", path)
  }
  assertCount(rawHistory.length, BACKUP_LIMITS.maxHistoryPerWorkspace, path)
  const ids = new Set<string>()
  return rawHistory.map((entry, index) => {
    const entryPath = `${path}[${index}]`
    const raw = asRecord(entry, entryPath)
    if ((source === "v2" || source === "v3") && raw.kind !== "flat-v1") {
      throw new BackupValidationError(
        "invalid-snapshot-kind",
        `${entryPath}.kind`
      )
    }
    const id = requiredId(raw.id, `${entryPath}.id`, BACKUP_LIMITS.maxIdLength)
    if (ids.has(id)) {
      throw new BackupValidationError(
        "duplicate-snapshot-id",
        `${entryPath}.id`
      )
    }
    ids.add(id)
    const tabs = sanitizeTabs(
      raw.tabs ?? [],
      `${entryPath}.tabs`,
      context
    ).filter((tab) => !tab.pinned && !tab.excluded)
    return {
      kind: "flat-v1",
      id,
      createdAt: requiredTimestamp(raw.createdAt, `${entryPath}.createdAt`),
      tabs
    }
  })
}

export const sanitizeWorkspace = (
  value: unknown,
  path: string,
  source: WorkspaceSource,
  context: SanitizeContext
): PortableWorkspace => {
  const raw = asRecord(value, path)
  const emojiSource =
    raw.emoji === undefined || raw.emoji === null
      ? null
      : requiredString(raw.emoji, `${path}.emoji`, 32, { allowEmpty: true })
  const emoji = emojiSource ? normalizeEmoji(emojiSource) || null : null

  return {
    id: requiredId(raw.id, `${path}.id`, BACKUP_LIMITS.maxIdLength),
    name: requiredString(
      raw.name,
      `${path}.name`,
      BACKUP_LIMITS.maxNameLength
    ).trim(),
    color: sanitizeColor(raw.color, `${path}.color`),
    emoji,
    createdAt: requiredTimestamp(raw.createdAt, `${path}.createdAt`),
    updatedAt: nullableTimestamp(raw.updatedAt, `${path}.updatedAt`),
    lastUsedAt: nullableTimestamp(raw.lastUsedAt, `${path}.lastUsedAt`),
    trashedAt: nullableTimestamp(raw.trashedAt, `${path}.trashedAt`),
    tabs: sanitizeWorkspaceTabs(raw, path, source, context),
    history: sanitizeHistory(raw.history, `${path}.history`, source, context)
  }
}
