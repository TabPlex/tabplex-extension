import type {
  Settings,
  TabSpec,
  Workspace,
  WorkspaceState,
  WorkspaceWindowBinding
} from "~core/types"
import { sanitizeWorkspace } from "~features/workspace/logic/workspaceLogic"

import type {
  AgentCommand,
  AgentMutableSettingKey
} from "./agentControlProtocol"
import { AGENT_COMMANDS } from "./agentControlProtocol"

export type AgentRequest = {
  _tabplexAgent: true
  command: AgentCommand
  payload?: unknown
}

export type AgentResponse =
  { ok: true; result?: unknown } | { ok: false; error: string }

export type AgentRequestContext = {
  preferredWindowId?: number
}

type SwitchResult =
  { success: true } | { success: false; reason?: string; error?: string }

export type AgentControlDeps = {
  loadSettings: () => Promise<Settings>
  loadWorkspaces: () => Promise<Workspace[]>
  loadWorkspaceState: () => Promise<WorkspaceState>
  loadWindowBinding: (
    windowId: number
  ) => Promise<WorkspaceWindowBinding | null>
  openHome: (preferredWindowId?: number) => Promise<void>
  openSettings: (preferredWindowId?: number) => Promise<void>
  openShortcuts: (preferredWindowId?: number) => Promise<void>
  switchWorkspace: (
    workspaceId: string,
    preferredWindowId?: number
  ) => Promise<SwitchResult>
  createWorkspace: (name: string) => Promise<Workspace>
  applyWorkspaceOperation: (
    operation: Record<string, unknown>,
    preferredWindowId?: number
  ) => Promise<AgentResponse>
  patchWorkspaceState: (
    patch: Partial<WorkspaceState>
  ) => Promise<AgentResponse>
  updateSetting: (
    key: AgentMutableSettingKey,
    value: unknown
  ) => Promise<AgentResponse>
  openWorkspaceTab: (
    workspaceId: string,
    tab: TabSpec,
    preferredWindowId?: number
  ) => Promise<AgentResponse>
  captureWorkspaceTabs: (
    workspaceId: string,
    skipHistory: boolean,
    preferredWindowId?: number
  ) => Promise<AgentResponse>
  getVersion: () => string
}

type ApplyWorkspacesUpdate = (
  update: (current: Workspace[]) => Workspace[]
) => Promise<unknown>

export const createAgentWorkspaceFactory = (deps: {
  applyWorkspacesUpdate: ApplyWorkspacesUpdate
  createId: () => string
  now: () => number
}) => {
  return async (name: string) => {
    const timestamp = deps.now()
    const workspace = sanitizeWorkspace({
      id: deps.createId(),
      name,
      createdAt: timestamp,
      lastUsedAt: timestamp,
      updatedAt: timestamp,
      tabs: [],
      history: []
    })

    await deps.applyWorkspacesUpdate((current) => [
      workspace,
      ...current.filter((item) => item.id !== workspace.id)
    ])

    return workspace
  }
}

