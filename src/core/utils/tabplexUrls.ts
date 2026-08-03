const DEFAULT_TABPLEX_WEBSITE_BASE_URL = "https://www.tabplex.com"
const DEFAULT_TABPLEX_WEB_APP_BASE_URL = "https://tabplex.com"

const normalizeBaseUrl = (rawBaseUrl: unknown) =>
  String(rawBaseUrl || "")
    .trim()
    .replace(/\/+$/, "")

const normalizePath = (rawPath: string) => {
  const trimmedPath = String(rawPath || "").trim()
  if (!trimmedPath) return "/"
  if (trimmedPath.startsWith("/")) return trimmedPath
  return `/${trimmedPath}`
}

const isChineseLanguage = (language?: string | null) =>
  String(language || "")
    .trim()
    .toLowerCase()
    .startsWith("zh")

export const getTabplexWebsiteUrl = (language?: string | null) => {
  if (isChineseLanguage(language)) {
    return `${DEFAULT_TABPLEX_WEBSITE_BASE_URL}/zh`
  }
  return `${DEFAULT_TABPLEX_WEBSITE_BASE_URL}/`
}

export const resolveTabplexWebAppBaseUrl = (
  baseUrl?: string | null,
  envBaseUrl: string | null | undefined = process.env.PLASMO_PUBLIC_WEB_APP_URL
) => {
  const explicitBaseUrl = normalizeBaseUrl(baseUrl)
  if (explicitBaseUrl) {
    return explicitBaseUrl
  }

  const fallbackBaseUrl = normalizeBaseUrl(envBaseUrl)
  if (fallbackBaseUrl) {
    return fallbackBaseUrl
  }

  return DEFAULT_TABPLEX_WEB_APP_BASE_URL
}

export const buildTabplexWebAppUrl = (
  path: string,
  options?: {
    baseUrl?: string | null
    envBaseUrl?: string | null
  }
) => {
  const baseUrl = resolveTabplexWebAppBaseUrl(
    options?.baseUrl,
    options?.envBaseUrl
  )
  const normalizedPath = normalizePath(path)
  return `${baseUrl}${normalizedPath}`
}
