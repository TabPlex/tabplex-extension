import { describe, expect, it, vi } from "vitest"

import type { Settings, Workspace, WorkspaceState } from "~core/types"
import { DEFAULT_SETTINGS, DEFAULT_WORKSPACE_STATE } from "~core/types"

import {
  createAgentCommandHandler,
  createAgentRequestProcessor,
  createAgentWorkspaceFactory
} from "./agentControl"

const workspace = (overrides: Partial<Workspace>): Workspace => ({
  id: overrides.id ?? "workspace-1",
  name: overrides.name ?? "Docs",
  color: overrides.color,
  emoji: overrides.emoji,
  createdAt: overrides.createdAt ?? 1,
  lastUsedAt: overrides.lastUsedAt ?? 2,
  updatedAt: overrides.updatedAt,
  tabs: overrides.tabs ?? [],
  history: overrides.history ?? [],
  trashedAt: overrides.trashedAt
})

const makeDeps = (
  overrides: {
    settings?: Partial<Settings>
    workspaces?: Workspace[]
    workspaceState?: Partial<WorkspaceState>
  } = {}
) => ({
  loadSettings: vi.fn(async () => ({
    ...DEFAULT_SETTINGS,
    ...overrides.settings
  })),
  loadWorkspaces: vi.fn(async () => overrides.workspaces ?? []),
  loadWorkspaceState: vi.fn(async () => ({
    ...DEFAULT_WORKSPACE_STATE,
    ...overrides.workspaceState
  })),
  loadWindowBinding: vi.fn(async () =>
    typeof overrides.workspaceState?.activeWorkspaceId === "string"
      ? {
          workspaceId: overrides.workspaceState.activeWorkspaceId,
          tabsRevision: 0,
          updatedAt: 1
        }
      : null
  ),
  openHome: vi.fn(async () => undefined),
  openSettings: vi.fn(async () => undefined),
  openShortcuts: vi.fn(async () => undefined),
  switchWorkspace: vi.fn(async () => ({ success: true as const })),
  createWorkspace: vi.fn(async (name: string) =>
    workspace({
      id: "created-1",
      name,
      createdAt: 10,
      lastUsedAt: 10
    })
  ),
  applyWorkspaceOperation: vi.fn(async () => ({ ok: true as const })),
  patchWorkspaceState: vi.fn(async () => ({ ok: true as const })),
  updateSetting: vi.fn(async () => ({ ok: true as const })),
  openWorkspaceTab: vi.fn(async () => ({ ok: true as const })),
  captureWorkspaceTabs: vi.fn(async () => ({ ok: true as const })),
  getVersion: vi.fn(() => "0.0.3")
})

