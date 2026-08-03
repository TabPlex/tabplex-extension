import { describe, expect, it, vi } from "vitest"

import { blurIfWorkspaceNameInputActive } from "./workspaceNameLeave"

describe("blurIfWorkspaceNameInputActive", () => {
  it("blurs the input when it is the current active element", () => {
    const blur = vi.fn()
    const input = { blur } as unknown as HTMLInputElement

    const didBlur = blurIfWorkspaceNameInputActive({
      activeElement: input as unknown as Element,
      nameInput: input
    })

    expect(didBlur).toBe(true)
    expect(blur).toHaveBeenCalledTimes(1)
  })

  it("does not blur when another element is active", () => {
    const blur = vi.fn()
    const input = { blur } as unknown as HTMLInputElement
    const anotherElement = {} as Element

    const didBlur = blurIfWorkspaceNameInputActive({
      activeElement: anotherElement,
      nameInput: input
    })

    expect(didBlur).toBe(false)
    expect(blur).not.toHaveBeenCalled()
  })
})
