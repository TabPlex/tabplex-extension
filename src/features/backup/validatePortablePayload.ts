import { BackupValidationError } from "./errors"
import { BACKUP_LIMITS } from "./limits"
import { sanitizePayloadV3 } from "./sanitizePayload"
import type { BackupPayloadV3 } from "./types"
import { assertSafeJsonGraph } from "./validation"

const isJsonRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

const jsonValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    )
  }
  if (!isJsonRecord(left) || !isJsonRecord(right)) return false

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      jsonValuesEqual(left[key], right[key])
  )
}

export const validatePortablePayload = (value: unknown): BackupPayloadV3 => {
  assertSafeJsonGraph(value)
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new BackupValidationError("invalid-import-plan-payload", "$.payload")
  }
  if (
    new TextEncoder().encode(serialized).byteLength + 1024 >
    BACKUP_LIMITS.maxBytes
  ) {
    throw new BackupValidationError("backup-too-large", "$.payload")
  }

  const sanitized = sanitizePayloadV3(value)
  if (
    sanitized.warnings.length > 0 ||
    !jsonValuesEqual(value, sanitized.payload)
  ) {
    throw new BackupValidationError("invalid-import-plan-payload", "$.payload")
  }
  return sanitized.payload
}
