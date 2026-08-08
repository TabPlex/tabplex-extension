type RequestSettingsDialogCloseOptions = {
  flushPendingChanges: () => Promise<void>
  close: () => void
  onFlushError: (error: unknown) => void
}

export const requestSettingsDialogClose = async ({
  flushPendingChanges,
  close,
  onFlushError
}: RequestSettingsDialogCloseOptions) => {
  try {
    await flushPendingChanges()
    close()
    return true
  } catch (error) {
    onFlushError(error)
    return false
  }
}