type WorkspaceSummary = {
  id: string
  name: string
  color?: string | null
  emoji?: string
  tabCount: number
  lastUsedAt?: number
  updatedAt?: number
  trashedAt?: number | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

const payloadRecord = (payload: unknown) => (isRecord(payload) ? payload : {})

const summarizeWorkspace = (workspace: Workspace): WorkspaceSummary => ({
  id: workspace.id,
  name: workspace.name,
  color: workspace.color,
  emoji: workspace.emoji,
  tabCount: workspace.tabs?.length ?? 0,
  lastUsedAt: workspace.lastUsedAt,
  updatedAt: workspace.updatedAt,
  trashedAt: workspace.trashedAt
})

const activeWorkspaces = (workspaces: Workspace[]) =>
  workspaces.filter((workspace) => !workspace.trashedAt)

const toAgentTab = (tab: TabSpec): Omit<TabSpec, "faviconUrl"> => ({
  url: tab.url,
  pinned: tab.pinned,
  title: tab.title,
  lastAccessedAt: tab.lastAccessedAt,
  excluded: tab.excluded,
  group: tab.group
})

const toAgentWorkspace = (workspace: Workspace) => ({
  id: workspace.id,
  name: workspace.name,
  color: workspace.color,
  emoji: workspace.emoji,
  createdAt: workspace.createdAt,
  lastUsedAt: workspace.lastUsedAt,
  updatedAt: workspace.updatedAt,
  tabsRevision: workspace.tabsRevision ?? 0,
  trashedAt: workspace.trashedAt,
  tabs: workspace.tabs.map(toAgentTab),
  history: (workspace.history ?? []).map((snapshot) => ({
    id: snapshot.id,
    createdAt: snapshot.createdAt,
    tabs: snapshot.tabs.map(toAgentTab)
  }))
})

const createStateResult = async (
  deps: AgentControlDeps,
  context: AgentRequestContext
) => {
  const [settings, workspaces, windowBinding] = await Promise.all([
    deps.loadSettings(),
    deps.loadWorkspaces(),
    typeof context.preferredWindowId === "number"
      ? deps.loadWindowBinding(context.preferredWindowId)
      : Promise.resolve(null)
  ])
  const liveWorkspaces = activeWorkspaces(workspaces)
  return {
    activeWorkspaceId: windowBinding?.workspaceId ?? null,
    controlWindowId: context.preferredWindowId ?? null,
    windowBinding,
    version: deps.getVersion(),
    supportedCommands: AGENT_COMMANDS,
    settings: {
      agentControlEnabled: !!settings.agentControlEnabled,
      language: settings.language,
      theme: settings.theme,
      accentColor: settings.accentColor,
      workspaceSort: settings.workspaceSort
    },
    workspaces: liveWorkspaces.map(summarizeWorkspace),
    trashCount: workspaces.length - liveWorkspaces.length
  }
}

const getWorkspaceResult = async (
  deps: AgentControlDeps,
  workspaceId: string
): Promise<AgentResponse> => {
  const [workspaces, workspaceState] = await Promise.all([
    deps.loadWorkspaces(),
    deps.loadWorkspaceState()
  ])
  const workspace = workspaces.find((item) => item.id === workspaceId)
  if (!workspace) return { ok: false, error: "workspace-not-found" }
  return {
    ok: true,
    result: {
      workspace: toAgentWorkspace(workspace),
      note: workspaceState.notes?.[workspaceId] ?? "",
      notePreview: workspaceState.notePreview?.[workspaceId] ?? false
    }
  }
}

const workspaceOperation = (
  deps: AgentControlDeps,
  context: AgentRequestContext,
  operation: Record<string, unknown>
) => deps.applyWorkspaceOperation(operation, context.preferredWindowId)

type AgentExecutor = (
  payload: Record<string, unknown>,
  context: AgentRequestContext
) => Promise<AgentResponse>

const createExecutors = (
  deps: AgentControlDeps
): Record<AgentCommand, AgentExecutor> => ({
  getState: async (_payload, context) => ({
    ok: true,
    result: await createStateResult(deps, context)
  }),
  getWorkspace: (payload) =>
    getWorkspaceResult(deps, payload.workspaceId as string),
  searchWorkspaces: async (payload) => {
    const query = String(payload.query ?? "").toLowerCase()
    const workspaces = activeWorkspaces(await deps.loadWorkspaces())
    return {
      ok: true,
      result: workspaces
        .filter((workspace) =>
          query ? workspace.name.toLowerCase().includes(query) : true
        )
        .map(summarizeWorkspace)
    }
  },
  openHome: async (_payload, context) => {
    await deps.openHome(context.preferredWindowId)
    return { ok: true }
  },
  openSettings: async (_payload, context) => {
    await deps.openSettings(context.preferredWindowId)
    return { ok: true }
  },
  openShortcuts: async (_payload, context) => {
    await deps.openShortcuts(context.preferredWindowId)
    return { ok: true }
  },
  createWorkspace: async (payload) => {
    const workspace = await deps.createWorkspace(payload.name as string)
    return { ok: true, result: summarizeWorkspace(workspace) }
  },
  switchWorkspace: async (payload, context) => {
    const result = await deps.switchWorkspace(
      payload.workspaceId as string,
      context.preferredWindowId
    )
    if (result.success) return { ok: true }
    return {
      ok: false,
      error:
        "error" in result && result.error
          ? result.error
          : "reason" in result
            ? (result.reason ?? "workspace-switch-failed")
            : "workspace-switch-failed"
    }
  },
  renameWorkspace: (payload, context) =>
    workspaceOperation(deps, context, {
      kind: "rename",
      id: payload.workspaceId,
      name: payload.name
    }),
  setWorkspaceColor: (payload, context) =>
    workspaceOperation(deps, context, {
      kind: "recolor",
      id: payload.workspaceId,
      color: payload.color
    }),
  setWorkspaceEmoji: (payload, context) =>
    workspaceOperation(deps, context, {
      kind: "emoji",
      id: payload.workspaceId,
      emoji: payload.emoji
    }),
  trashWorkspace: (payload, context) =>
    workspaceOperation(deps, context, {
      kind: "trash",
      id: payload.workspaceId
    }),
  restoreWorkspace: (payload, context) =>
    workspaceOperation(deps, context, {
      kind: "restore",
      id: payload.workspaceId
    }),
  deleteWorkspace: (payload, context) =>
    workspaceOperation(deps, context, {
      kind: "delete",
      id: payload.workspaceId
    }),
  emptyTrash: (_payload, context) =>
    workspaceOperation(deps, context, { kind: "empty-trash" }),
  setWorkspaceNote: (payload) =>
    deps.patchWorkspaceState({
      notes: { [payload.workspaceId as string]: payload.note as string }
    }),
  openWorkspaceTab: (payload, context) =>
    deps.openWorkspaceTab(
      payload.workspaceId as string,
      payload.tab as TabSpec,
      context.preferredWindowId
    ),
  captureWorkspaceTabs: (payload, context) =>
    deps.captureWorkspaceTabs(
      payload.workspaceId as string,
      payload.skipHistory === true,
      context.preferredWindowId
    ),
  setTabExcluded: (payload, context) =>
    workspaceOperation(deps, context, {
      kind: "exclude-tab",
      workspaceId: payload.workspaceId,
      tabIndexOrUrl: payload.tabIndexOrUrl,
      excluded: payload.excluded
    }),
  removeWorkspaceTabs: (payload, context) =>
    workspaceOperation(deps, context, {
      kind: "remove-tab-indexes",
      workspaceId: payload.workspaceId,
      tabIndexes: payload.tabIndexes
    }),
  moveWorkspaceTabs: (payload, context) =>
    workspaceOperation(deps, context, {
      kind: "move-tabs",
      sourceId: payload.sourceId,
      targetId: payload.targetId,
      tabIndexes: payload.tabIndexes
    }),
  replaceWorkspaceTabs: (payload, context) =>
    workspaceOperation(deps, context, {
      kind: "set-tabs",
      workspaceId: payload.workspaceId,
      tabs: payload.tabs,
      skipHistory: payload.skipHistory === true
    }),
  createWorkspaceSnapshot: (payload, context) =>
    workspaceOperation(deps, context, {
      kind: "snapshot",
      workspaceId: payload.workspaceId
    }),
  restoreWorkspaceSnapshot: (payload, context) =>
    workspaceOperation(deps, context, {
      kind: "restore-snapshot",
      workspaceId: payload.workspaceId,
      snapshotId: payload.snapshotId
    }),
  updateSetting: (payload) =>
    deps.updateSetting(payload.key as AgentMutableSettingKey, payload.value)
})

export const createAgentCommandHandler = (deps: AgentControlDeps) => {
  const executors = createExecutors(deps)
  return (
    request: AgentRequest,
    context: AgentRequestContext = {}
  ): Promise<AgentResponse> => {
    const executor = executors[request.command]
    return executor(payloadRecord(request.payload), context)
  }
}
