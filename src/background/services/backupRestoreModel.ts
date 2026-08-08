import {
  DEFAULT_WORKSPACE_STATE,
  type Settings,
  type TabSpec,
  type Workspace,
  type WorkspaceLinkedResource,
  type WorkspaceSnapshot,
  type WorkspaceState
} from "~core/types"
import type {
  ImportPlan,
  PortableLinkedResource,
  PortableSnapshot,
  PortableTab,
  PortableWorkspace
} from "~features/backup"

const compact = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T

const toTabSpec = (tab: PortableTab): TabSpec =>
  compact({
    url: tab.url,
    pinned: tab.pinned || undefined,
    title: tab.title ?? undefined,
    faviconUrl: tab.faviconUrl ?? undefined,
    lastAccessedAt: tab.lastAccessedAt ?? undefined,
    excluded: tab.excluded || undefined,
    group: tab.group ? { ...tab.group } : undefined
  })

const toSnapshot = (snapshot: PortableSnapshot): WorkspaceSnapshot => ({
  id: snapshot.id,
  createdAt: snapshot.createdAt,
  tabs: snapshot.tabs.map(toTabSpec)
})

const toWorkspace = (workspace: PortableWorkspace): Workspace =>
  compact({
    id: workspace.id,
    name: workspace.name,
    color: workspace.color,
    emoji: workspace.emoji ?? undefined,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt ?? undefined,
    lastUsedAt: workspace.lastUsedAt ?? undefined,
    trashedAt: workspace.trashedAt,
    tabs: workspace.tabs.map(toTabSpec),
    tabsRevision: 0,
    history: workspace.history.map(toSnapshot)
  }) as Workspace

const toLinkedResource = (
  resource: PortableLinkedResource
): WorkspaceLinkedResource => ({ ...resource })

const buildContextMaps = (plan: ImportPlan) => ({
  notes: Object.fromEntries(
    plan.payload.workspaceContexts.map((context) => [
      context.workspaceId,
      context.note
    ])
  ),
  linkedResources: Object.fromEntries(
    plan.payload.workspaceContexts.map((context) => [
      context.workspaceId,
      context.linkedResources.map(toLinkedResource)
    ])
  )
})

const withoutRetiredRuntimeState = (state: WorkspaceState): WorkspaceState => {
  const {
    managedWindowId: _legacyManagedWindowId,
    managedWindows: _legacyManagedWindows,
    hibernated: _legacyHibernated,
    lastAutoSaveAt: _legacyLastAutoSaveAt,
    controller: _legacyController,
    ...current
  } = state as WorkspaceState & {
    managedWindowId?: unknown
    managedWindows?: unknown
    hibernated?: unknown
    lastAutoSaveAt?: unknown
    controller?: unknown
  }
  return current
}

const buildWorkspaceState = (
  plan: ImportPlan,
  current: WorkspaceState
): WorkspaceState => {
  const context = buildContextMaps(plan)
  if (!plan.storagePolicy.resetWorkspaceRuntime) {
    const currentState = withoutRetiredRuntimeState(current)
    return {
      ...currentState,
      notes: { ...(currentState.notes ?? {}), ...context.notes },
      linkedResources: {
        ...(currentState.linkedResources ?? {}),
        ...context.linkedResources
      },
      switchState: null
    }
  }
  return {
    ...DEFAULT_WORKSPACE_STATE,
    ...context,
    activeWorkspaceId: null,
    notePreview: {},
    switchState: null
  }
}

const buildSettings = (plan: ImportPlan, current: Settings): Settings => ({
  ...current,
  language: plan.payload.settings.language ?? undefined,
  theme: plan.payload.settings.theme,
  accentColor: plan.payload.settings.accentColor,
  workspaceSort: plan.payload.settings.workspaceSort,
  devMode: plan.storagePolicy.disableAgentControl ? false : current.devMode,
  agentControlEnabled: plan.storagePolicy.disableAgentControl
    ? false
    : current.agentControlEnabled
})

export const materializeBackupImportPlan = (
  plan: ImportPlan,
  current: {
    currentSettings: Settings
    currentState: WorkspaceState
  }
) => ({
  workspaces: plan.payload.workspaces.map(toWorkspace),
  workspaceState: buildWorkspaceState(plan, current.currentState),
  settings: buildSettings(plan, current.currentSettings)
})
