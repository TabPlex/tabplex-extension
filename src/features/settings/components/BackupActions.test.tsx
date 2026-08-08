// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BackupActions } from "./BackupActions"

const mocks = vi.hoisted(() => ({
  downloadFullBackup: vi.fn(),
  readFullBackupFile: vi.fn(async () => "backup-json"),
  requestFullBackupExport: vi.fn(),
  requestFullBackupImport: vi.fn(),
  toBackupErrorCode: vi.fn(() => "backup-restore-failed"),
  toastSuccess: vi.fn()
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock("~features/settings/logic/fullBackupActions", () => mocks)

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess }
}))

describe("BackupActions", () => {
  beforeEach(() => {
    mocks.requestFullBackupExport.mockResolvedValue({
      backup: {
        exportedAt: "2026-08-03T00:00:00.000Z",
        payload: { workspaces: [] }
      },
      warnings: []
    })
    mocks.requestFullBackupImport.mockResolvedValue({
      importedWorkspaces: 2,
      cleanupPending: false
    })
    vi.spyOn(window, "confirm").mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("exports directly without opening another settings surface", async () => {
    const user = userEvent.setup()
    const onBeforeAction = vi.fn().mockResolvedValue(undefined)
    render(<BackupActions onBeforeAction={onBeforeAction} />)

    await user.click(
      screen.getByRole("button", { name: "storage.backup.export" })
    )

    await waitFor(() => expect(mocks.downloadFullBackup).toHaveBeenCalled())
    expect(onBeforeAction).toHaveBeenCalledOnce()
    expect(mocks.requestFullBackupExport).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith("storage.backup.exported", {
      duration: 1800
    })
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("validates and confirms a file before the replacement import", async () => {
    const user = userEvent.setup()
    const onBeforeAction = vi.fn().mockResolvedValue(undefined)
    render(<BackupActions onBeforeAction={onBeforeAction} />)
    const input = screen.getByLabelText("storage.backup.import", {
      selector: "input"
    })

    await user.upload(
      input,
      new File(["{}"], "tabplex-backup.json", { type: "application/json" })
    )

    await waitFor(() =>
      expect(mocks.requestFullBackupImport).toHaveBeenCalledWith("backup-json")
    )
    expect(window.confirm).toHaveBeenCalledWith("storage.backup.importConfirm")
    expect(onBeforeAction).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith("storage.backup.restored", {
      duration: 1800
    })
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("keeps export failures visible next to the backup actions", async () => {
    mocks.requestFullBackupExport.mockRejectedValueOnce(new Error("failed"))
    const user = userEvent.setup()
    render(<BackupActions onBeforeAction={vi.fn()} />)

    await user.click(
      screen.getByRole("button", { name: "storage.backup.export" })
    )

    expect((await screen.findByRole("alert")).textContent).toBe(
      "settings.recoveryCenter.errors.backup-restore-failed"
    )
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })
})
