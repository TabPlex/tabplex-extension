// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { useDragAndDrop } from "./useDragAndDrop"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))
afterEach(cleanup)
const tab = (url: string) => ({ url })
it("tab selection should preserve the selected page or clear when the collection changes", async () => {
  const move = vi.fn(async () => true)
  const manager = { moveTabsToWorkspace: move }
  const initial = {
    id: "source",
    name: "source",
    tabs: [
      tab("https://example.com/a"),
      tab("https://example.com/b"),
      tab("https://example.com/c")
    ],
    tabsRevision: 0
  }
  const hook = renderHook(
    ({ ws }) => useDragAndDrop(ws as any, manager as any),
    { initialProps: { ws: initial } }
  )
  act(() => {
    hook.result.current.actions.handleToggleSelectionMode(true)
  })
  act(() => {
    hook.result.current.actions.handleToggleTabIndex(1)
  })
  hook.rerender({
    ws: { ...initial, tabs: initial.tabs.slice(1), tabsRevision: 1 }
  })
  expect(hook.result.current.state.selectedTabIndexes).toEqual([])
  await act(async () => {
    await hook.result.current.actions.handleMoveSelectedTabsToWorkspace(
      "target"
    )
  })
  expect(move).not.toHaveBeenCalled()
})
