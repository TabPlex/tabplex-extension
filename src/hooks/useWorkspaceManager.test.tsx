// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { useWorkspaceManager } from "./useWorkspaceManager"

vi.mock("~features/workspace/WorkspaceDataProvider", () => ({
  useWorkspaceDataContext: () => ({
    workspaces: [
      { id: "live", name: "Live", createdAt: 1, tabs: [] },
      { id: "note-only", name: "Note", createdAt: 2, tabs: [], trashedAt: 10 },
      {
        id: "history-only",
        name: "History",
        createdAt: 3,
        tabs: [],
        trashedAt: 20,
        history: [
          { id: "h", createdAt: 1, tabs: [{ url: "https://example.com" }] }
        ]
      }
    ],
    workspaceState: { notes: { "note-only": "Keep this note" } },
    settings: { theme: "light", workspaceSort: "created" },
    hydrated: true
  })
}))
vi.mock("~features/workspace/hooks/useWorkspaceActions", () => ({
  useWorkspaceActions: () => ({})
}))
vi.mock("~hooks/useBrowserTheme", () => ({ useBrowserTheme: () => "light" }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it("shows trashed note-only and history-only workspaces in the recovery list", () => {
  vi.stubGlobal("chrome", {
    runtime: { getManifest: () => ({ version: "1.0.4" }) }
  })
  const { result } = renderHook(useWorkspaceManager)
  expect(result.current.sortedWorkspaces.map((item) => item.id)).toEqual([
    "live"
  ])
  expect(result.current.trashedWorkspaces.map((item) => item.id)).toEqual([
    "history-only",
    "note-only"
  ])
  expect(result.current.workspaceState.notes?.["note-only"]).toBe(
    "Keep this note"
  )
})
