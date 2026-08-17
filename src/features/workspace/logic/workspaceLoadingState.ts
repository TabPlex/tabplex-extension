type WorkspaceTabWarmupJobLike = {
  runId?: unknown
  windowId?: unknown
  workspaceId?: unknown
  updatedAt?: unknown
}

export const isWorkspaceWindowLoading = (jobs: unknown, windowId: number) => {
  if (!jobs || typeof jobs !== "object" || Array.isArray(jobs)) return false

  const candidate = (jobs as Record<string, unknown>)[String(windowId)]
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return false
  }

  const job = candidate as WorkspaceTabWarmupJobLike
  return (
    job.windowId === windowId &&
    typeof job.runId === "string" &&
    job.runId.length > 0 &&
    typeof job.workspaceId === "string" &&
    job.workspaceId.length > 0 &&
    typeof job.updatedAt === "number" &&
    Number.isFinite(job.updatedAt)
  )
}
