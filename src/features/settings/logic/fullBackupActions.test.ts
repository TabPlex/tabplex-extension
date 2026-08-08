import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  requestFullBackupExport,
  requestFullBackupImport
} from "./fullBackupActions"

const sendMessage = vi.fn()

describe("fullBackupActions", () => {
  beforeEach(() => {
    sendMessage.mockReset()
    globalThis.chrome = {
      runtime: { sendMessage }
    } as unknown as typeof chrome
  })

  it("exports the complete portable backup through the background barrier", async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      result: {
        backup: {
          schema: "tabplex-backup",
          version: 3,
          exportedAt: "2026-08-03T00:00:00.000Z",
          source: { extensionVersion: "0.0.3" },
          payload: {
            workspaces: [],
            workspaceContexts: [],
            settings: {}
          },
          integrity: {
            algorithm: "SHA-256",
            canonicalization: "tabplex-c14n-v1",
            digest: "a".repeat(64)
          }
        },
        warnings: []
      }
    })

    await expect(requestFullBackupExport()).resolves.toMatchObject({
      backup: { version: 3 },
      warnings: []
    })
    expect(sendMessage).toHaveBeenCalledWith({
      _tabplex: true,
      type: "backup-restore",
      action: "export"
    })
  })

  it("uses one fixed full-replacement import contract", async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      result: {
        summary: { importedWorkspaces: 3 },
        cleanupPending: false
      }
    })

    await expect(requestFullBackupImport('{"backup":true}')).resolves.toEqual({
      importedWorkspaces: 3,
      cleanupPending: false
    })
    expect(sendMessage).toHaveBeenCalledWith({
      _tabplex: true,
      type: "backup-restore",
      action: "restore",
      raw: '{"backup":true}',
      mode: "replace",
      includeSettings: true
    })
  })
})
