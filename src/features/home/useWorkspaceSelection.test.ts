// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { Workspace } from "~core/types"

import { useWorkspaceSelection } from "./useWorkspaceSelection"

const workspace = (id: string): Workspace => ({
  id,
  name: id,
  createdAt: 1,
  tabs: []
})

describe("useWorkspaceSelection", () => {
  it("follows the active workspace while the user is not previewing", async () => {
    const workspaces = [workspace("one"), workspace("two")]
    const { result, rerender } = renderHook(
      ({ activeWorkspaceId }) =>
        useWorkspaceSelection({
          workspaces,
          activeWorkspaceId
        }),
      { initialProps: { activeWorkspaceId: "one" } }
    )

    await waitFor(() => expect(result.current.selectedId).toBe("one"))

    rerender({ activeWorkspaceId: "two" })

    await waitFor(() => expect(result.current.selectedId).toBe("two"))
  })

  it("selects the onboarding guide when no workspace is active", async () => {
    const guide = workspace("guide")
    const { result } = renderHook(() =>
      useWorkspaceSelection({
        workspaces: [workspace("other"), guide],
        activeWorkspaceId: null,
        guideWorkspaceId: guide.id,
        onboardingDismissed: false
      })
    )

    await waitFor(() => expect(result.current.selectedId).toBe(guide.id))
  })
})
