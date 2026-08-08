type DisposeOptions = {
  flush?: boolean
}

export type DebouncedSaver<T> = {
  enqueue: (value: T) => void
  flush: () => Promise<void>
  cancel: () => void
  dispose: (options?: DisposeOptions) => Promise<void>
}

export const createDebouncedSaver = <T>(
  persist: (value: T) => Promise<void>,
  delayMs: number
): DebouncedSaver<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingValue: T | null = null
  let writeChain = Promise.resolve()

  const clearTimer = () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  const runPersist = async (value: T) => {
    writeChain = writeChain
      .catch(() => {
        // Keep chain alive after errors so later writes still execute.
      })
      .then(() => persist(value))
    await writeChain
  }

  const flushPending = async () => {
    clearTimer()
    while (pendingValue !== null) {
      const nextValue = pendingValue
      pendingValue = null
      await runPersist(nextValue)
    }
  }

  return {
    enqueue(value: T) {
      pendingValue = value
      clearTimer()
      timer = setTimeout(() => {
        void flushPending().catch(() => {
          // Caller handles persistence errors.
        })
      }, delayMs)
    },
    flush: flushPending,
    cancel() {
      clearTimer()
      pendingValue = null
    },
    async dispose(options?: DisposeOptions) {
      if (options?.flush === false) {
        clearTimer()
        pendingValue = null
        return
      }
      await flushPending()
    }
  }
}
