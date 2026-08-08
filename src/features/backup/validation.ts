import { BackupValidationError } from "./errors"
import { BACKUP_LIMITS } from "./limits"

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"])

export const asRecord = (
  value: unknown,
  path: string
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BackupValidationError("invalid-object", path)
  }
  return value as Record<string, unknown>
}

export const asArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new BackupValidationError("invalid-array", path)
  }
  return value
}

export const requiredString = (
  value: unknown,
  path: string,
  maxLength: number,
  options?: { allowEmpty?: boolean }
) => {
  if (typeof value !== "string") {
    throw new BackupValidationError("invalid-string", path)
  }
  if (!options?.allowEmpty && !value.trim()) {
    throw new BackupValidationError("empty-string", path)
  }
  if (value.length > maxLength) {
    throw new BackupValidationError("string-too-long", path)
  }
  return value
}

const UNSAFE_ID_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/

export const requiredId = (value: unknown, path: string, maxLength: number) => {
  const id = requiredString(value, path, maxLength)
  if (
    id !== id.trim() ||
    DANGEROUS_KEYS.has(id) ||
    UNSAFE_ID_CHARACTERS.test(id)
  ) {
    throw new BackupValidationError("invalid-id", path)
  }
  return id
}

export const finiteNumber = (
  value: unknown,
  path: string,
  fallback?: number
) => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (fallback !== undefined) return fallback
  throw new BackupValidationError("invalid-number", path)
}

export const nullableTimestamp = (value: unknown, path: string) => {
  if (value === undefined || value === null) return null
  const timestamp = finiteNumber(value, path)
  if (timestamp < 0) throw new BackupValidationError("invalid-timestamp", path)
  return timestamp
}

export const requiredTimestamp = (value: unknown, path: string) => {
  const timestamp = finiteNumber(value, path)
  if (timestamp < 0) throw new BackupValidationError("invalid-timestamp", path)
  return timestamp
}

export const validateExportedAt = (value: unknown, path: string) => {
  const timestamp = requiredString(value, path, 64)
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new BackupValidationError("invalid-exported-at", path)
  }
  return timestamp
}

export const assertSafeJsonGraph = (
  root: unknown,
  options?: { maxAggregateStringBytes?: number }
) => {
  let visitedNodes = 0
  let aggregateStringBytes = 0
  const ancestors = new Set<object>()
  const textEncoder = new TextEncoder()
  const maxAggregateStringBytes =
    options?.maxAggregateStringBytes ?? BACKUP_LIMITS.maxAggregateStringBytes

  const visit = (value: unknown, path: string, depth: number) => {
    visitedNodes += 1
    if (visitedNodes > BACKUP_LIMITS.maxJsonNodes) {
      throw new BackupValidationError("count-limit-exceeded", "$")
    }
    if (depth > BACKUP_LIMITS.maxDepth) {
      throw new BackupValidationError("backup-too-deep", path)
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new BackupValidationError("non-finite-number", path)
    }
    if (
      value === undefined ||
      typeof value === "bigint" ||
      typeof value === "function" ||
      typeof value === "symbol"
    ) {
      throw new BackupValidationError("unsupported-json-value", path)
    }
    if (typeof value === "string") {
      aggregateStringBytes += textEncoder.encode(value).byteLength
      if (aggregateStringBytes > maxAggregateStringBytes) {
        throw new BackupValidationError("backup-string-budget-exceeded", path)
      }
    }
    if (!value || typeof value !== "object") return
    if (ancestors.has(value)) {
      throw new BackupValidationError("invalid-json-graph", path)
    }
    ancestors.add(value)

    try {
      if (Array.isArray(value)) {
        assertCount(value.length, BACKUP_LIMITS.maxArrayEntries, path)
        for (let index = 0; index < value.length; index += 1) {
          visit(value[index], `${path}[${index}]`, depth + 1)
        }
        return
      }

      const prototype = Object.getPrototypeOf(value)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new BackupValidationError("unsupported-json-object", path)
      }

      let propertyCount = 0
      for (const key in value as Record<string, unknown>) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue
        propertyCount += 1
        if (propertyCount > BACKUP_LIMITS.maxObjectEntries) {
          throw new BackupValidationError("count-limit-exceeded", path)
        }
        if (key.length > BACKUP_LIMITS.maxJsonKeyLength) {
          throw new BackupValidationError("string-too-long", path)
        }
        aggregateStringBytes += textEncoder.encode(key).byteLength
        if (aggregateStringBytes > maxAggregateStringBytes) {
          throw new BackupValidationError("backup-string-budget-exceeded", path)
        }
        if (DANGEROUS_KEYS.has(key)) {
          throw new BackupValidationError("dangerous-key", path)
        }
        visit(
          (value as Record<string, unknown>)[key],
          `${path}.${key}`,
          depth + 1
        )
      }
    } finally {
      ancestors.delete(value)
    }
  }

  visit(root, "$", 0)
}

export const assertCount = (value: number, maximum: number, path: string) => {
  if (value > maximum) {
    throw new BackupValidationError("count-limit-exceeded", path)
  }
}
