import { useCallback, useEffect, useRef, useState } from "react"

import {
  clampNotePanelWidth,
  DEFAULT_NOTE_PANEL_WIDTH,
  getMaxNotePanelWidth
} from "~features/home/logic/notePanelSizing"

const NOTE_PANEL_WIDTH_KEY = "tabplex.notePanelWidth.v2"

export const useNotePanel = () => {
  const [notePanelWidth, setNotePanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_NOTE_PANEL_WIDTH
    const stored = window.localStorage.getItem(NOTE_PANEL_WIDTH_KEY)
    const parsed = stored ? Number.parseInt(stored, 10) : Number.NaN
    return Number.isFinite(parsed) ? parsed : DEFAULT_NOTE_PANEL_WIDTH
  })

  const [notePanelMaxWidth, setNotePanelMaxWidth] = useState(
    DEFAULT_NOTE_PANEL_WIDTH
  )

  const workspaceGridRef = useRef<HTMLDivElement | null>(null)
  const noteCardRef = useRef<HTMLElement | null>(null)
  const noteResizeRef = useRef<{
    startX: number
    startWidth: number
    gridWidth: number
  } | null>(null)
  const noteResizingRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(
      NOTE_PANEL_WIDTH_KEY,
      String(Math.round(notePanelWidth))
    )
  }, [notePanelWidth])

  useEffect(() => {
    const grid = workspaceGridRef.current
    if (!grid) return

    const updateBounds = () => {
      const gridWidth = grid.getBoundingClientRect().width
      if (!Number.isFinite(gridWidth) || gridWidth <= 0) return
      const nextMaxWidth = getMaxNotePanelWidth(gridWidth)
      setNotePanelMaxWidth(nextMaxWidth)
      setNotePanelWidth((currentWidth) =>
        clampNotePanelWidth(currentWidth, nextMaxWidth)
      )
    }

    updateBounds()
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(updateBounds)
        : null
    observer?.observe(grid)
    window.addEventListener("resize", updateBounds)

    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", updateBounds)
    }
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (!noteResizingRef.current) return
      const snapshot = noteResizeRef.current
      const grid = workspaceGridRef.current
      if (!snapshot || !grid) return
      const delta = event.clientX - snapshot.startX
      const desired = snapshot.startWidth - delta
      const maxWidth = getMaxNotePanelWidth(snapshot.gridWidth)
      const nextWidth = clampNotePanelWidth(desired, maxWidth)
      setNotePanelWidth(nextWidth)
    }

    const handlePointerUp = () => {
      if (!noteResizingRef.current) return
      noteResizingRef.current = false
      noteResizeRef.current = null
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [])

  const handleNoteResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      const grid = workspaceGridRef.current
      const noteCard = noteCardRef.current
      if (!grid || !noteCard) return
      const gridRect = grid.getBoundingClientRect()
      const noteRect = noteCard.getBoundingClientRect()
      noteResizingRef.current = true
      noteResizeRef.current = {
        startX: event.clientX,
        startWidth: noteRect.width,
        gridWidth: gridRect.width
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    },
    []
  )

  return {
    notePanelWidth,
    notePanelMaxWidth,
    setNotePanelWidth,
    workspaceGridRef,
    noteCardRef,
    handleNoteResizeStart
  }
}
