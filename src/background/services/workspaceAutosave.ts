import {
  getWorkspaceWindowBinding,
  loadWorkspaceWindowBindings,
  updateWorkspaceWindowBindings
} from "~core/storage"
import type { TabSpec, WorkspaceWindowBinding } from "~core/types"
import {
  hasStructuralTabChanges,
  recordSnapshot,
  sanitizeTabSpecs
} from "~features/workspace/logic/workspaceLogic"
import { applyWorkspacesUpdate } from "~lib/workspacesQueue"

import { captureWorkspaceWindowTabs } from "./workspaceWindowTabs"

type AutosaveResult =
  | { status: "unbound" | "unchanged" | "saved"; workspaceId?: string }
  | { status: "stale"; workspaceId: string }

const requestedWindowIds = new Set<number>()
const suppressedWindowIds = new Set<number>()
const dirtySuppressedWindowIds = new Set<number>()
const mutationGenerationByWindow = new Map<number, number>()
let drainPromise: Promise<void> | null = null

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const tabKey = (tab: TabSpec) =>
  JSON.stringify({
    url: tab.url,
    pinned: tab.pinned === true,
    title: tab.title ?? null,
    faviconUrl: tab.faviconUrl ?? null,
    excluded: tab.excluded === true,
    group: tab.group ?? null
  })

const tabsEqual = (left: TabSpec[], right: TabSpec[]) => {
  const a = sanitizeTabSpecs(left)
  const b = sanitizeTabSpecs(right)
  return (
    a.length === b.length &&
    a.every((tab, index) => tabKey(tab) === tabKey(b[index]))
  )
}

const bindingStillMatches = (
  current: WorkspaceWindowBinding | null | undefined,
  expected: WorkspaceWindowBinding
) =>
  !!current &&
  current.workspaceId === expected.workspaceId &&
  current.tabsRevision === expected.tabsRevision &&
  current.stale !== true

const updateBindingIfCurrent = async (
  windowId: number,
  expected: WorkspaceWindowBinding,
  update: (binding: WorkspaceWindowBinding) => WorkspaceWindowBinding
) => {
  await updateWorkspaceWindowBindings((bindings) => {
    const key = String(windowId)
    const current = bindings[key]
    if (!bindingStillMatches(current, expected)) return bindings
    return { ...bindings, [key]: update(current) }
  })
}

export const flushWorkspaceWindowAutosave = async (
  windowId: number,
  options?: { skipHistory?: boolean }
): Promise<AutosaveResult> => {
  const binding = await getWorkspaceWindowBinding(windowId)
  if (!binding) return { status: "unbound" }
  if (binding.stale) {
    return { status: "stale", workspaceId: binding.workspaceId }
  }

  const generation = mutationGenerationByWindow.get(windowId) ?? 0
  let conflict = false
  let changed = false
  let nextRevision = binding.tabsRevision

  const currentWorkspaces = await applyWorkspacesUpdate(async (workspaces) => {
    const workspaceIndex = workspaces.findIndex(
      (workspace) =>
        workspace.id === binding.workspaceId && !workspace.trashedAt
    )
    if (workspaceIndex < 0) {
      conflict = true
      return workspaces
    }

    const workspace = workspaces[workspaceIndex]
    const liveTabs = await captureWorkspaceWindowTabs({
      windowId,
      previousTabs: workspace.tabs
    })
    if ((mutationGenerationByWindow.get(windowId) ?? 0) !== generation) {
      throw new Error("workspace-autosave-tabs-changed-during-capture")
    }

    const latestBinding = await getWorkspaceWindowBinding(windowId)
    const workspaceRevision = workspace.tabsRevision ?? 0
    if (
      !bindingStillMatches(latestBinding, binding) ||
      workspaceRevision !== binding.tabsRevision
    ) {
      conflict = true
      return workspaces
    }
    if (tabsEqual(workspace.tabs, liveTabs)) return workspaces

    const base =
      options?.skipHistory !== true &&
      hasStructuralTabChanges(workspace.tabs, liveTabs)
        ? recordSnapshot(workspace, workspace.tabs)
        : workspace
    nextRevision = workspaceRevision + 1
    const next = [...workspaces]
    next[workspaceIndex] = {
      ...base,
      tabs: liveTabs,
      tabsRevision: nextRevision,
      lastUsedAt: Date.now(),
      updatedAt: Date.now()
    }
    changed = true
    return next
  })

  if (conflict) {
    await updateBindingIfCurrent(windowId, binding, (current) => ({
      ...current,
      stale: true,
      updatedAt: Date.now()
    }))
    return { status: "stale", workspaceId: binding.workspaceId }
  }

  if (!changed) {
    return currentWorkspaces.some(
      (workspace) => workspace.id === binding.workspaceId
    )
      ? { status: "unchanged", workspaceId: binding.workspaceId }
      : { status: "stale", workspaceId: binding.workspaceId }
  }

  await updateBindingIfCurrent(windowId, binding, (current) => ({
    ...current,
    tabsRevision: nextRevision,
    stale: false,
    updatedAt: Date.now()
  }))
  await markOtherWorkspaceBindingsStale(binding.workspaceId, windowId)
  return { status: "saved", workspaceId: binding.workspaceId }
}

