export type PreferredWindowIdResult =
  { ok: true; value: number | undefined } | { ok: false }

export const parsePreferredWindowId = (
  value: unknown
): PreferredWindowIdResult => {
  if (value === undefined) return { ok: true, value: undefined }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return { ok: true, value }
  }
  return { ok: false }
}
