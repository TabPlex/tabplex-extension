import { describe, expect, it, vi } from "vitest"

import { DEFAULT_SETTINGS } from "~core/types"

import { createSettingsApplyMessageHandler } from "./settingsApply"

const dispatch = async (
  message: Record<string, unknown>,
  updater = vi.fn(async (apply) => apply(DEFAULT_SETTINGS))
) => {
  const handler = createSettingsApplyMessageHandler(updater as any)
  let response: unknown
  const keepAlive = handler(
    { _tabplex: true, type: "settings-apply", ...message } as any,
    (value) => {
      response = value
    }
  )
  await vi.waitFor(() => expect(response).toBeDefined())
  return { keepAlive, response, updater }
}

describe("settingsApply handler", () => {
  it.each([
    ["theme", "dark"],
    ["language", "en-US"],
    ["accentColor", "#abcdef"],
    ["devMode", true],
    ["agentControlEnabled", true],
    ["workspaceSort", "created"]
  ])("serializes a validated %s update", async (key, value) => {
    const { keepAlive, response, updater } = await dispatch({ key, value })

    expect(keepAlive).toBe(true)
    expect(response).toMatchObject({ ok: true })
    const result = await updater.mock.calls[0][0](DEFAULT_SETTINGS)
    expect(result).toMatchObject({
      [key]: key === "accentColor" ? "#ABCDEF" : value
    })
  })

  it.each([
    ["theme", "auto"],
    ["language", "fr"],
    ["accentColor", "red"],
    ["tabRestoreMode", "soft"],
    ["agentControlEnabled", "true"],
    ["workspaceTabLoadConcurrency", 3],
    ["workspaceTabLoadConcurrency", "all"],
    ["switchMode", "replaceCurrentWindow"],
    ["unknown", true]
  ])("rejects an invalid %s update", async (key, value) => {
    const updater = vi.fn()
    const { response } = await dispatch({ key, value }, updater)

    expect(response).toEqual({ ok: false, error: "invalid-setting-update" })
    expect(updater).not.toHaveBeenCalled()
  })
})
