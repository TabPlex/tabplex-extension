import { beforeEach, describe, expect, it } from "vitest"

import { isTrustedInternalMessageSender } from "./messageSecurity"

describe("messageSecurity", () => {
  beforeEach(() => {
    ;(globalThis as any).chrome = {
      runtime: {
        id: "ext-123",
        getURL: (path: string = "") => `chrome-extension://ext-123/${path}`
      }
    }
  })

  it("accepts sender from same extension origin", () => {
    const sender = {
      id: "ext-123",
      url: "chrome-extension://ext-123/popup.html"
    } as chrome.runtime.MessageSender
    expect(isTrustedInternalMessageSender(sender)).toBe(true)
  })

  it("rejects sender from other origins or missing data", () => {
    expect(isTrustedInternalMessageSender(undefined)).toBe(false)
    expect(
      isTrustedInternalMessageSender({
        id: "other",
        url: "chrome-extension://other/popup.html"
      } as chrome.runtime.MessageSender)
    ).toBe(false)
    expect(
      isTrustedInternalMessageSender({
        id: "ext-123",
        url: "https://example.com"
      } as chrome.runtime.MessageSender)
    ).toBe(false)
    expect(
      isTrustedInternalMessageSender({
        id: "ext-123",
        url: undefined
      } as chrome.runtime.MessageSender)
    ).toBe(false)
  })
})
