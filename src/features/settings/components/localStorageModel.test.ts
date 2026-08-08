import { describe, expect, it } from "vitest"

import { getLocalStorageModel } from "./localStorageModel"

const t = (key: string, values?: Record<string, unknown>) =>
  values?.used ? `${key}:${values.used}` : key

describe("getLocalStorageModel", () => {
  it("reports current usage without a fixed quota or percentage", () => {
    expect(getLocalStorageModel({ usedBytes: 1536, t })).toEqual({
      usageLabel: "storage.usage:1.5 KB",
      hintLabel: "storage.localHint"
    })
  })

  it("normalizes invalid negative usage", () => {
    expect(getLocalStorageModel({ usedBytes: -1, t })).toEqual({
      usageLabel: "storage.usage:0 B",
      hintLabel: "storage.localHint"
    })
  })
})
