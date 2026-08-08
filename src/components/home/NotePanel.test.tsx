// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React, { useRef, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NotePanel } from "./NotePanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      typeof values?.width === "number" ? `${key}:${values.width}` : key
  })
}))

vi.mock("~components/NoteEditor", () => ({
  default: () => <div />
}))

const NotePanelHarness = () => {
  const [width, setWidth] = useState(360)
  const noteCardRef = useRef<HTMLElement>(null)

  return (
    <NotePanel
      notePanelWidth={width}
      notePanelMaxWidth={600}
      setNotePanelWidth={setWidth}
      noteCardRef={noteCardRef}
      selectedId="workspace-1"
      noteDraft=""
      onNoteChange={() => {}}
      onNoteResizeStart={() => {}}
    />
  )
}

describe("NotePanel resize handle", () => {
  afterEach(cleanup)

  it("supports bounded keyboard resizing and reset", async () => {
    const user = userEvent.setup()
    render(<NotePanelHarness />)

    const separator = screen.getByRole("separator", {
      name: "home.note.resizeLabel"
    })
    expect(separator.getAttribute("aria-valuemin")).toBe("280")
    expect(separator.getAttribute("aria-valuemax")).toBe("600")
    expect(separator.getAttribute("aria-valuenow")).toBe("360")

    separator.focus()
    await user.keyboard("{ArrowLeft}")
    expect(separator.getAttribute("aria-valuenow")).toBe("376")

    await user.keyboard("{Shift>}{ArrowRight}{/Shift}")
    expect(separator.getAttribute("aria-valuenow")).toBe("336")

    await user.keyboard("{Home}")
    expect(separator.getAttribute("aria-valuenow")).toBe("280")

    await user.keyboard("{End}")
    expect(separator.getAttribute("aria-valuenow")).toBe("600")

    fireEvent.doubleClick(separator)
    expect(separator.getAttribute("aria-valuenow")).toBe("360")
  })
})
