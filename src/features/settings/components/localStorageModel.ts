import { formatBytes } from "~lib/common"

type LocalStorageModelParams = {
  usedBytes: number
  t: (key: string, values?: Record<string, unknown>) => string
}

export const getLocalStorageModel = ({
  usedBytes,
  t
}: LocalStorageModelParams) => {
  const safeUsed = Math.max(0, usedBytes || 0)
  const usageLabel = t("storage.usage", {
    used: formatBytes(safeUsed)
  })
  const hintLabel = t("storage.localHint")

  return {
    usageLabel,
    hintLabel
  }
}
