import { STORAGE_KEYS, type OnboardingState } from "~core/types"
import { withAuxiliaryStorageWriteLock } from "~lib/storageQueues"

const ONBOARDING_VERSION = 1
const ONBOARDING_SEED_STALE_MS = 30_000

type OnboardingStore = {
  load: () => Promise<OnboardingState | null>
  save: (state: OnboardingState) => Promise<void>
}

type ClaimInput = {
  runId: string
  now: number
}

type CompleteInput = {
  runId: string
  autoWorkspaceId: string | null
  guideWorkspaceId: string | null
}

const isValidRunId = (runId: string) =>
  runId.trim().length > 0 && runId.length <= 128

const createSeedState = ({ runId, now }: ClaimInput): OnboardingState => ({
  version: ONBOARDING_VERSION,
  status: "seeding",
  dismissed: false,
  seededAt: now,
  seedRunId: runId,
  autoWorkspaceId: null,
  guideWorkspaceId: null
})

const canClaim = (
  state: OnboardingState | null,
  runId: string,
  now: number,
  staleMs: number
) => {
  if (!state) return true
  if (state.status !== "seeding") return false
  if (state.seedRunId === runId) return true
  const seededAt = state.seededAt ?? 0
  return seededAt > 0 && now - seededAt > staleMs
}

const createSerialQueue = () => {
  let queue = Promise.resolve()
  return <T>(task: () => Promise<T>) => {
    const run = queue.then(task)
    queue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}

export const createOnboardingCoordinator = (
  store: OnboardingStore,
  options: {
    staleMs?: number
    withWriteLock?: <T>(task: () => Promise<T>) => Promise<T>
  } = {}
) => {
  const enqueue = options.withWriteLock ?? createSerialQueue()
  const staleMs = options.staleMs ?? ONBOARDING_SEED_STALE_MS

  return {
    claim: (input: ClaimInput) =>
      enqueue(async () => {
        if (!isValidRunId(input.runId) || !Number.isFinite(input.now)) {
          throw new Error("invalid-onboarding-claim")
        }
        const current = await store.load()
        if (!canClaim(current, input.runId, input.now, staleMs)) {
          return { claimed: false, state: current }
        }
        const next = createSeedState(input)
        await store.save(next)
        return { claimed: true, state: next }
      }),
    complete: (input: CompleteInput) =>
      enqueue(async () => {
        if (!isValidRunId(input.runId)) {
          throw new Error("invalid-onboarding-complete")
        }
        const current = await store.load()
        if (
          current?.status !== "seeding" ||
          current.seedRunId !== input.runId
        ) {
          return { completed: false, state: current }
        }
        const next: OnboardingState = {
          ...current,
          status: "ready",
          seedRunId: null,
          autoWorkspaceId: input.autoWorkspaceId,
          guideWorkspaceId: input.guideWorkspaceId
        }
        await store.save(next)
        return { completed: true, state: next }
      }),
    markExistingUserReady: (now: number) =>
      enqueue(async () => {
        if (!Number.isFinite(now)) {
          throw new Error("invalid-onboarding-timestamp")
        }
        const current = await store.load()
        if (current) return { changed: false, state: current }
        const next: OnboardingState = {
          version: ONBOARDING_VERSION,
          status: "ready",
          dismissed: true,
          seededAt: now,
          seedRunId: null,
          autoWorkspaceId: null,
          guideWorkspaceId: null
        }
        await store.save(next)
        return { changed: true, state: next }
      }),
    dismiss: () =>
      enqueue(async () => {
        const current = await store.load()
        if (!current || current.dismissed) {
          return { changed: false, state: current }
        }
        const next = { ...current, dismissed: true }
        await store.save(next)
        return { changed: true, state: next }
      }),
    resetForDeveloper: (now: number) =>
      enqueue(async () => {
        if (!Number.isFinite(now)) {
          throw new Error("invalid-onboarding-timestamp")
        }
        const next: OnboardingState = {
          version: ONBOARDING_VERSION,
          status: "seeding",
          dismissed: false,
          seededAt: Math.max(1, now - staleMs - 1),
          seedRunId: null,
          autoWorkspaceId: null,
          guideWorkspaceId: null
        }
        await store.save(next)
        return { changed: true, state: next }
      })
  }
}

const chromeOnboardingStore: OnboardingStore = {
  load: async () => {
    const result = await chrome.storage.local.get(STORAGE_KEYS.ONBOARDING)
    return (result[STORAGE_KEYS.ONBOARDING] as OnboardingState) ?? null
  },
  save: async (state) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.ONBOARDING]: state })
  }
}

export const onboardingCoordinator = createOnboardingCoordinator(
  chromeOnboardingStore,
  { withWriteLock: withAuxiliaryStorageWriteLock }
)
