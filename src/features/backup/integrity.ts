import { canonicalJson, sha256Hex } from "./canonicalJson"
import { BackupValidationError } from "./errors"

const withoutIntegrity = (value: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "integrity")
  )

export const computeBackupDigest = async (value: Record<string, unknown>) =>
  sha256Hex(canonicalJson(withoutIntegrity(value)))

export const verifyBackupDigest = async (
  value: Record<string, unknown>,
  expected: string
) => {
  if (!/^[a-f0-9]{64}$/.test(expected)) {
    throw new BackupValidationError("invalid-checksum", "$.integrity.digest")
  }
  const actual = await computeBackupDigest(value)
  if (actual !== expected) {
    throw new BackupValidationError("checksum-mismatch", "$.integrity.digest")
  }
}
