import { useCallback, useEffect, useRef, useState } from "react"

import { createNoticeController, type HomeNotice } from "./notice"

type TimelineRestoreNotice = {
  restoredAt: number
  addedCount: number
  removedCount: number
}

export const useHomeNotice = () => {
  const [notice, setNotice] = useState<HomeNotice>(null)
  const controllerRef = useRef<ReturnType<
    typeof createNoticeController
  > | null>(null)

  if (!controllerRef.current) {
    controllerRef.current = createNoticeController({ ttlMs: 2500 })
  }

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    const unsubscribe = controller.subscribe(setNotice)
    return () => {
      unsubscribe()
      controller.dispose()
      controllerRef.current = null
    }
  }, [])

  const showWorkspaceTrashed = useCallback((name: string | null) => {
    controllerRef.current?.show({ kind: "workspace-trashed", name })
  }, [])

  const showTimelineRestore = useCallback((payload: TimelineRestoreNotice) => {
    controllerRef.current?.show({ kind: "timeline-restored", ...payload })
  }, [])

  return {
    notice,
    showWorkspaceTrashed,
    showTimelineRestore
  }
}
