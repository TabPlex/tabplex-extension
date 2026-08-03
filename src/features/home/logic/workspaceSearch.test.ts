import { describe, expect, it } from "vitest"

import type { Workspace } from "~core/types"

import { searchWorkspaces } from "./workspaceSearch"

const workspace = (
  id: string,
  name: string,
  tabs: Workspace["tabs"] = []
): Workspace => ({
  id,
  name,
  createdAt: 1,
  tabs,
  history: []
})

describe("workspaceSearch", () => {
  const workspaces = [
    workspace("research", "Market Research", [
      {
        url: "https://news.ycombinator.com/item?id=1",
        title: "Browser workspace discussion"
      }
    ]),
    workspace("docs", "Documentation", [
      { url: "https://developer.mozilla.org/en-US/docs/Web/API" }
    ])
  ]

  it("finds workspaces by name, tab title, and URL", () => {
    expect(searchWorkspaces(workspaces, "market")[0]).toMatchObject({
      workspaceId: "research",
      kind: "workspace"
    })
    expect(
      searchWorkspaces(workspaces, "workspace discussion")[0]
    ).toMatchObject({
      workspaceId: "research",
      kind: "tab",
      url: "https://news.ycombinator.com/item?id=1"
    })
    expect(searchWorkspaces(workspaces, "developer.mozilla")[0]).toMatchObject({
      workspaceId: "docs",
      kind: "tab"
    })
  })

  it("finds local notes without returning their full body", () => {
    const result = searchWorkspaces(workspaces, "launch checklist", {
      notes: { research: "Private launch checklist for Friday" }
    })

    expect(result.map((match) => match.workspaceId)).toEqual(["research"])
    expect(result[0]).toMatchObject({ kind: "note", label: "launch checklist" })
    expect(result[0].label).not.toContain("Friday")
  })

  it("normalizes unicode and requires every query token", () => {
    const unicode = [workspace("unicode", "Ｒｅｓｅａｒｃｈ Café")]

    expect(searchWorkspaces(unicode, "research café")).toHaveLength(1)
    expect(searchWorkspaces(workspaces, "market missing-token")).toEqual([])
  })

  it("caps query length and result count", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      workspace(`w-${index}`, `Match ${index}`)
    )

    expect(searchWorkspaces(many, "match", {}, { maxResults: 5 })).toHaveLength(
      5
    )
    expect(searchWorkspaces(many, "x".repeat(300))).toEqual([])
  })
})
