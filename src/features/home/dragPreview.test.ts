// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"

import { setCompactTabDragImage } from "./dragPreview"

describe("setCompactTabDragImage", () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it("uses a compact preview instead of the full tab row", () => {
    const source = document.createElement("div")
    source.innerHTML = `
      <span class="tab-icon">T</span>
      <span class="tab-title">Tencent Cloud</span>
      <span>cloud.tencent.com</span>
    `
    document.body.append(source)

    let dragImage: Element | null = null
    const setDragImage = vi.fn((image: Element) => {
      dragImage = image
    })
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })

    const preview = setCompactTabDragImage({
      dataTransfer: { setDragImage },
      source,
      itemCount: 3
    })

    expect(setDragImage).toHaveBeenCalledOnce()
    expect(dragImage).toBe(preview)
    expect(dragImage).not.toBe(source)
    expect(dragImage?.textContent).toContain("Tencent Cloud")
    expect(dragImage?.textContent).toContain("+2")
    expect(preview?.isConnected).toBe(false)
  })
})
