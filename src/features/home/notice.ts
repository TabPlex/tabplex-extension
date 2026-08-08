import { formatDate } from "~core/utils"

export type HomeNotice =
  | {
      kind: "workspace-trashed"
      name: string | null
    }
  | {
      kind: "timeline-restored"
      restoredAt: number
      addedCount: number
      removedCount: number
    }
  | null

type NoticeListener = (value: HomeNotice) => void
type NoticeTranslator = (
  key: string,
  options?: Record<string, string | number>
) => string

export const resolveNoticeLabel = ({
  notice,
  t,
  fallbackName
}: {
  notice: HomeNotice
  t: NoticeTranslator
  fallbackName: string
}) => {
  if (!notice) return null
  if (notice.kind === "workspace-trashed") {
    return t("home.notice.workspaceTrashed", {
      name: notice.name ?? fallbackName
    })
  }

  if (notice.kind === "timeline-restored") {
    return t("home.notice.timelineRestoredAt", {
      time: formatDate(notice.restoredAt)
    })
  }

  return null
}

export const resolveNoticeSubLabel = ({
  notice,
  t
}: {
  notice: HomeNotice
  t: NoticeTranslator
}) => {
  if (!notice) return null
  if (notice.kind === "timeline-restored") {
    return t("home.notice.timelineDiffSummary", {
      added: notice.addedCount,
      removed: notice.removedCount
    })
  }

  return null
}

export const createNoticeController = ({
  ttlMs = 2500
}: { ttlMs?: number } = {}) => {
  let timer: ReturnType<typeof setTimeout> | null = null
  let current: HomeNotice = null
  const listeners = new Set<NoticeListener>()

  const clearTimer = () => {
    if (!timer) return
    globalThis.clearTimeout(timer)
    timer = null
  }

  const notify = () => {
    listeners.forEach((listener) => listener(current))
  }

  return {
    show: (next: HomeNotice) => {
      current = next
      notify()
      clearTimer()
      if (next) {
        timer = globalThis.setTimeout(() => {
          current = null
          timer = null
          notify()
        }, ttlMs)
      }
    },
    clear: () => {
      current = null
      clearTimer()
      notify()
    },
    subscribe: (listener: NoticeListener) => {
      listeners.add(listener)
      listener(current)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {
      clearTimer()
      listeners.clear()
    }
  }
}
