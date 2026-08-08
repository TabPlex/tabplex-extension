// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useHomeWorkspaceLifecycle } from "./useHomeWorkspaceLifecycle"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

vi.mock("sonner", () => ({
  toast: {}
}))

vi.mock("./workspaceFeedback", () => ({
  showWorkspaceFeedbackToast: vi.fn()
}))

describe("useHomeWorkspaceLifecycle.createEmptyWorkspace", () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it("creates and activates an empty workspace in the window that triggered it", async () => {
    const created = {
      workspace: {
        id: "workspace-new",
        name: "工作区 2",
        createdAt: 2,
        tabs: []
      },
      activation: { status: "activated" as const }
    }
    const createWorkspace = vi.fn().mockResolvedValue(created)
    const setSelectedId = vi.fn()
    const setQuery = vi.fn()
    const setFollowActive = vi.fn()
    const cancelPreview = vi.fn()
    const getCurrent = vi.fn().mockResolvedValue({ id: 17, type: "normal" })
    vi.stubGlobal("chrome", {
      windows: { getCurrent }
    })

    const { result } = renderHook(() =>
      useHomeWorkspaceLifecycle({
        workspaceManager: {
          sortedWorkspaces: [],
          createWorkspace,
          removeWorkspace: vi.fn(),
          switchTo: vi.fn()
        } as any,
        query: "old query",
        setQuery,
        selectedId: "workspace-old",
        setSelectedId,
        setFollowActive,
        cancelPreview,
        switchActive: false,
        showWorkspaceTrashed: vi.fn()
      })
    )

    let creation: Awaited<
      ReturnType<typeof result.current.createEmptyWorkspace>
    >
    await act(async () => {
      creation = await result.current.createEmptyWorkspace()
    })

    expect(getCurrent).toHaveBeenCalledWith({ populate: false })
    expect(createWorkspace).toHaveBeenCalledWith({
      activate: true,
      preferredWindowId: 17,
      seedFromCurrentWindow: false
    })
    expect(cancelPreview).toHaveBeenCalledTimes(1)
    expect(setFollowActive).toHaveBeenNthCalledWith(1, false)
    expect(setFollowActive).toHaveBeenLastCalledWith(true)
    expect(setSelectedId).toHaveBeenCalledWith("workspace-new")
    expect(setQuery).toHaveBeenCalledWith("")
    expect(creation!).toEqual(created)
    expect(result.current.createPending).toBe(false)
  })
})
