// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Workspace } from "~core/types"

import CreateWorkspaceForm from "./CreateWorkspaceForm"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

vi.mock("~components/ui/loader-pinwheel", () => ({
  LoaderPinwheelIcon: () => null
}))

vi.mock("~components/ui/check", () => ({
  CheckIcon: () => null
}))

const workspace: Workspace = {
  id: "workspace-1",
  name: "Focus",
  createdAt: 1,
  tabs: []
}

const createdResult = {
  workspace,
  activation: { status: "activated" as const }
}

describe("CreateWorkspaceForm header feedback", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("announces a failed inline submission and associates the error with the input", async () => {
    const user = userEvent.setup()
    const createWorkspace = vi.fn().mockRejectedValue(new Error("failed"))
    vi.spyOn(console, "warn").mockImplementation(() => {})

    render(
      <CreateWorkspaceForm
        variant="header"
        createWorkspace={createWorkspace}
        sortedWorkspaces={[]}
        placeholder="Workspace name"
        submitLabel="Create"
        errorLabel="Could not create workspace"
      />
    )

    const input = screen.getByRole("textbox", { name: "Workspace name" })
    await user.type(input, "Focus")
    await user.click(screen.getByRole("button", { name: "Create" }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("Could not create workspace")
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(input.getAttribute("aria-describedby")).toBe(alert.id)
    await waitFor(() => expect(document.activeElement).toBe(input))
  })

  it("announces a successful inline submission as a polite status", async () => {
    const user = userEvent.setup()
    const createWorkspace = vi.fn().mockResolvedValue(createdResult)

    render(
      <CreateWorkspaceForm
        variant="header"
        createWorkspace={createWorkspace}
        sortedWorkspaces={[]}
        placeholder="Workspace name"
        submitLabel="Create"
        successLabel="Workspace created"
      />
    )

    const input = screen.getByRole("textbox", { name: "Workspace name" })
    await user.type(input, "Focus")
    await user.click(screen.getByRole("button", { name: "Create" }))

    const status = await screen.findByRole("status")
    expect(status.textContent).toBe("Workspace created")
    expect(input.getAttribute("aria-invalid")).toBeNull()
    expect(input.getAttribute("aria-describedby")).toBe(status.id)
  })

  it("reports a durable creation with a failed activation as partial success", async () => {
    const user = userEvent.setup()
    const result = {
      workspace,
      activation: {
        status: "failed" as const,
        error: "workspace-switch-in-progress"
      }
    }
    const onSuccess = vi.fn()

    render(
      <CreateWorkspaceForm
        variant="header"
        createWorkspace={vi.fn().mockResolvedValue(result)}
        sortedWorkspaces={[]}
        placeholder="Workspace name"
        submitLabel="Create"
        partialSuccessLabel="Created without switching"
        onSuccess={onSuccess}
      />
    )

    await user.type(
      screen.getByRole("textbox", { name: "Workspace name" }),
      "Focus"
    )
    await user.click(screen.getByRole("button", { name: "Create" }))

    expect((await screen.findByRole("status")).textContent).toBe(
      "Created without switching"
    )
    expect(onSuccess).toHaveBeenCalledWith(workspace, result)
  })

  it("deduplicates submissions before React can paint the saving state", async () => {
    let resolveCreation: (value: typeof createdResult) => void = () => {}
    const pending = new Promise<typeof createdResult>((resolve) => {
      resolveCreation = resolve
    })
    const createWorkspace = vi.fn().mockReturnValue(pending)

    render(
      <CreateWorkspaceForm
        variant="header"
        createWorkspace={createWorkspace}
        sortedWorkspaces={[]}
        initialName="Focus"
        placeholder="Workspace name"
        submitLabel="Create"
        successLabel="Workspace created"
        createOptions={{ activate: true, seedFromCurrentWindow: false }}
      />
    )

    const button = screen.getByRole("button", { name: "Create" })
    await act(async () => {
      button.click()
      button.click()
      await Promise.resolve()
    })

    expect(createWorkspace).toHaveBeenCalledTimes(1)
    expect(createWorkspace).toHaveBeenCalledWith({
      activate: true,
      name: "Focus",
      seedFromCurrentWindow: false
    })

    resolveCreation(createdResult)
    expect((await screen.findByRole("status")).textContent).toBe(
      "Workspace created"
    )
  })
})
