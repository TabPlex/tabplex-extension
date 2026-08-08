// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CreateWorkspaceInlineAction } from "./CreateWorkspaceInlineAction"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

vi.mock("~components/ui/loader-pinwheel", () => ({
  LoaderPinwheelIcon: () => <span aria-hidden="true" />
}))

vi.mock("~components/ui/plus", () => ({
  PlusIcon: () => <span aria-hidden="true" />
}))

describe("CreateWorkspaceInlineAction", () => {
  afterEach(cleanup)

  it("creates immediately without replacing the trigger with a name form", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(
      <CreateWorkspaceInlineAction
        onCreate={onCreate}
        disabled={false}
        busy={false}
      />
    )

    const trigger = screen.getByRole("button", {
      name: "home.create.popup.submit"
    })
    await user.click(trigger)

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(trigger.isConnected).toBe(true)
  })

  it("exposes the pending state and blocks duplicate activation", () => {
    render(
      <CreateWorkspaceInlineAction onCreate={vi.fn()} disabled={false} busy />
    )

    const trigger = screen.getByRole("button", {
      name: "home.create.popup.submitting"
    }) as HTMLButtonElement

    expect(trigger.disabled).toBe(true)
    expect(trigger.getAttribute("aria-busy")).toBe("true")
  })
})
