import { describe, expect, it } from "vitest"

import { DEFAULT_SETTINGS, type WorkspaceState } from "~core/types"
import type { ImportPlan } from "~features/backup"

import { materializeBackupImportPlan } from "./backupRestoreModel"

const plan = (mode: "merge" | "replace"): ImportPlan => ({
  mode,
  payload: {
    workspaces: [
      {
        id: "workspace-1",
        name: "Research",
        color: null,
        emoji: null,
        createdAt: 1,
        updatedAt: 2,
        lastUsedAt: 3,
        trashedAt: null,
        tabs: [
          {
            url: "https://example.com",
            pinned: false,
            title: "Example",
            faviconUrl: null,
            lastAccessedAt: null,
            excluded: false,
            group: {
              key: "research",
              title: "Research",
              color: "blue",
              collapsed: true
            }
          }
        ],
        history: []
      }
    ],
    workspaceContexts: [
      {
        workspaceId: "workspace-1",
        note: "note",
        linkedResources: []
      }
    ],
    settings: {
      language: "en-US",
      theme: "dark",
      accentColor: "#123456",
      tabRestoreMode: "aggressive",
      workspaceSort: "lastUsed"
    }
  },
  workspaceIdMap: {},
  settingsAction: "replace",
  summary: {
    importedWorkspaces: 1,
    remappedWorkspaceIds: 0,
    renamedWorkspaces: 0
  },
  storagePolicy: {
    resetWorkspaceRuntime: mode === "replace",
    clearLegacyLayouts: mode === "replace",
    clearPendingAction: mode === "replace",
    preserveOnboardingAndLogs: true,
    disableAgentControl: mode === "replace"
  }
})

const currentState = {
  activeWorkspaceId: "current",
  notes: { current: "current note" },
  linkedResources: {},
  hibernated: { current: 1 },
  notePreview: { current: true },
  controller: { id: "controller", ts: 1 }
} as WorkspaceState

describe("backupRestoreModel", () => {
  it("materializes flat workspace tabs with a fresh revision", () => {
    const result = materializeBackupImportPlan(plan("merge"), {
      currentSettings: {
        ...DEFAULT_SETTINGS,
        agentControlEnabled: true,
        devMode: true
      },
      currentState
    })

    expect(result.workspaces[0]).toMatchObject({
      tabsRevision: 0,
      tabs: [
        {
          url: "https://example.com",
          group: {
            key: "research",
            title: "Research",
            color: "blue",
            collapsed: true
          }
        }
      ]
    })
    expect(result.workspaces[0]).not.toHaveProperty("windowSlots")
    expect(result).not.toHaveProperty("virtualWindows")
  })

  it("preserves main runtime and local security state for merge", () => {
    const result = materializeBackupImportPlan(plan("merge"), {
      currentSettings: {
        ...DEFAULT_SETTINGS,
        agentControlEnabled: true,
        devMode: true
      },
      currentState
    })

    expect(result.workspaceState).toMatchObject({
      activeWorkspaceId: "current",
      notes: { current: "current note", "workspace-1": "note" }
    })
    expect(result.workspaceState).not.toHaveProperty("managedWindowId")
    expect(result.workspaceState).not.toHaveProperty("managedWindows")
    expect(result.workspaceState).not.toHaveProperty("hibernated")
    expect(result.workspaceState).not.toHaveProperty("controller")
    expect(result.settings.agentControlEnabled).toBe(true)
    expect(result.settings.devMode).toBe(true)
    expect(result.settings).not.toHaveProperty("tabRestoreMode")
  })

  it("resets main runtime and disables Agent control for replace", () => {
    const result = materializeBackupImportPlan(plan("replace"), {
      currentSettings: {
        ...DEFAULT_SETTINGS,
        agentControlEnabled: true,
        devMode: true
      },
      currentState
    })

    expect(result.workspaceState).toMatchObject({
      activeWorkspaceId: null,
      notePreview: {},
      switchState: null
    })
    expect(result.workspaceState).not.toHaveProperty("hibernated")
    expect(result.workspaceState).not.toHaveProperty("controller")
    expect(result.workspaceState).not.toHaveProperty("managedWindowId")
    expect(result.workspaceState).not.toHaveProperty("managedWindows")
    expect(result.settings.agentControlEnabled).toBe(false)
    expect(result.settings.devMode).toBe(false)
    expect(result.settings).not.toHaveProperty("tabRestoreMode")
  })
})
