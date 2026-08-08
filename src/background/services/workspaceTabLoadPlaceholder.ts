export const WORKSPACE_TAB_LOAD_PLACEHOLDER_URL =
  "about:blank#tabplex-workspace-loading"

export const isWorkspaceTabLoadPlaceholderUrl = (value?: string | null) =>
  value?.trim() === WORKSPACE_TAB_LOAD_PLACEHOLDER_URL
