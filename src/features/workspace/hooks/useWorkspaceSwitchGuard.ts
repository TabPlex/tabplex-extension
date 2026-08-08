import { useCallback, useRef, useState } from "react"

export const useWorkspaceSwitchGuard = (externallyLocked: boolean) => {
  const pendingRef = useRef(false)
  const exclusivePendingRef = useRef(false)
  const latestIntentRef = useRef(0)
  const [pending, setPending] = useState(false)

  const isLockedNow = useCallback(
    () => externallyLocked || pendingRef.current,
    [externallyLocked]
  )

  const acquire = useCallback(() => {
    if (externallyLocked || pendingRef.current) return false
    pendingRef.current = true
    exclusivePendingRef.current = true
    setPending(true)
    return true
  }, [externallyLocked])

  const release = useCallback(() => {
    latestIntentRef.current += 1
    pendingRef.current = false
    exclusivePendingRef.current = false
    setPending(false)
  }, [])

  const acquireLatest = useCallback(() => {
    if (exclusivePendingRef.current) return null
    const intent = latestIntentRef.current + 1
    latestIntentRef.current = intent
    pendingRef.current = true
    setPending(true)
    return intent
  }, [])

  const isLatest = useCallback(
    (intent: number) => latestIntentRef.current === intent,
    []
  )

  const releaseLatest = useCallback((intent: number) => {
    if (latestIntentRef.current !== intent) return false
    pendingRef.current = false
    setPending(false)
    return true
  }, [])

  return {
    isLocked: externallyLocked || pending,
    isLockedNow,
    acquire,
    release,
    acquireLatest,
    isLatest,
    releaseLatest
  }
}
