import { describe, expect, it } from "vitest"

import { parsePreferredWindowId } from "./preferredWindowId"

describe("parsePreferredWindowId", () => {
  it.each([0, 17, Number.MAX_SAFE_INTEGER])(
    "accepts a safe non-negative window id: %s",
    (value) => {
      expect(parsePreferredWindowId(value)).toEqual({ ok: true, value })
    }
  )

  it("allows the caller to omit the preferred window", () => {
    expect(parsePreferredWindowId(undefined)).toEqual({
      ok: true,
      value: undefined
    })
  })

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "17", null])(
    "rejects an unsafe explicit window id: %s",
    (value) => {
      expect(parsePreferredWindowId(value)).toEqual({ ok: false })
    }
  )
})
