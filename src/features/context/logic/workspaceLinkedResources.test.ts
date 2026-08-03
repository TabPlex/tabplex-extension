import { describe, expect, it } from "vitest"

import {
  addWorkspaceLinkedResource,
  removeWorkspaceLinkedResource
} from "./workspaceLinkedResources"

describe("workspaceLinkedResources", () => {
  it("adds a normalized linked resource from a pasted document url", () => {
    const result = addWorkspaceLinkedResource(
      [],
      "https://www.notion.so/TabPlex-PRD-abc123"
    )

    expect(result.kind).toBe("added")
    if (result.kind !== "added") {
      throw new Error("expected resource to be added")
    }

    expect(result.resource).toMatchObject({
      host: "www.notion.so",
      provider: "Notion",
      title: "TabPlex PRD",
      url: "https://www.notion.so/TabPlex-PRD-abc123"
    })
    expect(result.resources).toHaveLength(1)
  })

  it("rejects duplicate urls after normalization", () => {
    const first = addWorkspaceLinkedResource(
      [],
      "https://docs.google.com/document/d/spec/edit#heading=h.1"
    )
    if (first.kind !== "added") {
      throw new Error("expected first resource to be added")
    }

    const second = addWorkspaceLinkedResource(
      first.resources,
      "https://docs.google.com/document/d/spec/edit#heading=h.2"
    )

    expect(second.kind).toBe("duplicate")
    expect(second.resources).toHaveLength(1)
  })

  it("uses readable fallback titles for provider-specific urls", () => {
    const doc = addWorkspaceLinkedResource(
      [],
      "https://docs.google.com/document/d/123456789/edit"
    )
    const linear = addWorkspaceLinkedResource(
      [],
      "https://linear.app/tabplex/issue/TAB-123/context-hub"
    )

    expect(doc.kind).toBe("added")
    expect(linear.kind).toBe("added")

    if (doc.kind !== "added" || linear.kind !== "added") {
      throw new Error("expected resources to be added")
    }

    expect(doc.resource.title).toBe("Google Doc")
    expect(linear.resource.title).toBe("TAB-123 · context hub")
  })

  it("rejects invalid or unsupported urls", () => {
    expect(addWorkspaceLinkedResource([], "chrome://extensions").kind).toBe(
      "invalid"
    )
    expect(addWorkspaceLinkedResource([], "not-a-url").kind).toBe("invalid")
  })

  it("removes a linked resource by id", () => {
    const added = addWorkspaceLinkedResource(
      [],
      "https://linear.app/team/issue/TAB-123/context-hub"
    )
    if (added.kind !== "added") {
      throw new Error("expected resource to be added")
    }

    const next = removeWorkspaceLinkedResource(
      added.resources,
      added.resource.id
    )

    expect(next).toEqual([])
  })
})
