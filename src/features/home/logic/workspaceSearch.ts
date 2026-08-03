import type { Workspace, WorkspaceState } from "~core/types"

type WorkspaceSearchMatchKind = "workspace" | "tab" | "note"

export type WorkspaceSearchMatch = {
  workspaceId: string
  kind: WorkspaceSearchMatchKind
  label: string
  url?: string
  score: number
}

type SearchField = {
  kind: WorkspaceSearchMatchKind
  label: string
  url?: string
  searchText: string
  weight: number
}

type SearchContext = Pick<WorkspaceState, "notes">

const MAX_QUERY_LENGTH = 256
const MAX_HINT_LENGTH = 96

const normalizeSearchText = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim()

const safeUrlSearchText = (url: string) => {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname} ${parsed.pathname} ${parsed.search}`
  } catch {
    return url
  }
}

const compactLabel = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= MAX_HINT_LENGTH) return normalized
  return `${normalized.slice(0, MAX_HINT_LENGTH - 1)}…`
}

const tabFields = (workspace: Workspace): SearchField[] =>
  (workspace.tabs ?? []).map((tab) => ({
    kind: "tab",
    label: compactLabel(tab.title?.trim() || safeUrlSearchText(tab.url)),
    url: tab.url,
    searchText: normalizeSearchText(
      `${tab.title ?? ""} ${safeUrlSearchText(tab.url)}`
    ),
    weight: 70
  }))

const noteField = (note: string | undefined): SearchField[] => {
  if (!note?.trim()) return []
  return [
    {
      kind: "note",
      label: "",
      searchText: normalizeSearchText(note),
      weight: 40
    }
  ]
}

const fieldsForWorkspace = (
  workspace: Workspace,
  context: SearchContext
): SearchField[] => [
  {
    kind: "workspace",
    label: workspace.name,
    searchText: normalizeSearchText(workspace.name),
    weight: 100
  },
  ...tabFields(workspace),
  ...noteField(context.notes?.[workspace.id])
]

const scoreField = (field: SearchField, tokens: string[]) => {
  if (!tokens.every((token) => field.searchText.includes(token))) return 0
  const startsWithBonus = field.searchText.startsWith(tokens[0]) ? 20 : 0
  return field.weight + startsWithBonus
}

const matchWorkspace = (
  workspace: Workspace,
  tokens: string[],
  queryLabel: string,
  context: SearchContext
): WorkspaceSearchMatch | null => {
  const fields = fieldsForWorkspace(workspace, context)
  const aggregate = fields.map((field) => field.searchText).join(" ")
  if (!tokens.every((token) => aggregate.includes(token))) return null

  const ranked = fields
    .map((field) => ({ field, score: scoreField(field, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
  const best =
    ranked[0]?.field ??
    fields.find((field) =>
      tokens.some((token) => field.searchText.includes(token))
    )
  if (!best) return null

  return {
    workspaceId: workspace.id,
    kind: best.kind,
    label: best.kind === "note" ? queryLabel : best.label,
    url: best.url,
    score: ranked[0]?.score ?? 10
  }
}

export const searchWorkspaces = (
  workspaces: Workspace[],
  query: string,
  context: SearchContext = {},
  options: { maxResults?: number } = {}
) => {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery || normalizedQuery.length > MAX_QUERY_LENGTH) return []
  const tokens = normalizedQuery.split(" ").filter(Boolean)
  const maxResults = Math.max(1, options.maxResults ?? workspaces.length)

  return workspaces
    .map((workspace, originalIndex) => ({
      originalIndex,
      match: matchWorkspace(workspace, tokens, normalizedQuery, context)
    }))
    .filter(
      (
        entry
      ): entry is {
        originalIndex: number
        match: WorkspaceSearchMatch
      } => !!entry.match
    )
    .sort(
      (left, right) =>
        right.match.score - left.match.score ||
        left.originalIndex - right.originalIndex
    )
    .slice(0, maxResults)
    .map((entry) => entry.match)
}
