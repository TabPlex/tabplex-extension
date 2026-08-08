import { describe, expect, it } from "vitest"

import type { Settings, Workspace, WorkspaceState } from "~core/types"

import {
  BACKUP_LIMITS,
  computeBackupDigest,
  createBackupV3,
  parseBackupFile
} from "./index"

const defaultSettings: Settings = {
  theme: "system",
  accentColor: "#6C5CE7",
  workspaceSort: "created"
}

const workspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  id: "workspace-1",
  name: "Workspace",
  createdAt: 1,
  tabs: [{ url: "https://example.com" }],
  history: [],
  ...overrides
})

const source = (
  workspaceOverrides: Partial<Workspace> = {},
  stateOverrides: Partial<WorkspaceState> = {}
) => ({
  workspaces: [workspace(workspaceOverrides)],
  workspaceState: { notes: {}, linkedResources: {}, ...stateOverrides },
  settings: defaultSettings
})

describe("backup validation limits", () => {
  it("rejects a backup larger than 8 MiB before parsing JSON", async () => {
    const oversized = " ".repeat(BACKUP_LIMITS.maxBytes + 1)
    await expect(parseBackupFile(oversized)).rejects.toThrow(/backup-too-large/)
  })

  it("refuses to generate an exported backup larger than 8 MiB", async () => {
    const workspaces = Array.from({ length: 20 }, (_, index) =>
      workspace({
        id: `workspace-${index}`,
        name: `Workspace ${index}`,
        tabs: []
      })
    )
    const notes = Object.fromEntries(
      workspaces.map((item) => [
        item.id,
        "n".repeat(BACKUP_LIMITS.maxNoteLength)
      ])
    )

    await expect(
      createBackupV3(
        {
          workspaces,
          workspaceState: { notes, linkedResources: {} },
          settings: defaultSettings
        },
        { extensionVersion: "0.0.3" }
      )
    ).rejects.toThrow(/backup-(?:too-large|string-budget-exceeded)/)
  })

  it("round-trips a near-limit compact export through the same parser budgets", async () => {
    const workspaces = Array.from({ length: 6 }, (_, index) =>
      workspace({
        id: `workspace-${index}`,
        name: `Workspace ${index}`,
        tabs: []
      })
    )
    const notes = Object.fromEntries(
      workspaces.map((item, index) => [
        item.id,
        "n".repeat(
          index === workspaces.length - 1
            ? Math.floor(BACKUP_LIMITS.maxNoteLength / 2)
            : BACKUP_LIMITS.maxNoteLength
        )
      ])
    )
    const { backup } = await createBackupV3(
      {
        workspaces,
        workspaceState: { notes, linkedResources: {} },
        settings: defaultSettings
      },
      { extensionVersion: "0.0.3" }
    )
    const downloadedBytes = JSON.stringify(backup)

    expect(new TextEncoder().encode(downloadedBytes).byteLength).toBeLessThan(
      BACKUP_LIMITS.maxBytes
    )
    await expect(parseBackupFile(downloadedBytes)).resolves.toMatchObject({
      sourceVersion: 3,
      integrity: "checksum-verified",
      payload: { workspaces: expect.any(Array) }
    })
  })

  it("rejects workspace and note strings over their hard limits", async () => {
    await expect(
      createBackupV3(
        source({ name: "n".repeat(BACKUP_LIMITS.maxNameLength + 1) }),
        { extensionVersion: "0.0.3" }
      )
    ).rejects.toThrow(/string-too-long/)

    await expect(
      createBackupV3(
        source(
          {},
          {
            notes: {
              "workspace-1": "n".repeat(BACKUP_LIMITS.maxNoteLength + 1)
            }
          }
        ),
        { extensionVersion: "0.0.3" }
      )
    ).rejects.toThrow(/string-too-long/)
  })

  it("rejects workspace counts over the hard limit", async () => {
    const workspaces = Array.from(
      { length: BACKUP_LIMITS.maxWorkspaces + 1 },
      (_, index) => ({
        id: `workspace-${index}`,
        name: `Workspace ${index}`,
        createdAt: 1,
        tabs: []
      })
    )
    const legacy = JSON.stringify({
      schema: "tabplex-backup",
      version: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      workspaces
    })

    await expect(parseBackupFile(legacy)).rejects.toThrow(
      /count-limit-exceeded/
    )
  })

  it("rejects dangerous keys before migration", async () => {
    const malicious =
      '{"schema":"tabplex-backup","version":1,"exportedAt":"2025-01-01T00:00:00.000Z","workspaces":[],"nested":{"constructor":{}}}'
    await expect(parseBackupFile(malicious)).rejects.toThrow(/dangerous-key/)
  })

  it("rejects workspace IDs that would become dangerous record keys", async () => {
    const { backup } = await createBackupV3(source(), {
      extensionVersion: "0.0.3"
    })
    const malicious = JSON.parse(JSON.stringify(backup))
    malicious.payload.workspaces[0].id = "constructor"
    malicious.payload.workspaceContexts[0].workspaceId = "constructor"
    malicious.integrity.digest = await computeBackupDigest(malicious)

    await expect(parseBackupFile(JSON.stringify(malicious))).rejects.toThrow(
      /invalid-id/
    )
  })

  it("rejects a wide JSON array before allocating traversal paths", async () => {
    const malicious = JSON.stringify({
      schema: "tabplex-backup",
      version: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      workspaces: [],
      unknown: Array.from(
        { length: BACKUP_LIMITS.maxArrayEntries + 1 },
        () => null
      )
    })
    expect(new TextEncoder().encode(malicious).byteLength).toBeLessThan(
      BACKUP_LIMITS.maxBytes
    )
    await expect(parseBackupFile(malicious)).rejects.toThrow(
      /count-limit-exceeded/
    )
  })

  it("drops unsafe v1 tabs and reports a warning", async () => {
    const legacy = JSON.stringify({
      schema: "tabplex-backup",
      version: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      workspaces: [
        {
          id: "workspace-1",
          name: "Workspace",
          createdAt: 1,
          tabs: [
            { url: "javascript:alert(1)" },
            { url: "https://safe.example.com" }
          ]
        }
      ]
    })

    const parsed = await parseBackupFile(legacy)
    expect(parsed.payload.workspaces[0].tabs).toHaveLength(1)
    expect(parsed.warnings.map((warning) => warning.code)).toContain(
      "invalid-tab-dropped"
    )
  })

  it.each([
    ["key", null, /invalid-string/],
    ["key", "   ", /empty-string/],
    ["title", 42, /invalid-string/],
    ["color", "teal", /invalid-tab-group-color/],
    ["collapsed", "yes", /invalid-tab-group-collapsed/]
  ])(
    "validates the portable tab group %s field in checksummed v3 files",
    async (field, invalidValue, expectedError) => {
      const { backup } = await createBackupV3(
        source({
          tabs: [
            {
              url: "https://grouped.example.com",
              group: {
                key: "group-1",
                title: "Grouped",
                color: "blue",
                collapsed: true
              }
            }
          ]
        }),
        { extensionVersion: "0.0.3" }
      )
      const invalid = JSON.parse(JSON.stringify(backup))
      invalid.payload.workspaces[0].tabs[0].group[field] = invalidValue
      invalid.integrity.digest = await computeBackupDigest(invalid)

      await expect(parseBackupFile(JSON.stringify(invalid))).rejects.toThrow(
        expectedError
      )
    }
  )

  it("drops a checksummed v3 runtime groupId while keeping portable metadata", async () => {
    const { backup } = await createBackupV3(
      source({
        tabs: [
          {
            url: "https://grouped.example.com",
            group: {
              key: "group-1",
              title: "Grouped",
              color: "green",
              collapsed: false
            }
          }
        ]
      }),
      { extensionVersion: "0.0.3" }
    )
    const withRuntimeId = JSON.parse(JSON.stringify(backup))
    withRuntimeId.payload.workspaces[0].tabs[0].group.groupId = 88
    withRuntimeId.integrity.digest = await computeBackupDigest(withRuntimeId)

    const parsed = await parseBackupFile(JSON.stringify(withRuntimeId))
    const group = parsed.payload.workspaces[0].tabs[0].group
    expect(group).toEqual({
      key: "group-1",
      title: "Grouped",
      color: "green",
      collapsed: false
    })
    expect(group).not.toHaveProperty("groupId")
  })

  it("keeps linked resource order stable across a v3 round trip", async () => {
    const state: Partial<WorkspaceState> = {
      linkedResources: {
        "workspace-1": [
          {
            id: "one",
            url: "https://example.com/one",
            host: "forged",
            title: "forged",
            provider: "forged",
            createdAt: 1
          },
          {
            id: "two",
            url: "https://example.com/two",
            host: "forged",
            title: "forged",
            provider: "forged",
            createdAt: 2
          }
        ]
      }
    }
    const { backup } = await createBackupV3(source({}, state), {
      extensionVersion: "0.0.3"
    })
    const parsed = await parseBackupFile(JSON.stringify(backup))

    expect(parsed.payload).toEqual(backup.payload)
    expect(
      parsed.payload.workspaceContexts[0].linkedResources.map(
        (resource) => resource.url
      )
    ).toEqual(["https://example.com/one", "https://example.com/two"])
  })
})
