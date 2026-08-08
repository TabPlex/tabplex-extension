import { describe, expect, it } from "vitest"

import { canonicalJson, sha256Hex } from "./canonicalJson"

describe("canonicalJson", () => {
  it("sorts object keys recursively while preserving array order", () => {
    const left = {
      z: [{ beta: 2, alpha: 1 }],
      a: "value"
    }
    const right = {
      a: "value",
      z: [{ alpha: 1, beta: 2 }]
    }

    expect(canonicalJson(left)).toBe(canonicalJson(right))
    expect(canonicalJson(left)).toBe('{"a":"value","z":[{"alpha":1,"beta":2}]}')
  })

  it("uses locale-independent UTF-16 key ordering", () => {
    expect(canonicalJson({ ä: 1, z: 2, a: 3 })).toBe('{"a":3,"z":2,"ä":1}')
  })

  it("rejects dangerous object keys at any depth", () => {
    const value = JSON.parse('{"nested":{"__proto__":{"polluted":true}}}')

    expect(() => canonicalJson(value)).toThrow(/dangerous-key/)
  })

  it("computes SHA-256 using Web Crypto", async () => {
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
  })
})
