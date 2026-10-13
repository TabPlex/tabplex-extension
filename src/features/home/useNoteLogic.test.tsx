// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { findRecoverableNoteDraft, persistNoteDraft } from "./noteDraftJournal"
import { useNoteLogic } from "./useNoteLogic"

const notifications = vi.hoisted(() => ({
  info: vi.fn((_message: string, _options: unknown) => "recovery"),
  error: vi.fn(),
  dismiss: vi.fn()
}))
vi.mock("sonner", () => ({ toast: notifications }))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  vi.clearAllMocks()
})
afterEach(async () => {
  cleanup()
  await Promise.resolve()
  vi.useRealTimers()
  localStorage.clear()
})

const manager = (save: ReturnType<typeof vi.fn>) =>
  ({
    workspaceState: { notes: { A: "old A", B: "old B" } },
    setWorkspaceNote: save
  }) as any

describe("note save recovery", () => {
  it("offers an older failed draft even when the latest stored copy matches the saved note", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1).mockReturnValueOnce(2)
    persistNoteDraft("A", "failed-editor", "unsaved A")
    persistNoteDraft("A", "saved-editor", "old A")
    renderHook(() => useNoteLogic("A", manager(vi.fn())))
    const options = notifications.info.mock.calls.at(-1)?.[1] as any
    expect(options?.action).toBeDefined()
    const recovered = findRecoverableNoteDraft("A", "fresh-editor", "old A")
    expect(recovered?.value).toBe("unsaved A")
  })

  it("keeps recovery available while the saved note finishes loading", () => {
    persistNoteDraft("A", "closed-editor", "failed draft")
    const save = vi.fn().mockResolvedValue(undefined)
    const data = manager(save)
    data.workspaceState.notes.A = ""
    const { rerender } = renderHook(
      ({ notes }) => useNoteLogic("A", { ...data, workspaceState: { notes } }),
      { initialProps: { notes: { A: "" } } }
    )
    vi.clearAllMocks()
    rerender({ notes: { A: "later loaded note" } })
    expect(notifications.info).toHaveBeenCalled()
    expect(notifications.dismiss).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it("retries failed workspace A even when Home is left from clean workspace B", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("save failed"))
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValue(undefined)
    const data = manager(save)
    const { result, rerender, unmount } = renderHook(
      ({ id }) => useNoteLogic(id, data),
      { initialProps: { id: "A" } }
    )
    act(() => result.current.handleNoteChange("new A"))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })
    await act(async () => {
      rerender({ id: "B" })
    })
    expect(save).toHaveBeenCalledTimes(2)
    await act(async () => {
      unmount()
    })
    expect(save).toHaveBeenCalledTimes(3)
    expect(save).toHaveBeenLastCalledWith("A", "new A")
    expect(findRecoverableNoteDraft("A", "another-editor")).toBeNull()
  })

  it("keeps failed drafts after teardown and restores them only through the recovery action", async () => {
    const fail = vi.fn().mockRejectedValue(new Error("save failed"))
    const first = renderHook(() => useNoteLogic("A", manager(fail)))
    act(() => first.result.current.handleNoteChange("unsaved A"))
    await act(async () => {
      first.unmount()
    })
    expect(findRecoverableNoteDraft("A", "new-editor")?.value).toBe("unsaved A")
    const save = vi.fn().mockResolvedValue(undefined)
    const second = renderHook(() => useNoteLogic("A", manager(save)))
    expect(second.result.current.noteDraft).toBe("old A")
    expect(save).not.toHaveBeenCalled()
    const options = notifications.info.mock.calls.at(-1)?.[1] as any
    act(() => options.action.onClick())
    expect(second.result.current.noteDraft).toBe("unsaved A")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })
    expect(save).toHaveBeenCalledWith("A", "unsaved A")
    expect(findRecoverableNoteDraft("A", "another-editor")).toBeNull()
  })

  it("does not silently overwrite a later saved note with an old draft", async () => {
    persistNoteDraft("A", "closed-editor", "old failed draft")
    const save = vi.fn().mockResolvedValue(undefined)
    const data = manager(save)
    data.workspaceState.notes.A = "new saved note"
    const { result } = renderHook(() => useNoteLogic("A", data))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current.noteDraft).toBe("new saved note")
    expect(save).not.toHaveBeenCalled()
    expect(findRecoverableNoteDraft("A", "another-editor")?.value).toBe(
      "old failed draft"
    )
  })
})
