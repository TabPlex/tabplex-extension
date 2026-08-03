import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { STORAGE_KEYS, type OnboardingState, type TabSpec } from "~core/types"
import { getCurrentWindowTabs, resolveTabUrl, uuid } from "~core/utils"
import { capturePortableTabGroups } from "~features/workspace/logic/portableTabGroups"
import { sanitizeTabSpecs } from "~features/workspace/logic/workspaceLogic"
import type { useWorkspaceManager } from "~hooks/useWorkspaceManager"
import { getNextIndexedName } from "~lib/common"

const ONBOARDING_SEED_STALE_MS = 30_000

const GUIDE_TABS: TabSpec[] = [
  { url: "https://www.notion.so" },
  { url: "https://trello.com" },
  { url: "https://calendar.google.com" },
  { url: "https://developer.mozilla.org" },
  { url: "https://news.ycombinator.com" }
]

type WorkspaceManager = ReturnType<typeof useWorkspaceManager>

export const shouldStartOnboardingSeed = ({
  state,
  localSeedRunId,
  now = Date.now(),
  staleMs = ONBOARDING_SEED_STALE_MS
}: {
  state: OnboardingState | null
  localSeedRunId: string | null
  now?: number
  staleMs?: number
}) => {
  if (!state) return true
  if (state.status !== "seeding") return false
  if (state.seedRunId && state.seedRunId === localSeedRunId) return false

  const seededAt = state.seededAt ?? 0
  return seededAt > 0 && now - seededAt > staleMs
}

type OnboardingTransitionResult = {
  claimed?: boolean
  completed?: boolean
  changed?: boolean
  state: OnboardingState | null
}

const requestOnboardingTransition = async (
  transition: Record<string, unknown>
) => {
  const response = await chrome.runtime.sendMessage({
    _tabplex: true,
    type: "onboarding-transition",
    ...transition
  })
  if (!response || response.ok !== true) {
    throw new Error(response?.error || "onboarding-transition failed")
  }
  return response.result as OnboardingTransitionResult
}

export const useOnboarding = (workspaceManager: WorkspaceManager) => {
  const { t } = useTranslation()
  const [state, setState] = useState<OnboardingState | null>(null)
  const [loaded, setLoaded] = useState(false)
  const seedRunIdRef = useRef<string | null>(null)
  const { hydrated, createWorkspace, setWorkspaceNote, workspaces } =
    workspaceManager

  useEffect(() => {
    let alive = true
    const run = async () => {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        if (!alive) return
        setLoaded(true)
        return
      }
      try {
        const result = await chrome.storage.local.get(STORAGE_KEYS.ONBOARDING)
        if (!alive) return
        setState((result[STORAGE_KEYS.ONBOARDING] as OnboardingState) ?? null)
      } catch (err) {
        console.warn("[TabPlex] Failed to load onboarding state", err)
      } finally {
        if (alive) setLoaded(true)
      }
    }
    void run()
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) {
      return () => {
        alive = false
      }
    }
    const handleChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area !== "local") return
      const next = changes[STORAGE_KEYS.ONBOARDING]?.newValue
      if (!alive || next === undefined) return
      setState(next as OnboardingState | null)
    }
    chrome.storage.onChanged.addListener(handleChange)
    return () => {
      alive = false
      try {
        chrome.storage.onChanged.removeListener(handleChange)
      } catch {}
    }
  }, [])

  useEffect(() => {
    let alive = true
    const seeded = !!state && state.status !== "seeding"
    if (!loaded || seeded) return
    if (typeof chrome === "undefined" || !chrome.storage?.local) return
    if (!hydrated) return
    if (!state && workspaces.length > 0) {
      void requestOnboardingTransition({
        action: "existing-user-ready",
        now: Date.now()
      })
        .then((result) => {
          if (alive && result.state) setState(result.state)
        })
        .catch((err) => {
          console.warn("[TabPlex] Failed to persist onboarding state", err)
        })
      return () => {
        alive = false
      }
    }
    if (
      !shouldStartOnboardingSeed({
        state,
        localSeedRunId: seedRunIdRef.current
      })
    ) {
      return
    }

    const seededAt = Date.now()
    const seedRunId = uuid()
    seedRunIdRef.current = seedRunId
    const seed = async () => {
      const claimResult = await requestOnboardingTransition({
        action: "claim",
        runId: seedRunId,
        now: seededAt
      })
      if (!claimResult.claimed) {
        if (alive && claimResult.state) setState(claimResult.state)
        return
      }
      if (alive && claimResult.state) setState(claimResult.state)

      let autoWorkspaceId: string | null = null
      let guideWorkspaceId: string | null = null

      try {
        const windowTabs = await getCurrentWindowTabs()
        const rawSpecs = windowTabs.map((t) => ({
          url: resolveTabUrl(t),
          pinned: t.pinned,
          title: t.title ?? "",
          faviconUrl: t.favIconUrl ?? ""
        }))
        const sanitized = await capturePortableTabGroups({
          liveTabs: windowTabs,
          liveSpecs: sanitizeTabSpecs(rawSpecs),
          previousTabs: []
        })
        if (sanitized.length) {
          const baseName = t("home.onboarding.autoWorkspace.name").trim()
          const existingNames = workspaces
            .map((workspace) => workspace.name)
            .filter((name): name is string => !!name && name.trim().length > 0)
          const hasExactBase = existingNames.some(
            (name) => name.trim() === baseName
          )
          const autoWorkspaceName = hasExactBase
            ? getNextIndexedName(existingNames, baseName)
            : baseName || t("home.onboarding.autoWorkspace.name")
          const autoWorkspace = await createWorkspace({
            name: autoWorkspaceName,
            tabs: sanitized,
            seedFromCurrentWindow: false,
            activate: false
          })
          autoWorkspaceId = autoWorkspace.workspace.id
        }

        const guideWorkspace = await createWorkspace({
          name: t("home.onboarding.guideWorkspace.name"),
          tabs: GUIDE_TABS,
          seedFromCurrentWindow: false,
          activate: false
        })
        guideWorkspaceId = guideWorkspace.workspace.id

        const guideNote = t("home.onboarding.guideWorkspace.note")
        if (guideNote.trim()) {
          await setWorkspaceNote(guideWorkspace.workspace.id, guideNote)
        }
      } catch (err) {
        console.warn("[TabPlex] Failed to seed onboarding data", err)
      }

      const completion = await requestOnboardingTransition({
        action: "complete",
        runId: seedRunId,
        autoWorkspaceId,
        guideWorkspaceId
      })
      if (!alive) return
      if (completion.state) setState(completion.state)
    }

    void seed().catch((err) => {
      console.warn("[TabPlex] Failed to coordinate onboarding seed", err)
    })
    return () => {
      alive = false
    }
  }, [
    createWorkspace,
    hydrated,
    loaded,
    setWorkspaceNote,
    state,
    t,
    workspaces.length
  ])

  const dismiss = useCallback(async () => {
    if (!state || state.dismissed) return
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const result = await requestOnboardingTransition({ action: "dismiss" })
        if (result.state) setState(result.state)
      }
    } catch (err) {
      console.warn("[TabPlex] Failed to persist onboarding dismiss", err)
    }
  }, [state])

  return {
    state,
    loaded,
    dismiss
  }
}
