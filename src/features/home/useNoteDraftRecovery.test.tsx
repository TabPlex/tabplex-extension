// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { toast, Toaster } from "sonner"
import { afterEach, expect, it, vi } from "vitest"

import { persistNoteDraft } from "./noteDraftJournal"
import { useNoteDraftRecovery } from "./useNoteDraftRecovery"

vi.stubGlobal("React", React)
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))
afterEach(() => {
  cleanup()
  toast.dismiss()
  localStorage.clear()
})

it("keeps the restore action available after leaving and immediately re-entering a document", async () => {
  localStorage.clear()
  persistNoteDraft("A", "closed-editor", "failed draft")
  const restore = vi.fn()
  function Harness({ id }: { id: string | null }) {
    useNoteDraftRecovery(id, "saved note", "current-editor", restore)
    return <Toaster />
  }
  const view = render(<Harness id="A" />)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  act(() => view.rerender(<Harness id={null} />))
  act(() => view.rerender(<Harness id="A" />))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: "home.note.recoverDraft" })
    ).toHaveLength(1)
  )
  const button = screen.getByRole("button", { name: "home.note.recoverDraft" })
  act(() => button.click())
  expect(restore).toHaveBeenCalledWith(
    expect.objectContaining({ workspaceId: "A", value: "failed draft" })
  )
})
