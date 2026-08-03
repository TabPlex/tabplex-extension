import { formatBytes } from "~lib/common"

type LocalStorageModelParams = {
  usedBytes: number
  limitBytes?: number
  t: (key: string, values?: Record<string, unknown>) => string
}

const DEFAULT_LOCAL_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024

export const getLocalStorageModel = ({
  usedBytes,
  limitBytes = DEFAULT_LOCAL_STORAGE_LIMIT_BYTES,
  t
}: LocalStorageModelParams) => {
  const safeUsed = Math.max(0, usedBytes || 0)
  const safeLimit = Math.max(1, limitBytes)
  const percent = Math.min(100, Math.round((safeUsed / safeLimit) * 100))
  const usageLabel = t("storage.usage", {
    used: formatBytes(safeUsed),
    limit: formatBytes(safeLimit)
  })
  const hintLabel = t("storage.localHint", {
    limit: formatBytes(safeLimit)
  })

  return {
    percent,
    usageLabel,
    hintLabel
  }
}
