import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  getWorkspaceTabLoadPlaceholderUrl,
  isWorkspaceTabLoadPlaceholderUrl,
  resolveWorkspaceTabLoadPlaceholderUrl,
  WORKSPACE_TAB_LOAD_PLACEHOLDER_PATH
} from "./workspaceTabLoadPlaceholder"

describe("workspaceTabLoadPlaceholder", () => {
  beforeEach(() => {
    ;(globalThis as any).chrome = {
      runtime: {
        getURL: vi.fn(
          (path: string) => `chrome-extension://tabplex-test/${path}`
        )
      }
    }
  })

  it("uses the extension-owned tab page as the placeholder", () => {
    expect(WORKSPACE_TAB_LOAD_PLACEHOLDER_PATH).toMatch(
      /^workspace-loading(?:\.[\da-f]+)?\.html$/
    )
    expect(getWorkspaceTabLoadPlaceholderUrl()).toBe(
      `chrome-extension://tabplex-test/${WORKSPACE_TAB_LOAD_PLACEHOLDER_PATH}`
    )
  })

  it("accepts only the current extension's exact placeholder URL", () => {
    const placeholderUrl = `chrome-extension://tabplex-test/${WORKSPACE_TAB_LOAD_PLACEHOLDER_PATH}`
    expect(isWorkspaceTabLoadPlaceholderUrl(placeholderUrl)).toBe(true)
    expect(
      isWorkspaceTabLoadPlaceholderUrl(
        placeholderUrl.replace("tabplex-test", "another-extension")
      )
    ).toBe(false)
    expect(
      isWorkspaceTabLoadPlaceholderUrl("about:blank#tabplex-workspace-loading")
    ).toBe(false)
  })

  it("does not wrap a bundled absolute extension URL twice", () => {
    const getExtensionUrl = vi.fn(
      (path: string) => `chrome-extension://tabplex-test/${path}`
    )
    const absoluteUrl =
      "chrome-extension://tabplex-test/workspace-loading.hash.html"

    expect(
      resolveWorkspaceTabLoadPlaceholderUrl(absoluteUrl, getExtensionUrl)
    ).toBe(absoluteUrl)
    expect(getExtensionUrl).not.toHaveBeenCalled()
  })

  it("resolves Parcel's background-relative asset path from the extension root", () => {
    const getExtensionUrl = vi.fn(
      (path: string) => `chrome-extension://tabplex-test/${path}`
    )

    expect(
      resolveWorkspaceTabLoadPlaceholderUrl(
        "../../workspace-loading.abc123.html",
        getExtensionUrl
      )
    ).toBe("chrome-extension://tabplex-test/workspace-loading.abc123.html")
    expect(getExtensionUrl).toHaveBeenCalledWith(
      "workspace-loading.abc123.html"
    )
  })
})
