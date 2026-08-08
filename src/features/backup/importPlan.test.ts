import { describe, expect, it } from "vitest"

import {
  BACKUP_LIMITS,
  createImportPlan,
  type BackupPayloadV3,
  type PortableSettings,
  type PortableWorkspace
} from "./index"

const settings = (theme: PortableSettings["theme"]): PortableSettings => ({
  language: "zh-CN",
  theme,
  accentColor: "#6C5CE7",
  tabRestoreMode: "aggressive",
  workspaceSort: "created"
})

const workspace = (id: string, name: string): PortableWorkspace => ({
  id,
  name,
  color: null,
  emoji: null,
  createdAt: 1,
  updatedAt: null,
  lastUsedAt: null,
  trashedAt: null,
  tabs: [],
  history: []
})

const payload = ({
  workspaces,
  theme = "system"
}: {
  workspaces: PortableWorkspace[]
  theme?: PortableSettings["theme"]
}): BackupPayloadV3 => ({
  workspaces,
  workspaceContexts: workspaces.map((item) => ({
    workspaceId: item.id,
    note: `note:${item.id}`,
    linkedResources: []
  })),
  settings: settings(theme)
})

describe("createImportPlan", () => {
  it("deterministically remaps workspace collisions and contexts", () => {
    const current = payload({
      workspaces: [workspace("w", "Research")],
      theme: "dark"
    })
    const incoming = payload({
      workspaces: [
        workspace("w", "Research"),
        workspace("w-imported", "Research-导入")
      ],
      theme: "light"
    })
    const currentBefore = JSON.stringify(current)
    const incomingBefore = JSON.stringify(incoming)

    const plan = createImportPlan({ mode: "merge", current, incoming })

    expect(plan.workspaceIdMap).toEqual({
      w: "w-imported-2",
      "w-imported": "w-imported"
    })
    expect(plan.payload.workspaces.map((item) => item.name)).toEqual([
      "Research",
      "Research-导入 2",
      "Research-导入"
    ])
    expect(
      plan.payload.workspaceContexts.slice(1).map((item) => item.workspaceId)
    ).toEqual(["w-imported-2", "w-imported"])
    expect(plan.payload.settings.theme).toBe("dark")
    expect(plan.settingsAction).toBe("preserve")
    expect(plan.summary).toEqual({
      importedWorkspaces: 2,
      remappedWorkspaceIds: 1,
      renamedWorkspaces: 1
    })
    expect(plan).not.toHaveProperty("virtualWindowIdMap")
    expect(JSON.stringify(current)).toBe(currentBefore)
    expect(JSON.stringify(incoming)).toBe(incomingBefore)
  })

  it("optionally applies portable settings during merge", () => {
    const current = payload({ workspaces: [], theme: "dark" })
    const incoming = payload({ workspaces: [], theme: "light" })

    const plan = createImportPlan({
      mode: "merge",
      current,
      incoming,
      includeSettings: true
    })

    expect(plan.settingsAction).toBe("replace")
    expect(plan.payload.settings.theme).toBe("light")
  })

  it("creates a replace plan with identity mappings and runtime reset policy", () => {
    const current = payload({
      workspaces: [workspace("old", "Old")],
      theme: "dark"
    })
    const incoming = payload({
      workspaces: [workspace("new", "New")],
      theme: "light"
    })

    const plan = createImportPlan({ mode: "replace", current, incoming })

    expect(plan.payload).toEqual(incoming)
    expect(plan.payload).not.toBe(incoming)
    expect(plan.workspaceIdMap).toEqual({ new: "new" })
    expect(plan.settingsAction).toBe("replace")
    expect(plan.storagePolicy).toEqual({
      resetWorkspaceRuntime: true,
      clearLegacyLayouts: true,
      clearPendingAction: true,
      preserveOnboardingAndLogs: true,
      disableAgentControl: true
    })
  })

  it.each(["merge", "replace"] as const)(
    "preserves portable tab groups in a %s import plan",
    (mode) => {
      const groupedWorkspace = workspace("grouped", "Grouped")
      groupedWorkspace.tabs = [
        {
          url: "https://grouped.example.com",
          pinned: false,
          title: "Grouped tab",
          faviconUrl: null,
          lastAccessedAt: null,
          excluded: false,
          group: {
            key: "portable-group",
            title: "Portable",
            color: "orange",
            collapsed: true
          }
        }
      ]
      const incoming = payload({ workspaces: [groupedWorkspace] })

      const plan = createImportPlan({
        mode,
        current: payload({ workspaces: [] }),
        incoming
      })
      const importedGroup = plan.payload.workspaces[0].tabs[0].group

      expect(importedGroup).toEqual({
        key: "portable-group",
        title: "Portable",
        color: "orange",
        collapsed: true
      })
      expect(importedGroup).not.toHaveProperty("groupId")
    }
  )

  it("rejects a merged payload that exceeds hard count limits", () => {
    const current = payload({
      workspaces: Array.from(
        { length: BACKUP_LIMITS.maxWorkspaces },
        (_, index) => workspace(`current-${index}`, `Current ${index}`)
      )
    })
    const incoming = payload({
      workspaces: [workspace("incoming", "Incoming")]
    })

    expect(() =>
      createImportPlan({ mode: "merge", current, incoming })
    ).toThrow(/count-limit-exceeded/)
  })

  it("keeps deterministic collision results within ID and name limits", () => {
    const longId = "i".repeat(BACKUP_LIMITS.maxIdLength)
    const longName = "N".repeat(BACKUP_LIMITS.maxNameLength)
    const current = payload({ workspaces: [workspace(longId, longName)] })
    const incoming = payload({ workspaces: [workspace(longId, longName)] })

    const first = createImportPlan({ mode: "merge", current, incoming })
    const second = createImportPlan({ mode: "merge", current, incoming })
    const imported = first.payload.workspaces[1]

    expect(imported.id).not.toBe(longId)
    expect(imported.id.length).toBeLessThanOrEqual(BACKUP_LIMITS.maxIdLength)
    expect(imported.name.length).toBeLessThanOrEqual(
      BACKUP_LIMITS.maxNameLength
    )
    expect(second.workspaceIdMap).toEqual(first.workspaceIdMap)
    expect(second.payload.workspaces[1].name).toBe(imported.name)
  })

  it("rejects a merged payload larger than the backup file limit", () => {
    const withLargeNotes = (prefix: string, count: number) => {
      const workspaces = Array.from({ length: count }, (_, index) =>
        workspace(`${prefix}-${index}`, `${prefix} ${index}`)
      )
      const result = payload({ workspaces })
      result.workspaceContexts.forEach((context) => {
        context.note = "n".repeat(BACKUP_LIMITS.maxNoteLength)
      })
      return result
    }
    const current = withLargeNotes("current", 10)
    const incoming = withLargeNotes("incoming", 11)

    expect(() =>
      createImportPlan({ mode: "merge", current, incoming })
    ).toThrow(/backup-too-large/)
  })
})
