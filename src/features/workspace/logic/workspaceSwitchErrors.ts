const SWITCH_IN_PROGRESS_ERROR = "workspace-switch-in-progress"
const TABS_STILL_LOADING_ERRORS = [
  "workspace-window-tabs-busy",
  "workspace-autosave-tabs-changed-during-capture"
] as const

const readErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }
  return ""
}

export const isWorkspaceSwitchInProgressError = (error: unknown) => {
  const message = readErrorMessage(error).trim()
  return (
    message === SWITCH_IN_PROGRESS_ERROR ||
    message.endsWith(`: ${SWITCH_IN_PROGRESS_ERROR}`)
  )
}

export const isWorkspaceSwitchTabsStillLoadingError = (error: unknown) => {
  const message = readErrorMessage(error).trim()
  return TABS_STILL_LOADING_ERRORS.some(
    (errorCode) => message === errorCode || message.endsWith(`: ${errorCode}`)
  )
}
