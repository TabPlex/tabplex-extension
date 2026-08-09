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
const requestPermission = vi.fn()
const removePermission = vi.fn()
const containsPermission = vi.fn()

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
    requestPermission.mockResolvedValue(true)
    removePermission.mockResolvedValue(true)
    containsPermission.mockResolvedValue(false)
    mocks.copyToClipboard.mockResolvedValue(true)
    globalThis.chrome = {
      permissions: {
        contains: containsPermission,
        remove: removePermission,
        request: requestPermission
      },
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
    expect(removePermission).toHaveBeenCalledWith({
      permissions: ["nativeMessaging"]
    })
  })

  it("keeps the setting off when Chrome permission is denied", async () => {
    const user = userEvent.setup()
    const onEnabledChange = vi.fn()
    requestPermission.mockResolvedValue(false)

    render(
      <AgentControlSettings enabled={false} onEnabledChange={onEnabledChange} />
    )

    await user.click(screen.getByRole("switch"))

    await waitFor(() =>
      expect(
        screen.getByText("settings.control.agentControl.permissionDenied")
      ).toBeTruthy()
    )
    expect(requestPermission).toHaveBeenCalledWith({
      permissions: ["nativeMessaging"]
    })
    expect(onEnabledChange).not.toHaveBeenCalled()
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
