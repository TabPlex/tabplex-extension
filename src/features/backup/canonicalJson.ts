const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"])

const toCanonicalJson = (
  value: unknown,
  ancestors: Set<object>,
  depth: number
): string => {
  if (depth > 64) throw new Error("backup-too-deep")
  if (value === null) return "null"

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value)
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite-number")
    return JSON.stringify(value)
  }
  if (typeof value !== "object") throw new Error("unsupported-json-value")
  if (ancestors.has(value)) throw new Error("cyclic-json-value")

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((item) => toCanonicalJson(item, ancestors, depth + 1))
        .join(",")}]`
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("unsupported-json-object")
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)
    )
    const fields = entries.map(([key, item]) => {
      if (DANGEROUS_KEYS.has(key)) throw new Error(`dangerous-key:${key}`)
      return `${JSON.stringify(key)}:${toCanonicalJson(
        item,
        ancestors,
        depth + 1
      )}`
    })
    return `{${fields.join(",")}}`
  } finally {
    ancestors.delete(value)
  }
}

export const canonicalJson = (value: unknown) =>
  toCanonicalJson(value, new Set(), 0)

export const sha256Hex = async (value: string) => {
  if (!globalThis.crypto?.subtle) throw new Error("web-crypto-unavailable")
  const bytes = new TextEncoder().encode(value)
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}
