import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Settings } from "~core/types"

import { applySettingsUpdate } from "./storageQueues"

const state = vi.hoisted(() => ({
  settings: {
    theme: "system",
    accentColor: "#6C5CE7",
    shortcuts: {},
    workspaceSort: "created",
    devMode: false,
    agentControlEnabled: false
  } as Settings
}))

vi.mock("~core/storage", () => ({
  loadSettings: vi.fn(async () => structuredClone(state.settings)),
  saveSettings: vi.fn(async (settings: Settings) => {
    state.settings = structuredClone(settings)
  }),
  loadWorkspaces: vi.fn(),
  loadWorkspaceState: vi.fn(),
  removeWorkspaceBindingsForWorkspace: vi.fn(),
  saveWorkspaces: vi.fn(),
  saveWorkspaceStatePatch: vi.fn()
}))

describe("settingsQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.settings = {
      theme: "system",
      accentColor: "#6C5CE7",
      shortcuts: {},
      workspaceSort: "created",
      devMode: false,
      agentControlEnabled: false
    }
  })

  it("serializes the complete settings read-modify-write transaction", async () => {
    await Promise.all([
      applySettingsUpdate(async (current) => {
        await Promise.resolve()
        return { ...current, devMode: true }
      }),
      applySettingsUpdate((current) => ({
        ...current,
        agentControlEnabled: true
      }))
    ])

    expect(state.settings).toMatchObject({
      devMode: true,
      agentControlEnabled: true
    })
  })
})
