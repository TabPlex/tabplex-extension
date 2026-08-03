import { describe, expect, it } from "vitest"

import type { Settings, Workspace, WorkspaceState } from "~core/types"

import {
  computeBackupDigest,
  createBackupV3,
  parseBackupFile,
  type BackupWarningCode
} from "./index"

const createWorkspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  id: "workspace-1",
  name: "研究",
  color: "#123ABC",
  emoji: "🧪",
  createdAt: 100,
  updatedAt: 200,
  tabs: [
    {
      url: "https://example.com/article",
      title: "Article",
      group: {
        key: "research",
        title: "Research",
        color: "cyan",
        collapsed: true,
        groupId: 404
      } as any
    }
  ],
  history: [
    {
      id: "snapshot-1",
      createdAt: 50,
      tabs: [{ url: "https://example.com/old" }]
    }
  ],
  ...overrides
})

const settings = {
  switchMode: "replaceCurrentWindow",
  tabRestoreMode: "soft",
  ensureHomePinned: true,
  defaultHomeUrl: "popup.html?mode=home",
  devMode: true,
  agentControlEnabled: true,
  theme: "dark",
  language: "zh-CN",
  accentColor: "#ABCDEF",
  singleClickSwitch: true,
  shortcuts: { nextWorkspace: "Alt+Down" },
  workspaceSort: "lastUsed"
} as Settings & Record<string, unknown>

const workspaceState: WorkspaceState = {
  notes: { "workspace-1": "# Research note" },
  linkedResources: {
    "workspace-1": [
      {
        id: "forged-id",
        url: "https://example.com/spec#private",
        host: "evil.example",
        title: "Forged title",
        provider: "Forged provider",
        createdAt: 300
      }
    ]
  },
  activeWorkspaceId: "workspace-1"
}

const warningCodes = (warnings: Array<{ code: BackupWarningCode }>) =>
  warnings.map((warning) => warning.code)

const checksummedV2 = async (payload: unknown) => {
  const unsigned = {
    schema: "tabplex-backup" as const,
    version: 2 as const,
    exportedAt: "2026-07-11T00:00:00.000Z",
    source: { extensionVersion: "0.0.3" },
    payload
  }
  return {
    ...unsigned,
    integrity: {
      algorithm: "SHA-256",
      canonicalization: "tabplex-c14n-v1",
      digest: await computeBackupDigest(unsigned)
    }
  }
}

