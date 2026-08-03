import { useState } from "react"

const initialSettingsVisibility = () => {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("panel") === "settings"
}

export const useHomeOverlayState = () => {
  const [showSettings, setShowSettings] = useState(initialSettingsVisibility)
  const [showTimeline, setShowTimeline] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [trashQuery, setTrashQuery] = useState("")

  return {
    state: {
      showSettings,
      showTimeline,
      showTrash,
      showCommandPalette,
      trashQuery
    },
    actions: {
      setShowSettings,
      setShowTimeline,
      setShowTrash,
      setShowCommandPalette,
      setTrashQuery
    }
  }
}
