import { describe, expect, it } from "vitest"

import {
  AGENT_COMMANDS,
  parseAgentCommandRequest,
  type AgentCommand
} from "./agentControlProtocol"

const request = (
  command: AgentCommand,
  payload?: unknown,
  windowId?: number
) => ({
  _tabplexAgent: true,
  protocolVersion: 1,
  command,
  ...(payload === undefined ? {} : { payload }),
  ...(windowId === undefined ? {} : { windowId })
})

describe("agent control protocol", () => {
  it("normalizes a strictly shaped native request", () => {
    expect(
      parseAgentCommandRequest(
        request("searchWorkspaces", { query: "  docs  " }, 12)
      )
    ).toEqual({
      ok: true,
      request: {
        command: "searchWorkspaces",
        payload: { query: "docs" },
        windowId: 12
      }
    })
  })

  it("rejects extra fields, invalid windows, and overlong parameters", () => {
    expect(
      parseAgentCommandRequest(
        request("searchWorkspaces", { query: "x".repeat(201) })
      )
    ).toEqual({ ok: false, error: "invalid-agent-request" })
    expect(
      parseAgentCommandRequest({
        ...request("searchWorkspaces", { query: "docs" }),
        unexpected: true
      })
    ).toEqual({ ok: false, error: "invalid-agent-request" })
    expect(
      parseAgentCommandRequest(
        request("searchWorkspaces", { query: "docs" }, -1)
      )
    ).toEqual({ ok: false, error: "invalid-agent-request" })
  })

  it("rejects the retired workspace privacy command", () => {
    expect(
      parseAgentCommandRequest({
        ...request("getState"),
        command: "setWorkspaceExcluded",
        payload: { workspaceId: "workspace-1", excluded: true }
      })
    ).toEqual({ ok: false, error: "invalid-agent-request" })
  })

  it("requires explicit confirmation for destructive commands", () => {
    expect(
      parseAgentCommandRequest(
        request("deleteWorkspace", {
          workspaceId: "workspace-1",
          confirm: false
        })
      )
    ).toEqual({ ok: false, error: "invalid-agent-request" })
    expect(
      parseAgentCommandRequest(
        request("deleteWorkspace", {
          workspaceId: " workspace-1 ",
          confirm: true
        })
      )
    ).toMatchObject({
      ok: true,
      request: {
        command: "deleteWorkspace",
        payload: { workspaceId: "workspace-1", confirm: true }
      }
    })
  })

  it("accepts bounded safe tab replacement and rejects unsafe URLs", () => {
    expect(
      parseAgentCommandRequest(
        request("replaceWorkspaceTabs", {
          workspaceId: "workspace-1",
          tabs: [
            {
              url: "https://example.com/docs",
              title: "Docs",
              group: { key: "research", color: "blue" }
            }
          ]
        })
      )
    ).toMatchObject({ ok: true })
    expect(
      parseAgentCommandRequest(
        request("replaceWorkspaceTabs", {
          workspaceId: "workspace-1",
          tabs: [{ url: "javascript:alert(1)" }]
        })
      )
    ).toEqual({ ok: false, error: "invalid-agent-request" })
  })

  it("only exposes portable settings to Agent writes", () => {
    expect(
      parseAgentCommandRequest(
        request("updateSetting", { key: "theme", value: "dark" })
      )
    ).toMatchObject({ ok: true })
    expect(
      parseAgentCommandRequest(
        request("updateSetting", {
          key: "agentControlEnabled",
          value: false
        })
      )
    ).toEqual({ ok: false, error: "invalid-agent-request" })
  })

  it("accepts one strictly shaped request for every advertised command", () => {
    const payloads: Record<AgentCommand, unknown> = {
      getState: undefined,
      getWorkspace: { workspaceId: "workspace-1" },
      searchWorkspaces: { query: "docs" },
      openHome: undefined,
      openSettings: undefined,
      openShortcuts: undefined,
      createWorkspace: { name: "Research" },
      switchWorkspace: { workspaceId: "workspace-1" },
      renameWorkspace: { workspaceId: "workspace-1", name: "Research" },
      setWorkspaceColor: { workspaceId: "workspace-1", color: "#0EA5E9" },
      setWorkspaceEmoji: { workspaceId: "workspace-1", emoji: "🧠" },
      trashWorkspace: { workspaceId: "workspace-1" },
      restoreWorkspace: { workspaceId: "workspace-1" },
      deleteWorkspace: { workspaceId: "workspace-1", confirm: true },
      emptyTrash: { confirm: true },
      setWorkspaceNote: { workspaceId: "workspace-1", note: "Notes" },
      openWorkspaceTab: {
        workspaceId: "workspace-1",
        tab: { url: "https://example.com" }
      },
      captureWorkspaceTabs: {
        workspaceId: "workspace-1",
        skipHistory: false
      },
      setTabExcluded: {
        workspaceId: "workspace-1",
        tabIndexOrUrl: 0,
        excluded: true
      },
      removeWorkspaceTabs: {
        workspaceId: "workspace-1",
        tabIndexes: [0]
      },
      moveWorkspaceTabs: {
        sourceId: "workspace-1",
        targetId: "workspace-2",
        tabIndexes: [0]
      },
      replaceWorkspaceTabs: { workspaceId: "workspace-1", tabs: [] },
      createWorkspaceSnapshot: { workspaceId: "workspace-1" },
      restoreWorkspaceSnapshot: {
        workspaceId: "workspace-1",
        snapshotId: "snapshot-1"
      },
      updateSetting: { key: "workspaceSort", value: "lastUsed" }
    }

    for (const command of AGENT_COMMANDS) {
      expect(
        parseAgentCommandRequest(request(command, payloads[command]))
      ).toMatchObject({
        ok: true
      })
    }
  })
})
