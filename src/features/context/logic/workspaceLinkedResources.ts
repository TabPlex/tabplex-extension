import type { WorkspaceLinkedResource } from "~core/types"
import { isSafeTabUrl, normalizeUrlForMatch } from "~core/utils"

export type AddLinkedResourceResult =
  | {
      kind: "added"
      resource: WorkspaceLinkedResource
      resources: WorkspaceLinkedResource[]
    }
  | {
      kind: "duplicate" | "invalid"
      resources: WorkspaceLinkedResource[]
    }

const PROVIDER_BY_HOST = [
  { hosts: ["notion.so", "notion.site"], provider: "Notion" },
  {
    hosts: ["docs.google.com", "drive.google.com"],
    provider: "Google Docs"
  },
  {
    hosts: ["calendar.google.com", "meet.google.com"],
    provider: "Google Calendar"
  },
  {
    hosts: ["feishu.cn", "larksuite.com", "larkoffice.com"],
    provider: "Feishu"
  },
  { hosts: ["linear.app"], provider: "Linear" },
  { hosts: ["atlassian.net", "jira.atlassian.com"], provider: "Jira" },
  { hosts: ["github.com"], provider: "GitHub" },
  { hosts: ["slack.com", "app.slack.com"], provider: "Slack" }
] as const

const normalizeLinkedResourceUrl = (inputUrl: string) => {
  const normalizedUrl = normalizeUrlForMatch(inputUrl)
  if (!normalizedUrl) return ""

  try {
    const parsed = new URL(normalizedUrl)
    parsed.hash = ""
    return parsed.toString()
  } catch {
    return ""
  }
}

const matchesHost = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`)

const resolveProvider = (host: string) => {
  const match = PROVIDER_BY_HOST.find((item) =>
    item.hosts.some((domain) => matchesHost(host, domain))
  )
  return match?.provider ?? "Link"
}

const prettifySegment = (segment: string) => {
  const withoutExtension = segment.replace(/\.[a-z0-9]+$/i, "")
  const withoutOpaqueId = withoutExtension.replace(/-[a-z0-9]{6,}$/i, "")
  return withoutOpaqueId.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
}

const resolveGoogleDocsTitle = (segments: string[]) => {
  if (segments.includes("document")) return "Google Doc"
  if (segments.includes("spreadsheets")) return "Google Sheet"
  if (segments.includes("presentation")) return "Google Slides"
  if (segments.includes("forms")) return "Google Form"
  return "Google Docs"
}

const resolveGoogleCalendarTitle = (host: string) => {
  if (host === "meet.google.com" || host.endsWith(".meet.google.com")) {
    return "Google Meet"
  }
  return "Google Calendar"
}

const resolveLinearTitle = (segments: string[]) => {
  const issueIndex = segments.findIndex((segment) => segment === "issue")
  if (issueIndex === -1) return null
  const issueKey = segments[issueIndex + 1]
  const slug = segments[issueIndex + 2]
  if (!issueKey) return null
  if (!slug) return issueKey.toUpperCase()
  return `${issueKey.toUpperCase()} · ${prettifySegment(decodeURIComponent(slug))}`
}

const resolveTitleFromUrl = (parsed: URL, provider: string) => {
  const host = parsed.host.toLowerCase()
  const segments = parsed.pathname.split("/").filter(Boolean)

  if (provider === "Google Docs") {
    return resolveGoogleDocsTitle(segments)
  }
  if (provider === "Google Calendar") {
    return resolveGoogleCalendarTitle(host)
  }
  if (provider === "Linear") {
    const linearTitle = resolveLinearTitle(segments)
    if (linearTitle) return linearTitle
  }

  const candidates = [...segments].reverse().filter((segment) => {
    const normalized = segment.toLowerCase()
    return (
      normalized !== "edit" && normalized !== "view" && normalized !== "preview"
    )
  })
  const lastSegment = candidates[0]
  if (!lastSegment) return provider

  const readable = prettifySegment(decodeURIComponent(lastSegment))
  return readable || provider
}

const createWorkspaceLinkedResource = (
  inputUrl: string,
  createdAt: number
): WorkspaceLinkedResource | null => {
  if (!isSafeTabUrl(inputUrl)) return null
  const normalizedUrl = normalizeLinkedResourceUrl(inputUrl)
  if (!normalizedUrl) return null

  let parsed: URL
  try {
    parsed = new URL(normalizedUrl)
  } catch {
    return null
  }

  const host = parsed.host.toLowerCase()
  const provider = resolveProvider(host)
  const title = resolveTitleFromUrl(parsed, provider)

  return {
    id: normalizedUrl,
    url: normalizedUrl,
    host,
    title,
    provider,
    createdAt
  }
}

export const addWorkspaceLinkedResource = (
  resources: WorkspaceLinkedResource[],
  inputUrl: string,
  createdAt = Date.now()
): AddLinkedResourceResult => {
  const resource = createWorkspaceLinkedResource(inputUrl, createdAt)
  if (!resource) {
    return { kind: "invalid", resources }
  }

  if (resources.some((item) => item.url === resource.url)) {
    return { kind: "duplicate", resources }
  }

  return {
    kind: "added",
    resource,
    resources: [resource, ...resources]
  }
}

export const removeWorkspaceLinkedResource = (
  resources: WorkspaceLinkedResource[],
  resourceId: string
) => {
  return resources.filter((item) => item.id !== resourceId)
}
