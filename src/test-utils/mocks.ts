export const createTestWorkspace = (overrides = {}) => ({
  id: "test-workspace-id",
  name: "Test Workspace",
  emoji: "🧪",
  color: "#3b82f6",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  tabs: [],
  tabsRevision: 0,
  history: [],
  ...overrides
})

export const createTestTabSpec = (overrides = {}) => ({
  url: "https://example.com",
  title: "Example",
  pinned: false,
  faviconUrl: "https://example.com/favicon.ico",
  ...overrides
})
