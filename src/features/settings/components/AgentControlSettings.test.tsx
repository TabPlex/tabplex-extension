// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AgentControlSettings } from "./AgentControlSettings"

const mocks = vi.hoisted(() => ({
  copyToClipboard: vi.fn(async () => true)
}))
const sendMessage = vi.fn()

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock("~features/settings/utils/copyToClipboard", () => ({
  copyToClipboard: mocks.copyToClipboard
}))

vi.mock("~components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    />
  )
}))

describe("AgentControlSettings", () => {
  beforeEach(() => {
    sendMessage.mockResolvedValue({
      ok: true,
      result: { state: "connected" }
    })
    mocks.copyToClipboard.mockResolvedValue(true)
    globalThis.chrome = {
      runtime: {
        id: "b".repeat(32),
        sendMessage
      }
    } as unknown as typeof chrome
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("keeps only one enable switch and no pairing controls", async () => {
    const user = userEvent.setup()
    const onEnabledChange = vi.fn().mockResolvedValue(undefined)

    render(<AgentControlSettings enabled onEnabledChange={onEnabledChange} />)

    await waitFor(() =>
      expect(
        screen.getByText("settings.control.agentControl.status.connected")
      ).toBeTruthy()
    )
    expect(screen.getAllByRole("switch")).toHaveLength(1)
    expect(
      screen.queryByRole("button", {
        name: "settings.control.agentControl.connect"
      })
    ).toBeNull()

    await user.click(screen.getByRole("switch"))
    await waitFor(() => expect(onEnabledChange).toHaveBeenCalledWith(false))
  })

  it("copies a self-contained Agent instruction with the extension id", async () => {
    const user = userEvent.setup()

    render(
      <AgentControlSettings
        enabled={false}
        onEnabledChange={vi.fn().mockResolvedValue(undefined)}
      />
    )

    await user.click(
      screen.getByRole("button", {
        name: "settings.control.agentControl.copyInstructions"
      })
    )

    expect(mocks.copyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining(`--extension-id=${"b".repeat(32)}`)
    )
    expect(mocks.copyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining(
        "$HOME/Library/Application Support/TabPlex/NativeMessaging/tabplex-agent"
      )
    )
    expect(mocks.copyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining("tabplex-agent-control")
    )
    expect(
      screen.getByText("settings.control.agentControl.copied")
    ).toBeTruthy()
    expect(
      screen.getByText("settings.control.agentControl.status.disabled")
    ).toBeTruthy()
  })
})
