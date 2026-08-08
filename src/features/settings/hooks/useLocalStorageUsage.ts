import { useEffect, useState } from "react"

export type LocalStorageUsageState =
  | { status: "loading"; bytes: null }
  | { status: "ready"; bytes: number }
  | { status: "unavailable"; bytes: null }

type StorageChanges = {
  addListener: (
    listener: (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => void
  ) => void
  removeListener: (
    listener: (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => void
  ) => void
}

type LocalStorageArea = {
  getBytesInUse: (keys?: string | string[] | null) => Promise<number>
}

type ObserveLocalStorageUsageOptions = {
  storageArea: LocalStorageArea
  storageChanges: StorageChanges
  onStateChange: (state: LocalStorageUsageState) => void
}

export const observeLocalStorageUsage = ({
  storageArea,
  storageChanges,
  onStateChange
}: ObserveLocalStorageUsageOptions) => {
  let active = true

  const refresh = async () => {
    try {
      const bytes = await storageArea.getBytesInUse(null)
      if (!active) return
      if (!Number.isFinite(bytes)) {
        onStateChange({ status: "unavailable", bytes: null })
        return
      }
      onStateChange({
        status: "ready",
        bytes: Math.max(0, bytes)
      })
    } catch {
      if (!active) return
      onStateChange({ status: "unavailable", bytes: null })
    }
  }

  const handleStorageChange = (
    _changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName !== "local") return
    void refresh()
  }

  storageChanges.addListener(handleStorageChange)
  void refresh()

  return () => {
    active = false
    storageChanges.removeListener(handleStorageChange)
  }
}

export const useLocalStorageUsage = (): LocalStorageUsageState => {
  const [state, setState] = useState<LocalStorageUsageState>({
    status: "loading",
    bytes: null
  })

  useEffect(() => {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage?.local?.getBytesInUse ||
      !chrome.storage?.onChanged
    ) {
      setState({ status: "unavailable", bytes: null })
      return
    }

    return observeLocalStorageUsage({
      storageArea: chrome.storage.local,
      storageChanges: chrome.storage.onChanged,
      onStateChange: setState
    })
  }, [])

  return state
}
