import workspaceLoadingAssetUrl from "url:~assets/workspace-loading.html"

const getBundledAssetFilename = (assetUrl: string) => {
  const path = assetUrl.split(/[?#]/, 1)[0]
  return path.split("/").filter(Boolean).at(-1) ?? ""
}

export const WORKSPACE_TAB_LOAD_PLACEHOLDER_PATH = getBundledAssetFilename(
  workspaceLoadingAssetUrl
)

export const resolveWorkspaceTabLoadPlaceholderUrl = (
  assetUrl: string,
  getExtensionUrl: (path: string) => string
) =>
  assetUrl.startsWith("chrome-extension://")
    ? assetUrl
    : getExtensionUrl(getBundledAssetFilename(assetUrl))

export const getWorkspaceTabLoadPlaceholderUrl = () =>
  resolveWorkspaceTabLoadPlaceholderUrl(
    WORKSPACE_TAB_LOAD_PLACEHOLDER_PATH,
    chrome.runtime.getURL
  )

export const isWorkspaceTabLoadPlaceholderUrl = (value?: string | null) =>
  value?.trim() === getWorkspaceTabLoadPlaceholderUrl()
