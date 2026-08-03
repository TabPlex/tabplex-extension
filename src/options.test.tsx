import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import Options from "./options"

const sendMessage = vi.fn()

vi.mock("~components/AppErrorBoundary", () => ({
  AppErrorBoundary: ({ children }: { children: React.ReactNode }) => children
}))

vi.mock("~features/workspace/WorkspaceDataProvider", () => ({
  WorkspaceDataProvider: ({ children }: { children: React.ReactNode }) =>
    children
}))

vi.mock("~features/settings/components/SettingsPage", () => ({
  SettingsPage: () => <main data-settings-page="true">Settings</main>
}))

describe("Options entry", () => {
  beforeEach(() => {
    sendMessage.mockReset()
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    globalThis.chrome = {
      runtime: { sendMessage }
    } as unknown as typeof chrome
  })

  it("renders the independent settings page without opening or switching Home", () => {
    const html = renderToStaticMarkup(<Options />)

    expect(html).toContain('data-settings-page="true"')
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
