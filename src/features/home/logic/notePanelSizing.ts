export const DEFAULT_NOTE_PANEL_WIDTH = 360
export const MIN_NOTE_PANEL_WIDTH = 280
const MIN_TAB_PANEL_WIDTH = 360
const NOTE_RESIZE_HANDLE_WIDTH = 12
const NOTE_PANEL_KEYBOARD_STEP = 16
const NOTE_PANEL_KEYBOARD_LARGE_STEP = 40

export const getMaxNotePanelWidth = (gridWidth: number) =>
  Math.max(
    MIN_NOTE_PANEL_WIDTH,
    Math.round(gridWidth) - MIN_TAB_PANEL_WIDTH - NOTE_RESIZE_HANDLE_WIDTH
  )

export const clampNotePanelWidth = (width: number, maxWidth: number) =>
  Math.min(
    Math.max(MIN_NOTE_PANEL_WIDTH, Math.round(maxWidth)),
    Math.max(MIN_NOTE_PANEL_WIDTH, Math.round(width))
  )

export const resolveNotePanelKeyboardWidth = ({
  currentWidth,
  maxWidth,
  key,
  largeStep = false
}: {
  currentWidth: number
  maxWidth: number
  key: string
  largeStep?: boolean
}) => {
  const step = largeStep
    ? NOTE_PANEL_KEYBOARD_LARGE_STEP
    : NOTE_PANEL_KEYBOARD_STEP

  if (key === "ArrowLeft") {
    return clampNotePanelWidth(currentWidth + step, maxWidth)
  }
  if (key === "ArrowRight") {
    return clampNotePanelWidth(currentWidth - step, maxWidth)
  }
  if (key === "Home") return MIN_NOTE_PANEL_WIDTH
  if (key === "End") return Math.max(MIN_NOTE_PANEL_WIDTH, Math.round(maxWidth))
  return null
}
