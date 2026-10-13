// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, expect, it, vi } from "vitest"

import { CommandPalette } from "./CommandPalette"

vi.stubGlobal("React", React)
HTMLElement.prototype.scrollIntoView = vi.fn()
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))
vi.mock("~components/ui/dialog", () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
  return {
    Dialog: Wrapper,
    DialogContent: Wrapper,
    DialogDescription: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper
  }
})
vi.mock("~components/ui/search", () => ({ SearchIcon: () => null }))
afterEach(cleanup)

const setup = () => {
  const onCreate = vi.fn()
  const onSwitch = vi.fn()
  render(
    <CommandPalette
      open
      onOpenChange={vi.fn()}
      workspaces={[
        { id: "prefix", name: "Research Archive", createdAt: 1, tabs: [] },
        { id: "exact", name: "Research", createdAt: 1, tabs: [] }
      ]}
      currentWorkspaceId={null}
      onCreate={onCreate}
      onSwitch={onSwitch}
    />
  )
  return { input: screen.getByRole("textbox"), onCreate, onSwitch }
}

it("creates the typed name instead of accepting a partial match", () => {
  const { input, onCreate, onSwitch } = setup()
  fireEvent.change(input, { target: { value: "Res" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(onCreate).toHaveBeenCalledWith("Res")
  expect(onSwitch).not.toHaveBeenCalled()
})

it("prioritizes the exact match and lets arrows select partial results", () => {
  const { input, onCreate, onSwitch } = setup()
  fireEvent.change(input, { target: { value: "ＲＥＳＥＡＲＣＨ" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(onSwitch).toHaveBeenCalledWith(
    expect.objectContaining({ id: "exact" })
  )
  fireEvent.change(input, { target: { value: "Res" } })
  fireEvent.keyDown(input, { key: "ArrowDown" })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(onSwitch).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: "prefix" })
  )
  expect(onCreate).not.toHaveBeenCalled()
})

it("does not create while confirming an IME candidate", () => {
  const { input, onCreate, onSwitch } = setup()
  fireEvent.change(input, { target: { value: "测试" } })
  fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 })
  expect(onCreate).not.toHaveBeenCalled()
  expect(onSwitch).not.toHaveBeenCalled()
})
