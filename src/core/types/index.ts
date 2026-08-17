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

export type TabSpec = {
  url: string
  pinned?: boolean
  title?: string
  faviconUrl?: string
  lastAccessedAt?: number
  excluded?: boolean
  group?: PortableTabGroup
}

export type WorkspaceSnapshot = {
  id: string
  createdAt: number
  tabs: TabSpec[]
}

export type WorkspaceSwitchSnapshot = {
  id: string
  tabs: TabSpec[]
  updatedAt?: number
  lastUsedAt?: number
}

export type WorkspaceLinkedResource = {
  id: string
  url: string
  host: string
  title: string
  provider: string
  createdAt: number
}

export type Workspace = {
  id: string
  name: string
  color?: string | null
  emoji?: string
  createdAt: number
  lastUsedAt?: number
  updatedAt?: number
  tabs: TabSpec[]
  /** 仅在标签集合发生变化时递增，用于阻止多窗口旧副本覆盖新数据。 */
  tabsRevision?: number
  history?: WorkspaceSnapshot[]
  trashedAt?: number | null
}

export type WorkspaceWindowBinding = {
  workspaceId: string
  tabsRevision: number
  stale?: boolean
  updatedAt: number
}

export type WorkspaceWindowBindingMap = Record<string, WorkspaceWindowBinding>

export type OnboardingState = {
  version: number
  status: "seeding" | "ready"
  dismissed?: boolean
  seededAt?: number
  seedRunId?: string | null
  autoWorkspaceId?: string | null
  guideWorkspaceId?: string | null
}

export const DEFAULT_WORKSPACE_EMOJIS = Object.freeze([
  "🗂️",
  "🗃️",
  "🗂",
  "🗄️",
  "📁",
  "📂",
  "🗃",
  "📦",
  "🗳️",
  "🧳",
  "📝",
  "✏️",
  "🖊️",
  "🖋️",
  "🖍️",
  "🖌️",
  "📒",
  "📓",
  "📔",
  "📕",
  "📗",
  "📘",
  "📙",
  "📚",
  "📖",
  "🗒️",
  "🗓️",
  "📅",
  "📆",
  "🧠",
  "🧩",
  "🧪",
  "🧬",
  "🛠️",
  "⚙️",
  "💡",
  "💼",
  "🧰",
  "🗺️",
  "🧭",
  "🎯",
  "🚀",
  "🛰️",
  "🖥️",
  "💻",
  "🖱️",
  "⌨️",
  "📌",
  "📎",
  "🖇️",
  "🔖",
  "🪄",
  "📈",
  "📊",
  "📉",
  "⭐",
  "🌟",
  "✨",
  "🔥",
  "🌈",
  "🎧",
  "🎵",
  "🛎️",
  "📣",
  "🔔",
  "🪙",
  "🏷️",
  "🏁",
  "🔐"
])

export const FALLBACK_WORKSPACE_EMOJI = DEFAULT_WORKSPACE_EMOJIS[0]

export const MIN_WORKSPACE_TAB_LOAD_CONCURRENCY = 1
export const MAX_WORKSPACE_TAB_LOAD_CONCURRENCY = 10

export type WorkspaceTabLoadConcurrency = number | "all"

export const isWorkspaceTabLoadConcurrency = (
  value: unknown
): value is WorkspaceTabLoadConcurrency =>
  value === "all" ||
  (typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= MIN_WORKSPACE_TAB_LOAD_CONCURRENCY &&
    value <= MAX_WORKSPACE_TAB_LOAD_CONCURRENCY)

export type Settings = {
  devMode?: boolean
  agentControlEnabled?: boolean
  theme: "dark" | "light" | "system"
  language?: "zh-CN" | "en-US"
  accentColor?: string
  shortcuts?: {
    goHome?: string
    newWorkspace?: string
    prevWorkspace?: string
    nextWorkspace?: string
  }
  workspaceSort?: "lastUsed" | "created"
}

export type WorkspaceState = {
  /**
   * 仅作为旧数据兼容字段。UI 会用当前 Chrome 窗口的 session binding
   * 覆盖它；后台不得再把它当成全局窗口所有权。
   */
  activeWorkspaceId?: string | null
  notes?: Record<string, string>
  notePreview?: Record<string, boolean>
  linkedResources?: Record<string, WorkspaceLinkedResource[]>
  switchState?: {
    runId: string
    targetId: string
    sourceId: string | null
    windowId: number
    sourceTabsRevision?: number
    ts: number
    phase?:
      | "preparing"
      | "opening"
      | "committing"
      | "loading"
      | "recovering"
      | "recovery_failed"
      | "done"
      | "aborted"
    expectedCount?: number
    openedCount?: number
    completedCount?: number
    failedCount?: number
    updatedAt?: number
    sourceSnapshot?: WorkspaceSwitchSnapshot
    recoveryAttempts?: number
    recoveryError?: string
  } | null
}

export const STORAGE_KEYS = {
  WORKSPACES: "workspaces",
  // Legacy key (migrated to WORKSPACES)
  TAGS: "tags",
  SETTINGS: "settings",
  LOCAL_SETTINGS: "localSettings",
  STATE: "runtimeState",
  SWITCH_STATE: "switchState",
  WINDOW_BINDINGS: "workspaceWindowBindings",
  WORKSPACE_TAB_WARMUP_JOBS: "workspaceTabWarmupJobs",
  PENDING_ACTION: "pendingAction",
  ONBOARDING: "onboarding",
  LOGS: "logs"
} as const

export const DEFAULT_ACCENT_COLOR = "#0EA5E9"

export const DEFAULT_SETTINGS: Settings = {
  devMode: false,
  agentControlEnabled: false,
  theme: "system",
  accentColor: DEFAULT_ACCENT_COLOR,
  shortcuts: {
    goHome: "Alt+H",
    newWorkspace: "Alt+N",
    prevWorkspace: "Alt+Up",
    nextWorkspace: "Alt+Down"
  },
  workspaceSort: "created"
}

export const ACCENT_PRESET_COLORS = Object.freeze([
  "#8B5CF6",
  "#6366F1",
  "#2563EB",
  "#0EA5E9",
  "#14B8A6",
  "#22C55E",
  "#F59E0B",
  "#F43F5E"
])

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  activeWorkspaceId: null,
  notes: {},
  notePreview: {},
  linkedResources: {},
  switchState: null
}

export const COMMAND_SHORTCUT_MAP = {
  goHome: "open-quick-switcher",
  newWorkspace: "open-quick-create",
  prevWorkspace: "switch-workspace-prev",
  nextWorkspace: "switch-workspace-next"
} as const
