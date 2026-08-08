import { describe, expect, it, vi } from "vitest"

import { runBackupRestoreCleanupAlarm } from "./backupRestoreCleanup"

const dependencies = () => ({
  readPhase: vi.fn(async () => null),
  recoverCommitted: vi.fn(async () => undefined),
  recoverUncommitted: vi.fn(async () => undefined),
  clearAlarm: vi.fn(async () => true),
  scheduleRetry: vi.fn()
})

describe("runBackupRestoreCleanupAlarm", () => {
  it("clears a stale alarm without entering recovery when no journal exists", async () => {
    const deps = dependencies()

    await expect(runBackupRestoreCleanupAlarm(deps)).resolves.toBe("no-journal")
    expect(deps.recoverCommitted).not.toHaveBeenCalled()
    expect(deps.recoverUncommitted).not.toHaveBeenCalled()
    expect(deps.clearAlarm).toHaveBeenCalledOnce()
  })

  it("cleans a committed journal without uncommitted recovery", async () => {
    const deps = dependencies()
    deps.readPhase.mockResolvedValue("committed")

    await expect(runBackupRestoreCleanupAlarm(deps)).resolves.toBe("cleaned")
    expect(deps.recoverCommitted).toHaveBeenCalledOnce()
    expect(deps.recoverUncommitted).not.toHaveBeenCalled()
  })

  it("reschedules after cleanup failure", async () => {
    const deps = dependencies()
    deps.readPhase.mockResolvedValue("written")
    deps.recoverUncommitted.mockRejectedValue(new Error("cleanup-failed"))

    await expect(runBackupRestoreCleanupAlarm(deps)).rejects.toThrow(
      "cleanup-failed"
    )
    expect(deps.scheduleRetry).toHaveBeenCalledOnce()
    expect(deps.clearAlarm).not.toHaveBeenCalled()
  })
})
