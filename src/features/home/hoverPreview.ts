export const createHoverPreviewController = ({
  getActiveId,
  setSelectedId,
  setFollowActive,
  releaseDelayMs = 80
}: {
  getActiveId: () => string | null
  setSelectedId: (id: string | null) => void
  setFollowActive: (next: boolean) => void
  releaseDelayMs?: number
}) => {
  let isSidebarHover = false
  let isDetailHover = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = () => {
    if (!timer) return
    globalThis.clearTimeout(timer)
    timer = null
  }

  const scheduleRelease = () => {
    clearTimer()
    timer = globalThis.setTimeout(() => {
      if (isSidebarHover || isDetailHover) return
      setSelectedId(getActiveId())
      setFollowActive(true)
    }, releaseDelayMs)
  }

  return {
    enterSidebar: (id: string) => {
      isSidebarHover = true
      clearTimer()
      setFollowActive(false)
      setSelectedId(id)
    },
    leaveSidebar: () => {
      isSidebarHover = false
      if (!isDetailHover) scheduleRelease()
    },
    enterDetail: () => {
      isDetailHover = true
      clearTimer()
    },
    leaveDetail: () => {
      isDetailHover = false
      if (!isSidebarHover) scheduleRelease()
    },
    cancel: () => {
      isSidebarHover = false
      isDetailHover = false
      clearTimer()
    },
    dispose: () => clearTimer()
  }
}