describe("TabPlex backup v3", () => {
  it("exports flat workspace tabs without runtime window state", async () => {
    const { backup, warnings } = await createBackupV3(
      { workspaces: [createWorkspace()], workspaceState, settings },
      {
        exportedAt: "2026-07-11T00:00:00.000Z",
        extensionVersion: "0.0.3"
      }
    )

    expect(backup.version).toBe(3)
    expect(backup.payload).not.toHaveProperty("virtualWindows")
    expect(backup.payload.workspaces[0]).not.toHaveProperty("windowSlots")
    expect(backup.payload.workspaces[0].tabs).toEqual([
      expect.objectContaining({
        url: "https://example.com/article",
        group: {
          key: "research",
          title: "Research",
          color: "cyan",
          collapsed: true
        }
      })
    ])
    expect(backup.payload.workspaces[0].tabs[0].group).not.toHaveProperty(
      "groupId"
    )
    expect(warnings).toEqual([])
    expect(backup.payload.workspaceContexts).toEqual([
      {
        workspaceId: "workspace-1",
        note: "# Research note",
        linkedResources: [
          {
            id: "https://example.com/spec",
            url: "https://example.com/spec",
            host: "example.com",
            title: "spec",
            provider: "Link",
            createdAt: 300
          }
        ]
      }
    ])
    expect(backup.payload.settings).toEqual({
      language: "zh-CN",
      theme: "dark",
      accentColor: "#ABCDEF",
      tabRestoreMode: "aggressive",
      workspaceSort: "lastUsed"
    })
    expect(JSON.stringify(backup)).not.toContain("agentControlEnabled")
    expect(backup.integrity.digest).toMatch(/^[a-f0-9]{64}$/)

    const parsed = await parseBackupFile(JSON.stringify(backup))
    expect(parsed.sourceVersion).toBe(3)
    expect(parsed.integrity).toBe("checksum-verified")
    expect(parsed.payload).toEqual(backup.payload)
  })

  it("omits favicons from current tabs and history without warnings", async () => {
    const { backup, warnings } = await createBackupV3(
      {
        workspaces: [
          createWorkspace({
            tabs: [
              {
                url: "https://network-icon.example.com",
                faviconUrl: "https://cdn.example.com/favicon.png"
              },
              {
                url: "https://browser-icon.example.com",
                faviconUrl: "chrome://favicon/size/16@1x/example.com"
              }
            ],
            history: [
              {
                id: "snapshot-with-icons",
                createdAt: 50,
                tabs: [
                  {
                    url: "https://data-icon.example.com",
                    faviconUrl: "data:image/png;base64,cG5n"
                  },
                  {
                    url: "https://svg-icon.example.com",
                    faviconUrl:
                      "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>"
                  }
                ]
              }
            ]
          })
        ],
        workspaceState,
        settings
      },
      {
        exportedAt: "2026-07-11T00:00:00.000Z",
        extensionVersion: "0.0.3"
      }
    )

    expect(
      backup.payload.workspaces[0].tabs.map((tab) => tab.faviconUrl)
    ).toEqual([null, null])
    expect(
      backup.payload.workspaces[0].history[0].tabs.map((tab) => tab.faviconUrl)
    ).toEqual([null, null])
    expect(warnings).toEqual([])
    expect(JSON.stringify(backup)).not.toContain("cdn.example.com/favicon.png")
    expect(JSON.stringify(backup)).not.toContain("data:image")
  })

  it("silently drops favicons from older checksummed backups", async () => {
    const { backup } = await createBackupV3(
      { workspaces: [createWorkspace()], workspaceState, settings },
      { exportedAt: "2026-07-11T00:00:00.000Z", extensionVersion: "0.0.3" }
    )
    const backupWithFavicon = JSON.parse(JSON.stringify(backup))
    backupWithFavicon.payload.workspaces[0].tabs[0].faviconUrl =
      "https://legacy.example.com/favicon.ico"
    backupWithFavicon.integrity.digest =
      await computeBackupDigest(backupWithFavicon)

    const parsed = await parseBackupFile(JSON.stringify(backupWithFavicon))

    expect(parsed.payload.workspaces[0].tabs[0].faviconUrl).toBeNull()
    expect(parsed.warnings).toEqual([])
  })

  it("rejects a v3 payload changed after checksum generation", async () => {
    const { backup } = await createBackupV3(
      { workspaces: [createWorkspace()], workspaceState, settings },
      { exportedAt: "2026-07-11T00:00:00.000Z", extensionVersion: "0.0.3" }
    )
    const tampered = JSON.parse(JSON.stringify(backup))
    tampered.payload.workspaces[0].tabs[0].group.title = "Tampered"

    await expect(parseBackupFile(JSON.stringify(tampered))).rejects.toThrow(
      /checksum-mismatch/
    )
  })

  it("imports v2 slots in order, preserves duplicates and ignores virtual windows", async () => {
    const legacy = await checksummedV2({
      workspaces: [
        {
          id: "legacy-v2",
          name: "Legacy v2",
          createdAt: 1,
          tabs: [{ url: "https://stale.example.com" }],
          windowSlots: [
            {
              slotId: "later",
              name: "Later",
              order: 2,
              isPrimary: true,
              tabs: [{ url: "https://same.example.com", title: "Later" }]
            },
            {
              slotId: "earlier",
              name: "Earlier",
              order: 1,
              isPrimary: true,
              tabs: [
                {
                  url: "https://same.example.com",
                  title: "Earlier",
                  group: { key: "legacy", groupId: 99 }
                }
              ]
            }
          ],
          history: []
        }
      ],
      workspaceContexts: [
        { workspaceId: "legacy-v2", note: "", linkedResources: [] }
      ],
      virtualWindows: "ignored legacy runtime data",
      settings: {
        language: "en-US",
        theme: "light",
        accentColor: "#123456",
        tabRestoreMode: "soft",
        workspaceSort: "created"
      }
    })

    const parsed = await parseBackupFile(JSON.stringify(legacy))

    expect(parsed.sourceVersion).toBe(2)
    expect(parsed.payload).not.toHaveProperty("virtualWindows")
    expect(parsed.payload.workspaces[0]).not.toHaveProperty("windowSlots")
    expect(parsed.payload.workspaces[0].tabs.map((tab) => tab.title)).toEqual([
      "Earlier",
      "Later"
    ])
    expect(parsed.payload.workspaces[0].tabs.map((tab) => tab.url)).toEqual([
      "https://same.example.com",
      "https://same.example.com"
    ])
    expect(parsed.payload.settings.tabRestoreMode).toBe("aggressive")
    expect(parsed.payload.workspaces[0].tabs[0].group).toEqual({
      key: "legacy"
    })
    expect(warningCodes(parsed.warnings)).toContain(
      "legacy-window-slots-flattened"
    )
  })

  it("imports v1 flat tabs and reports its missing portable context", async () => {
    const legacy = {
      schema: "tabplex-backup",
      version: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      workspaces: [
        {
          id: "legacy-1",
          name: "Legacy",
          createdAt: 1,
          tabs: [
            {
              url: "https://legacy.example.com",
              group: {
                key: "legacy-group",
                title: "Legacy",
                color: "purple",
                collapsed: false,
                groupId: 987
              }
            }
          ],
          history: []
        }
      ],
      settings: {
        language: "en-US",
        theme: "light",
        accentColor: "#123456",
        tabRestoreMode: "aggressive"
      }
    }

    const parsed = await parseBackupFile(JSON.stringify(legacy))

    expect(parsed.sourceVersion).toBe(1)
    expect(parsed.integrity).toBe("legacy-unverified")
    expect(parsed.payload.workspaces[0].tabs[0]).toMatchObject({
      url: "https://legacy.example.com",
      group: {
        key: "legacy-group",
        title: "Legacy",
        color: "purple",
        collapsed: false
      }
    })
    expect(parsed.payload.workspaces[0].tabs[0].group).not.toHaveProperty(
      "groupId"
    )
    expect(parsed.payload.workspaceContexts).toEqual([
      { workspaceId: "legacy-1", note: "", linkedResources: [] }
    ])
    expect(warningCodes(parsed.warnings)).toEqual(
      expect.arrayContaining([
        "legacy-v1-unverified",
        "legacy-v1-missing-contexts"
      ])
    )
  })

  it("does not export orphan workspace context records", async () => {
    const { backup, warnings } = await createBackupV3(
      {
        workspaces: [createWorkspace()],
        workspaceState: {
          notes: { "workspace-1": "kept", orphan: "removed" },
          linkedResources: {
            orphan: [
              {
                id: "orphan",
                url: "https://orphan.example.com",
                host: "orphan.example.com",
                title: "Orphan",
                provider: "Link",
                createdAt: 1
              }
            ]
          }
        },
        settings
      },
      { extensionVersion: "0.0.3" }
    )

    expect(backup.payload.workspaceContexts).toEqual([
      { workspaceId: "workspace-1", note: "kept", linkedResources: [] }
    ])
    expect(warningCodes(warnings)).toContain("orphan-context-dropped")
  })
})