describe("agentControl", () => {
  it("rejects native requests while agent control is disabled", async () => {
    const deps = makeDeps({
      settings: { agentControlEnabled: false }
    })
    const processor = createAgentRequestProcessor(deps, {
      withAgentOperation: async (task) => task(),
      getCurrentWindowId: async () => 7
    })

    await expect(
      processor({
        _tabplexAgent: true,
        protocolVersion: 1,
        command: "getState"
      })
    ).resolves.toEqual({ ok: false, error: "agent-control-disabled" })
    expect(deps.loadWorkspaces).not.toHaveBeenCalled()
  })

  it("validates requests and binds browser actions to the resolved window", async () => {
    const deps = makeDeps({
      settings: { agentControlEnabled: true }
    })
    const withAgentOperation = vi.fn(async (task) => task())
    const processor = createAgentRequestProcessor(deps, {
      withAgentOperation,
      getCurrentWindowId: async () => 23
    })

    await expect(
      processor({
        _tabplexAgent: true,
        protocolVersion: 1,
        command: "openHome"
      })
    ).resolves.toEqual({ ok: true })
    expect(deps.openHome).toHaveBeenCalledWith(23)
    expect(withAgentOperation).toHaveBeenCalledOnce()

    await expect(processor({ command: "openHome" })).resolves.toEqual({
      ok: false,
      error: "invalid-agent-request"
    })
  })

  it("returns sanitized state for getState", async () => {
    const deps = makeDeps({
      settings: { agentControlEnabled: true, workspaceSort: "created" },
      workspaceState: { activeWorkspaceId: "workspace-1" },
      workspaces: [
        workspace({
          id: "workspace-1",
          name: "Docs",
          tabs: [
            { url: "https://docs.example.com", title: "Docs" },
            { url: "https://mail.example.com", pinned: true }
          ]
        }),
        workspace({
          id: "trash-1",
          name: "Old",
          trashedAt: 123,
          tabs: [{ url: "https://old.example.com" }]
        })
      ]
    })

    const handler = createAgentCommandHandler(deps)
    const response = await handler(
      {
        _tabplexAgent: true,
        command: "getState"
      },
      { preferredWindowId: 7 }
    )

    expect(response).toEqual({
      ok: true,
      result: {
        activeWorkspaceId: "workspace-1",
        controlWindowId: 7,
        windowBinding: {
          workspaceId: "workspace-1",
          tabsRevision: 0,
          updatedAt: 1
        },
        version: "0.0.3",
        supportedCommands: expect.arrayContaining([
          "getState",
          "getWorkspace",
          "setWorkspaceNote",
          "updateSetting"
        ]),
        settings: {
          agentControlEnabled: true,
          language: undefined,
          theme: "system",
          accentColor: "#0EA5E9",
          workspaceSort: "created"
        },
        workspaces: [
          {
            id: "workspace-1",
            name: "Docs",
            color: undefined,
            emoji: undefined,
            tabCount: 2,
            lastUsedAt: 2,
            updatedAt: undefined,
            trashedAt: undefined
          }
        ],
        trashCount: 1
      }
    })
  })

  it("summarizes large workspace state without returning tab payloads", async () => {
    const workspaces = Array.from({ length: 500 }, (_, index) =>
      workspace({
        id: `workspace-${index}`,
        name: `Workspace ${index}`,
        tabs: Array.from({ length: 40 }, (_tab, tabIndex) => ({
          url: `https://example.com/${index}/${tabIndex}`,
          title: `Tab ${tabIndex}`
        }))
      })
    )
    const deps = makeDeps({
      settings: { agentControlEnabled: true },
      workspaceState: { activeWorkspaceId: "workspace-0" },
      workspaces
    })

    const handler = createAgentCommandHandler(deps)
    const response = await handler({
      _tabplexAgent: true,
      command: "getState"
    })

    expect(response.ok).toBe(true)
    if (!response.ok) return
    const result = response.result as {
      workspaces: Array<{ tabCount: number; tabs?: unknown }>
    }
    expect(result.workspaces).toHaveLength(500)
    expect(result.workspaces[0]).toMatchObject({ tabCount: 40 })
    expect(result.workspaces[0]).not.toHaveProperty("tabs")
  })

  it("searches non-trashed workspaces by name", async () => {
    const deps = makeDeps({
      settings: { agentControlEnabled: true },
      workspaces: [
        workspace({ id: "docs", name: "Docs" }),
        workspace({ id: "dev", name: "Development" }),
        workspace({ id: "old-docs", name: "Old Docs", trashedAt: 12 })
      ]
    })
    const handler = createAgentCommandHandler(deps)

    const response = await handler({
      _tabplexAgent: true,
      command: "searchWorkspaces",
      payload: { query: "doc" }
    })

    expect(response).toEqual({
      ok: true,
      result: [
        {
          id: "docs",
          name: "Docs",
          color: undefined,
          emoji: undefined,
          tabCount: 0,
          lastUsedAt: 2,
          updatedAt: undefined,
          trashedAt: undefined
        }
      ]
    })
  })

  it("returns workspace tabs, snapshots, and notes without favicon payloads", async () => {
    const deps = makeDeps({
      workspaces: [
        workspace({
          id: "docs",
          name: "Docs",
          tabs: [
            {
              url: "https://docs.example.com",
              title: "Docs",
              faviconUrl: "data:image/png;base64,secret"
            }
          ],
          history: [
            {
              id: "snapshot-1",
              createdAt: 9,
              tabs: [
                {
                  url: "https://old.example.com",
                  faviconUrl: "https://old.example.com/favicon.ico"
                }
              ]
            }
          ]
        })
      ],
      workspaceState: {
        notes: { docs: "Research note" },
        notePreview: { docs: true }
      }
    })
    const handler = createAgentCommandHandler(deps)

    const response = await handler({
      _tabplexAgent: true,
      command: "getWorkspace",
      payload: { workspaceId: "docs" }
    })

    expect(response).toMatchObject({
      ok: true,
      result: {
        note: "Research note",
        notePreview: true,
        workspace: {
          id: "docs",
          tabs: [{ url: "https://docs.example.com", title: "Docs" }],
          history: [
            {
              id: "snapshot-1",
              tabs: [{ url: "https://old.example.com" }]
            }
          ]
        }
      }
    })
    expect(JSON.stringify(response)).not.toContain("favicon")
  })

  it("routes workspace, note, settings, and tab actions through safe adapters", async () => {
    const deps = makeDeps()
    const handler = createAgentCommandHandler(deps)
    const context = { preferredWindowId: 17 }

    await handler(
      {
        _tabplexAgent: true,
        command: "renameWorkspace",
        payload: { workspaceId: "docs", name: "Research" }
      },
      context
    )
    await handler({
      _tabplexAgent: true,
      command: "setWorkspaceNote",
      payload: { workspaceId: "docs", note: "Updated" }
    })
    await handler({
      _tabplexAgent: true,
      command: "updateSetting",
      payload: { key: "theme", value: "dark" }
    })
    await handler(
      {
        _tabplexAgent: true,
        command: "openWorkspaceTab",
        payload: {
          workspaceId: "docs",
          tab: { url: "https://example.com" }
        }
      },
      context
    )

    expect(deps.applyWorkspaceOperation).toHaveBeenCalledWith(
      { kind: "rename", id: "docs", name: "Research" },
      17
    )
    expect(deps.patchWorkspaceState).toHaveBeenCalledWith({
      notes: { docs: "Updated" }
    })
    expect(deps.updateSetting).toHaveBeenCalledWith("theme", "dark")
    expect(deps.openWorkspaceTab).toHaveBeenCalledWith(
      "docs",
      { url: "https://example.com" },
      17
    )
  })

  it("uses a non-destructive trash operation for Agent requests", async () => {
    const deps = makeDeps()
    const handler = createAgentCommandHandler(deps)

    await handler({
      _tabplexAgent: true,
      command: "trashWorkspace",
      payload: { workspaceId: "empty-workspace" }
    })

    expect(deps.applyWorkspaceOperation).toHaveBeenCalledWith(
      { kind: "trash", id: "empty-workspace" },
      undefined
    )
  })

  it("creates a workspace through the injected workspace creator", async () => {
    const deps = makeDeps({
      settings: { agentControlEnabled: true }
    })
    const handler = createAgentCommandHandler(deps)

    const response = await handler({
      _tabplexAgent: true,
      command: "createWorkspace",
      payload: { name: "Research" }
    })

    expect(deps.createWorkspace).toHaveBeenCalledWith("Research")
    expect(response).toEqual({
      ok: true,
      result: {
        id: "created-1",
        name: "Research",
        color: undefined,
        emoji: undefined,
        tabCount: 0,
        lastUsedAt: 10,
        updatedAt: undefined,
        trashedAt: undefined
      }
    })
  })

  it("switches workspace by id", async () => {
    const deps = makeDeps({
      settings: { agentControlEnabled: true }
    })
    const handler = createAgentCommandHandler(deps)

    const response = await handler({
      _tabplexAgent: true,
      command: "switchWorkspace",
      payload: { workspaceId: "workspace-1" }
    })

    expect(deps.switchWorkspace).toHaveBeenCalledWith("workspace-1", undefined)
    expect(response).toEqual({ ok: true })
  })

  it("builds and prepends an empty agent-created workspace", async () => {
    const applyWorkspacesUpdate = vi.fn(
      async (update: (current: Workspace[]) => Workspace[]) => {
        const current = [workspace({ id: "existing", name: "Existing" })]
        return update(current)
      }
    )
    const createWorkspace = createAgentWorkspaceFactory({
      applyWorkspacesUpdate,
      createId: () => "agent-created",
      now: () => 99
    })

    const created = await createWorkspace("Research")

    expect(created).toMatchObject({
      id: "agent-created",
      name: "Research",
      createdAt: 99,
      lastUsedAt: 99,
      updatedAt: 99,
      tabs: [],
      history: []
    })
    expect(applyWorkspacesUpdate).toHaveBeenCalledTimes(1)
    const next = await applyWorkspacesUpdate.mock.results[0].value
    expect(next.map((item: Workspace) => item.id)).toEqual([
      "agent-created",
      "existing"
    ])
  })
})
