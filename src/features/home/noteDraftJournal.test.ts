// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  allowWorkspaceNoteDrafts,
  clearSavedNoteDraft,
  findRecoverableNoteDraft,
  persistNoteDraft,
  removeWorkspaceNoteDrafts
} from "./noteDraftJournal"

beforeEach(() => localStorage.clear())
afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("note draft journal", () => {
  it("selects the latest unsaved candidate instead of a newer already-saved copy", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1).mockReturnValueOnce(2)
    persistNoteDraft("A", "failed-editor", "unsaved content")
    persistNoteDraft("A", "saved-editor", "saved content")
    expect(
      findRecoverableNoteDraft("A", "fresh-editor", "saved content")?.value
    ).toBe("unsaved content")
  })

  it("removes every editor's draft for the target workspace without changing unrelated data", () => {
    persistNoteDraft("A", "one", "private one")
    persistNoteDraft("A", "two", "private two")
    persistNoteDraft("AB", "one", "keep")
    localStorage.setItem("preference", "kept")
    removeWorkspaceNoteDrafts(["A"])
    expect(Object.values(localStorage)).not.toContainEqual(
      expect.stringContaining("private")
    )
    expect(findRecoverableNoteDraft("AB", "fresh-editor")?.value).toBe("keep")
    expect(localStorage.getItem("preference")).toBe("kept")
    expect(persistNoteDraft("A", "old-editor", "late write")).toBe(false)
    allowWorkspaceNoteDrafts(["A"])
    expect(persistNoteDraft("A", "fresh-editor", "restored workspace")).toBe(
      true
    )
  })

  it("preserves an empty draft and isolates editors and workspaces", () => {
    persistNoteDraft("A", "window-one", "")
    persistNoteDraft("B", "window-two", "note B")
    expect(findRecoverableNoteDraft("A", "new-editor")).toMatchObject({
      value: "",
      workspaceId: "A"
    })
    expect(findRecoverableNoteDraft("A", "window-one")).toBeNull()
    clearSavedNoteDraft("A", "window-one", "")
    expect(findRecoverableNoteDraft("A", "new-editor")).toBeNull()
    expect(findRecoverableNoteDraft("B", "new-editor")?.value).toBe("note B")
  })

  it("a completed older save cannot erase a newer draft or another editor", () => {
    persistNoteDraft("A", "one", "old")
    persistNoteDraft("A", "one", "new")
    persistNoteDraft("A", "two", "another window")
    clearSavedNoteDraft("A", "one", "old")
    expect(findRecoverableNoteDraft("A", "two")?.value).toBe("new")
    clearSavedNoteDraft("A", "one", "new")
    expect(findRecoverableNoteDraft("A", "one")?.value).toBe("another window")
  })

  it("ignores malformed records and recovers the most recent draft", () => {
    localStorage.setItem("tabplex.note-draft.v1:bad", "not json")
    vi.spyOn(Date, "now").mockReturnValueOnce(1).mockReturnValueOnce(2)
    persistNoteDraft("A", "one", "older")
    persistNoteDraft("A", "two", "latest")
    expect(findRecoverableNoteDraft("A", "new-editor")?.value).toBe("latest")
  })

  it("reports unavailable storage rather than claiming the draft was durable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })
    expect(persistNoteDraft("A", "one", "note")).toBe(false)
  })
})
