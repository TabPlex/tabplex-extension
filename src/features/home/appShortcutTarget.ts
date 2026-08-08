export type AppShortcutWindow = Pick<chrome.windows.Window, "id" | "type">

export const isAppShortcutTargetWindow = (
  targetWindowId: unknown,
  currentWindow: AppShortcutWindow
) => {
  if (targetWindowId === undefined) return true
  return (
    Number.isSafeInteger(targetWindowId) &&
    targetWindowId === currentWindow.id &&
    currentWindow.type === "normal"
  )
}
