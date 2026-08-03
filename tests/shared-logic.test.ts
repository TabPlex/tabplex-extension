import { expect, it } from "vitest"

import { canOpenWorkspaceTimeline } from "~shared/logic"

it("disables timeline when workspace has no history", () => {
  expect(
    canOpenWorkspaceTimeline({
      id: "w1",
      name: "One",
      createdAt: 1,
      tabs: []
    })
  ).toBe(false)
})

it("enables timeline when history exists", () => {
  expect(
    canOpenWorkspaceTimeline({
      id: "w1",
      name: "One",
      createdAt: 1,
      tabs: [],
      history: [{ id: "h1", createdAt: 1, tabs: [] }]
    })
  ).toBe(true)
})
