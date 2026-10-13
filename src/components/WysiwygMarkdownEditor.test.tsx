// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  HISTORY_PUSH_TAG,
  UNDO_COMMAND
} from "lexical"
import React, { useState } from "react"
import { flushSync } from "react-dom"
import { afterEach, expect, it, vi } from "vitest"

import { useNoteLogic } from "~features/home/useNoteLogic"

import { WysiwygMarkdownEditor } from "./WysiwygMarkdownEditor"

vi.stubGlobal("React", React)

const captured = vi.hoisted(() => ({ editor: null as any }))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))
vi.mock("@lexical/react/LexicalHistoryPlugin", async (importOriginal) => {
  const original = await importOriginal<any>()
  const { useLexicalComposerContext } =
    await import("@lexical/react/LexicalComposerContext")
  const ReactModule = await import("react")
  return {
    HistoryPlugin: () => {
      captured.editor = useLexicalComposerContext()[0]
      return ReactModule.createElement(original.HistoryPlugin)
    }
  }
})
afterEach(cleanup)

it("keeps a note bound to its document during separate parent updates", async () => {
  const save = vi.fn(async () => {})
  const manager = {
    workspaceState: { notes: { A: "Note A" } },
    setWorkspaceNote: save
  }
  let select: (id: string) => void = () => {}
  let refresh: () => void = () => {}
  function Harness() {
    const [id, setId] = useState("A")
    const [, setTick] = useState(0)
    select = setId
    refresh = () => setTick((tick) => tick + 1)
    const note = useNoteLogic(id, manager as any)
    return (
      <WysiwygMarkdownEditor
        docKey={id}
        value={note.noteDraft}
        onChange={note.handleNoteChange}
      />
    )
  }
  const view = render(<Harness />)
  await act(async () => {})
  act(() => select("B"))
  await act(async () => {})
  await act(async () => {
    flushSync(() => select("A"))
    flushSync(refresh)
    await new Promise((resolve) => setTimeout(resolve, 400))
  })
  expect(view.container.textContent).toContain("Note A")
  expect(save).not.toHaveBeenCalledWith("A", "")
})

it("does not save an empty document over an existing note when switching back", async () => {
  const save = vi.fn(async () => {})
  const manager = {
    workspaceState: { notes: { A: "Note A" } },
    setWorkspaceNote: save
  }
  function Harness({ id }: { id: string }) {
    const note = useNoteLogic(id, manager as any)
    return (
      <WysiwygMarkdownEditor
        docKey={id}
        value={note.noteDraft}
        onChange={note.handleNoteChange}
      />
    )
  }
  const view = render(<Harness id="A" />)
  await act(async () => {})
  view.rerender(<Harness id="B" />)
  await act(async () => {})
  view.rerender(<Harness id="A" />)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400))
  })
  expect(view.container.textContent).toContain("Note A")
  expect(save).not.toHaveBeenCalled()
})

it("undo after selecting workspace B must not import workspace A note", async () => {
  const onChange = vi.fn()
  const view = render(
    <WysiwygMarkdownEditor docKey="A" value="Note A" onChange={onChange} />
  )
  await act(async () => {})
  await act(async () => {
    captured.editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append($createTextNode("Note A edited"))
          )
      },
      { tag: HISTORY_PUSH_TAG }
    )
  })
  view.rerender(
    <WysiwygMarkdownEditor docKey="B" value="Note B" onChange={onChange} />
  )
  await act(async () => {})
  expect(view.container.textContent).toContain("Note B")
  onChange.mockClear()
  await act(async () => {
    captured.editor.dispatchCommand(UNDO_COMMAND, undefined)
  })
  expect(view.container.textContent).not.toContain("Note A")
})

it("workspace B autosave must not receive workspace A content after undo", async () => {
  const save = vi.fn(async () => {})
  const manager = {
    workspaceState: { notes: { A: "Note A", B: "Note B" } },
    setWorkspaceNote: save
  }
  function Harness({ id }: { id: string }) {
    const note = useNoteLogic(id, manager as any)
    return (
      <WysiwygMarkdownEditor
        docKey={id}
        value={note.noteDraft}
        onChange={note.handleNoteChange}
      />
    )
  }
  const view = render(<Harness id="A" />)
  await act(async () => {})
  await act(async () => {
    captured.editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append($createTextNode("Note A edited"))
          )
      },
      { tag: HISTORY_PUSH_TAG }
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400))
  })
  view.rerender(<Harness id="B" />)
  await act(async () => {})
  expect(view.container.textContent).toContain("Note B")
  save.mockClear()
  await act(async () => {
    captured.editor.dispatchCommand(UNDO_COMMAND, undefined)
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400))
  })
  expect(save).not.toHaveBeenCalledWith("B", "Note A edited")
})

it("keeps undo working within the newly selected document", async () => {
  const onChange = vi.fn()
  const view = render(
    <WysiwygMarkdownEditor docKey="A" value="Note A" onChange={onChange} />
  )
  view.rerender(
    <WysiwygMarkdownEditor docKey="B" value="Note B" onChange={onChange} />
  )
  await act(async () => {})
  await act(async () => {
    captured.editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append($createTextNode("Note B edited"))
          )
      },
      { tag: HISTORY_PUSH_TAG }
    )
  })
  await act(async () => {
    captured.editor.dispatchCommand(UNDO_COMMAND, undefined)
  })
  expect(view.container.textContent).toContain("Note B")
  expect(view.container.textContent).not.toContain("edited")
  expect(view.container.textContent).not.toContain("Note A")
})
