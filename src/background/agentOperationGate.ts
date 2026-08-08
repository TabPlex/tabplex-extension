let agentOperationTail: Promise<void> = Promise.resolve()

/**
 * Serializes Native Messaging Agent work with destructive maintenance such as a
 * full backup restore. This lock never aborts a workspace switch by itself.
 */
export const withAgentOperationLock = <T>(
  task: () => Promise<T>
): Promise<T> => {
  const run = agentOperationTail.then(task)
  agentOperationTail = run.then(
    () => undefined,
    () => undefined
  )
  return run
}
