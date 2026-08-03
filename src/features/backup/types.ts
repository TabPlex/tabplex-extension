import type { Settings, Workspace, WorkspaceState } from "~core/types"

export type PortableTabGroup = {
  key: string
  title?: string
  color?:
    | "grey"
    | "blue"
    | "red"
    | "yellow"
    | "green"
    | "pink"
    | "purple"
    | "cyan"
    | "orange"
  collapsed?: boolean
}

export type PortableTab = {
  url: string
  pinned: boolean
  title: string | null
  faviconUrl: null
  lastAccessedAt: number | null
  excluded: boolean
  group?: PortableTabGroup
}

export type PortableSnapshot = {
  kind: "flat-v1"
  id: string
  createdAt: number
  tabs: PortableTab[]
}

export type PortableWorkspace = {
  id: string
  name: string
  color: string | null
  emoji: string | null
  createdAt: number
  updatedAt: number | null
  lastUsedAt: number | null
  trashedAt: number | null
  tabs: PortableTab[]
  history: PortableSnapshot[]
}

export type PortableLinkedResource = {
  id: string
  url: string
  host: string
  title: string
  provider: string
  createdAt: number
}

export type PortableWorkspaceContext = {
  workspaceId: string
  note: string
  linkedResources: PortableLinkedResource[]
}

export type PortableSettings = {
  language: "zh-CN" | "en-US" | null
  theme: "dark" | "light" | "system"
  accentColor: string
  tabRestoreMode: "aggressive"
  workspaceSort: "lastUsed" | "created"
}

export type BackupPayloadV3 = {
  workspaces: PortableWorkspace[]
  workspaceContexts: PortableWorkspaceContext[]
  settings: PortableSettings
}

export type TabPlexBackupV3 = {
  schema: "tabplex-backup"
  version: 3
  exportedAt: string
  source: {
    extensionVersion: string
  }
  payload: BackupPayloadV3
  integrity: {
    algorithm: "SHA-256"
    canonicalization: "tabplex-c14n-v1"
    digest: string
  }
}

export type BackupWarningCode =
  | "legacy-window-slots-flattened"
  | "legacy-v1-unverified"
  | "legacy-v1-missing-contexts"
  | "invalid-tab-dropped"
  | "invalid-resource-dropped"
  | "duplicate-resource-dropped"
  | "orphan-context-dropped"

export type BackupWarning = {
  code: BackupWarningCode
  path: string
  message: string
}

export type BackupSourceData = {
  workspaces: Workspace[]
  workspaceState: WorkspaceState
  settings: Settings
}

export type BackupMetadata = {
  exportedAt?: string
  extensionVersion: string
}

export type ParsedBackup = {
  sourceVersion: 1 | 2 | 3
  exportedAt: string
  source: { extensionVersion: string } | null
  integrity: "checksum-verified" | "legacy-unverified"
  payload: BackupPayloadV3
  warnings: BackupWarning[]
}
