#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs"
import { createConnection } from "node:net"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  AGENT_PROTOCOL_VERSION,
  getAgentConnectionPath,
  getAgentSocketDirectory,
  isExtensionId
} from "./agent-paths.mjs"

const COMMANDS = [
  "getState",
  "getWorkspace",
  "searchWorkspaces",
  "openHome",
  "openSettings",
  "openShortcuts",
  "createWorkspace",
  "switchWorkspace",
  "renameWorkspace",
  "setWorkspaceColor",
  "setWorkspaceEmoji",
  "trashWorkspace",
  "restoreWorkspace",
  "deleteWorkspace",
  "emptyTrash",
  "setWorkspaceNote",
  "openWorkspaceTab",
  "captureWorkspaceTabs",
  "setTabExcluded",
  "removeWorkspaceTabs",
  "moveWorkspaceTabs",
  "replaceWorkspaceTabs",
  "createWorkspaceSnapshot",
  "restoreWorkspaceSnapshot",
  "updateSetting"
]

const EXAMPLES = [
  "pnpm agent -- getState",
  'pnpm agent -- searchWorkspaces \'{"query":"research"}\'',
  'pnpm agent -- switchWorkspace \'{"workspaceId":"<id>"}\'',
  'pnpm agent -- createWorkspace \'{"name":"Research"}\'',
  'pnpm agent -- setWorkspaceNote \'{"workspaceId":"<id>","note":"Notes"}\'',
  "pnpm agent -- help"
]

const normalizeCliArgs = (args) => (args[0] === "--" ? args.slice(1) : args)

export const buildAgentRequest = (args) => {
  const normalizedArgs = normalizeCliArgs(args)
  const command = normalizedArgs[0]
  if (!COMMANDS.includes(command)) throw new Error("unknown-agent-command")

  const windowOption = normalizedArgs.find((arg) =>
    arg.startsWith("--window-id=")
  )
  const payloadArgument = normalizedArgs
    .slice(1)
    .find((arg) => !arg.startsWith("--"))
  let payload
  if (payloadArgument !== undefined) {
    try {
      payload = JSON.parse(payloadArgument)
    } catch {
      throw new Error("invalid-agent-payload-json")
    }
  }

  let windowId
  if (windowOption) {
    windowId = Number(windowOption.slice("--window-id=".length))
    if (!Number.isSafeInteger(windowId) || windowId < 0) {
      throw new Error("invalid-agent-window-id")
    }
  }

  return {
    _tabplexAgent: true,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    command,
    ...(payload === undefined ? {} : { payload }),
    ...(windowId === undefined ? {} : { windowId })
  }
}

const readConnection = () => {
  const path = getAgentConnectionPath()
  if (!existsSync(path)) throw new Error("agent-control-not-connected")
  const connection = JSON.parse(readFileSync(path, "utf8"))
  if (
    connection.protocolVersion !== AGENT_PROTOCOL_VERSION ||
    !isExtensionId(connection.extensionId) ||
    typeof connection.socketPath !== "string" ||
    dirname(resolve(connection.socketPath)) !==
      resolve(getAgentSocketDirectory())
  ) {
    throw new Error("invalid-agent-connection")
  }
  return connection
}

const sendRequest = (request) =>
  new Promise((resolveResponse, reject) => {
    const { socketPath } = readConnection()
    const socket = createConnection(socketPath)
    let output = ""
    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error("agent-request-timeout"))
    }, 130_000)

    socket.setEncoding("utf8")
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`))
    socket.on("data", (chunk) => {
      output += chunk
      if (Buffer.byteLength(output, "utf8") > 64 * 1024 * 1024) {
        socket.destroy(new Error("agent-response-too-large"))
      }
    })
    socket.on("end", () => {
      clearTimeout(timeout)
      try {
        resolveResponse(JSON.parse(output.trim()))
      } catch {
        reject(new Error("invalid-agent-response"))
      }
    })
    socket.on("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })

const printHelp = () => {
  process.stdout.write(
    [
      "TabPlex Native Messaging Agent CLI",
      "",
      "Usage: tabplex-agent <command> [payload-json] [--window-id=<id>]",
      "",
      `Commands: ${COMMANDS.join(", ")}`,
      "",
      "Examples:",
      ...EXAMPLES.map((example) => `  ${example}`),
      "",
      "Run getState first. Permanent delete and emptyTrash require confirm: true."
    ].join("\n") + "\n"
  )
}

export const runCli = async (args) => {
  const normalizedArgs = normalizeCliArgs(args)
  if (
    normalizedArgs.length === 0 ||
    normalizedArgs[0] === "help" ||
    normalizedArgs[0] === "--help"
  ) {
    printHelp()
    return 0
  }
  const response = await sendRequest(buildAgentRequest(normalizedArgs))
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`)
  return response?.ok === true ? 0 : 1
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
  runCli(process.argv.slice(2)).then(
    (exitCode) => {
      process.exitCode = exitCode
    },
    (error) => {
      process.stdout.write(
        `${JSON.stringify({ ok: false, error: error.message || "agent-cli-failed" })}\n`
      )
      process.exitCode = 1
    }
  )
}
