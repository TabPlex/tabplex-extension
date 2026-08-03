import { BackupValidationError } from "./errors"
import { computeBackupDigest, verifyBackupDigest } from "./integrity"
import { BACKUP_LIMITS } from "./limits"
import {
  buildPortablePayload,
  migratePayloadV1,
  sanitizePayloadV2,
  sanitizePayloadV3
} from "./sanitizePayload"
import type {
  BackupMetadata,
  BackupSourceData,
  ParsedBackup,
  TabPlexBackupV3
} from "./types"
import {
  asRecord,
  assertSafeJsonGraph,
  requiredString,
  validateExportedAt
} from "./validation"

export const createBackupV3 = async (
  source: BackupSourceData,
  metadata: BackupMetadata
) => {
  const { payload, warnings } = buildPortablePayload(source)
  const exportedAt = validateExportedAt(
    metadata.exportedAt ?? new Date().toISOString(),
    "$.exportedAt"
  )
  const extensionVersion = requiredString(
    metadata.extensionVersion,
    "$.source.extensionVersion",
    64
  )
  const unsigned = {
    schema: "tabplex-backup" as const,
    version: 3 as const,
    exportedAt,
    source: { extensionVersion },
    payload
  }
  assertSafeJsonGraph(unsigned)
  if (
    new TextEncoder().encode(JSON.stringify(unsigned)).byteLength + 256 >
    BACKUP_LIMITS.maxBytes
  ) {
    throw new BackupValidationError("backup-too-large")
  }
  const digest = await computeBackupDigest(unsigned)
  const backup: TabPlexBackupV3 = {
    ...unsigned,
    integrity: {
      algorithm: "SHA-256",
      canonicalization: "tabplex-c14n-v1",
      digest
    }
  }
  assertSafeJsonGraph(backup)
  if (
    new TextEncoder().encode(JSON.stringify(backup)).byteLength >
    BACKUP_LIMITS.maxBytes
  ) {
    throw new BackupValidationError("backup-too-large")
  }
  return { backup, warnings }
}

const parseJson = (raw: string) => {
  if (new TextEncoder().encode(raw).byteLength > BACKUP_LIMITS.maxBytes) {
    throw new BackupValidationError("backup-too-large")
  }
  try {
    const value: unknown = JSON.parse(raw)
    assertSafeJsonGraph(value)
    return value
  } catch (error) {
    if (error instanceof BackupValidationError) throw error
    throw new BackupValidationError("invalid-json")
  }
}

const parseChecksummedBackup = async (
  root: Record<string, unknown>,
  exportedAt: string,
  version: 2 | 3
): Promise<ParsedBackup> => {
  const source = asRecord(root.source, "$.source")
  const extensionVersion = requiredString(
    source.extensionVersion,
    "$.source.extensionVersion",
    64
  )
  const integrity = asRecord(root.integrity, "$.integrity")
  if (
    integrity.algorithm !== "SHA-256" ||
    integrity.canonicalization !== "tabplex-c14n-v1"
  ) {
    throw new BackupValidationError("unsupported-integrity", "$.integrity")
  }
  const digest = requiredString(integrity.digest, "$.integrity.digest", 64)
  await verifyBackupDigest(root, digest)
  const result =
    version === 2
      ? sanitizePayloadV2(root.payload)
      : sanitizePayloadV3(root.payload)
  return {
    sourceVersion: version,
    exportedAt,
    source: { extensionVersion },
    integrity: "checksum-verified",
    payload: result.payload,
    warnings: result.warnings
  }
}

export const parseBackupFile = async (raw: string): Promise<ParsedBackup> => {
  const value = parseJson(raw)
  const root = asRecord(value, "$")
  if (root.schema !== "tabplex-backup") {
    throw new BackupValidationError("invalid-schema", "$.schema")
  }
  if (root.version !== 1 && root.version !== 2 && root.version !== 3) {
    throw new BackupValidationError("unsupported-version", "$.version")
  }
  const exportedAt = validateExportedAt(root.exportedAt, "$.exportedAt")
  if (root.version === 2 || root.version === 3) {
    return parseChecksummedBackup(root, exportedAt, root.version)
  }

  const result = migratePayloadV1(root)
  return {
    sourceVersion: 1,
    exportedAt,
    source: null,
    integrity: "legacy-unverified",
    payload: result.payload,
    warnings: result.warnings
  }
}