const drainAutosaves = async () => {
  while (requestedWindowIds.size) {
    const windowIds = [...requestedWindowIds]
    requestedWindowIds.clear()
    for (const windowId of windowIds) {
      if (suppressedWindowIds.has(windowId)) {
        dirtySuppressedWindowIds.add(windowId)
        continue
      }
      try {
        await flushWorkspaceWindowAutosave(windowId)
      } catch (error) {
        const message = getErrorMessage(error)
        if (message === "workspace-autosave-tabs-changed-during-capture") {
          requestedWindowIds.add(windowId)
          continue
        }
        // Loading pages and TabPlex placeholders are intentionally excluded
        // from capture. Their later tab updates will schedule the next save;
        // logging every intermediate state creates a warning storm without
        // adding diagnostic value.
        if (message === "workspace-window-tabs-busy") continue
        console.warn("[TabPlex] 当前窗口自动保存失败", windowId, error)
      }
    }
  }
}

const scheduleWorkspaceWindowAutosave = (windowId: number) => {
  if (suppressedWindowIds.has(windowId)) {
    dirtySuppressedWindowIds.add(windowId)
    return
  }
  requestedWindowIds.add(windowId)
  if (drainPromise) return
  drainPromise = Promise.resolve()
    .then(drainAutosaves)
    .finally(() => {
      drainPromise = null
      if (requestedWindowIds.size) scheduleWorkspaceWindowAutosave(windowId)
    })
}

export const noteWorkspaceWindowMutation = (windowId: number) => {
  mutationGenerationByWindow.set(
    windowId,
    (mutationGenerationByWindow.get(windowId) ?? 0) + 1
  )
  scheduleWorkspaceWindowAutosave(windowId)
}

export const suppressWorkspaceWindowAutosave = (windowId: number) => {
  suppressedWindowIds.add(windowId)
  dirtySuppressedWindowIds.delete(windowId)
}

export const resumeWorkspaceWindowAutosave = (
  windowId: number,
  options?: { discardPending?: boolean }
) => {
  suppressedWindowIds.delete(windowId)
  const dirty = dirtySuppressedWindowIds.delete(windowId)
  if (dirty && options?.discardPending !== true) {
    scheduleWorkspaceWindowAutosave(windowId)
  }
}

export const flushAllWorkspaceWindowAutosaves = async () => {
  if (drainPromise) await drainPromise
  const bindings = await loadWorkspaceWindowBindings()
  for (const key of Object.keys(bindings)) {
    const windowId = Number(key)
    if (!Number.isSafeInteger(windowId) || suppressedWindowIds.has(windowId)) {
      continue
    }
    await flushWorkspaceWindowAutosave(windowId)
  }
}

export const markOtherWorkspaceBindingsStale = async (
  workspaceId: string,
  exceptWindowId?: number
) => {
  await updateWorkspaceWindowBindings((bindings) => {
    let changed = false
    const next = { ...bindings }
    for (const [key, binding] of Object.entries(bindings)) {
      if (
        binding.workspaceId !== workspaceId ||
        Number(key) === exceptWindowId ||
        binding.stale
      ) {
        continue
      }
      changed = true
      next[key] = { ...binding, stale: true, updatedAt: Date.now() }
    }
    return changed ? next : bindings
  })
}

export const resetWorkspaceAutosaveRuntime = () => {
  requestedWindowIds.clear()
  suppressedWindowIds.clear()
  dirtySuppressedWindowIds.clear()
  mutationGenerationByWindow.clear()
}
