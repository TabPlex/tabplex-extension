type ExclusiveOperation<T> = {
  beforeDrain?: () => Promise<void>
  task: () => Promise<T>
}

type PendingNormalOperation<T> = {
  task: () => Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

/**
 * Normal workspace operations may overlap, while maintenance is exclusive.
 * Queuing maintenance synchronously closes admission before any async cleanup,
 * which removes the old check-then-run race.
 */
export const createWorkspaceOperationGate = () => {
  let activeNormalOperations = 0
  let pendingExclusiveOperations = 0
  let exclusiveTail: Promise<void> = Promise.resolve()
  const drainWaiters: Array<() => void> = []
  const pendingNormalOperations: Array<PendingNormalOperation<unknown>> = []

  const notifyDrained = () => {
    if (activeNormalOperations !== 0) return
    for (const resolve of drainWaiters.splice(0)) resolve()
  }

  const waitUntilDrained = () =>
    activeNormalOperations === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => drainWaiters.push(resolve))

  const executeNormal = <T>(task: () => Promise<T>): Promise<T> => {
    activeNormalOperations += 1
    let result: Promise<T>
    try {
      result = Promise.resolve(task())
    } catch (error) {
      result = Promise.reject(error)
    }
    return result.finally(() => {
      activeNormalOperations = Math.max(0, activeNormalOperations - 1)
      notifyDrained()
    })
  }

  const admitPendingNormalOperations = () => {
    while (
      pendingExclusiveOperations === 0 &&
      pendingNormalOperations.length > 0
    ) {
      const operation = pendingNormalOperations.shift()!
      void executeNormal(operation.task).then(
        operation.resolve,
        operation.reject
      )
    }
  }

  const runNormal = <T>(task: () => Promise<T>): Promise<T> => {
    if (pendingExclusiveOperations === 0) return executeNormal(task)
    return new Promise<T>((resolve, reject) => {
      pendingNormalOperations.push({
        task,
        resolve: resolve as PendingNormalOperation<unknown>["resolve"],
        reject
      })
    })
  }

  const runExclusive = <T>({
    beforeDrain,
    task
  }: ExclusiveOperation<T>): Promise<T> => {
    pendingExclusiveOperations += 1
    const run = exclusiveTail.then(async () => {
      await beforeDrain?.()
      await waitUntilDrained()
      return task()
    })
    exclusiveTail = run.then(
      () => undefined,
      () => undefined
    )
    return run.finally(() => {
      pendingExclusiveOperations = Math.max(0, pendingExclusiveOperations - 1)
      admitPendingNormalOperations()
    })
  }

  return { runNormal, runExclusive }
}

export const workspaceOperationGate = createWorkspaceOperationGate()
