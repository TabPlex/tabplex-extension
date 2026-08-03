#!/usr/bin/env node
import { randomUUID } from "node:crypto"
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { createConnection, createServer } from "node:net"
import { dirname } from "node:path"

import {
  AGENT_PROTOCOL_VERSION,
  getAgentConnectionPath,
  getAgentSocketPath,
  getAgentStateDirectory,
  isExtensionId
} from "./agent-paths.mjs"
import {
  createNativeMessageDecoder,
  encodeNativeMessage
} from "./native-framing.mjs"

const MAX_SOCKET_REQUEST_BYTES = 1024 * 1024
const REQUEST_TIMEOUT_MS = 120_000
const origin = process.argv[2] ?? ""
const originMatch = /^chrome-extension:\/\/([a-p]{32})\/$/.exec(origin)

if (!originMatch || !isExtensionId(originMatch[1])) {
  process.stderr.write("[TabPlex] Native Host 收到无效扩展来源。\n")
  process.exit(1)
}

const extensionId = originMatch[1]
const stateDirectory = getAgentStateDirectory()
const connectionPath = getAgentConnectionPath()
const socketPath = getAgentSocketPath(extensionId)
const socketDirectory = dirname(socketPath)
const pendingClients = new Map()
let shuttingDown = false

const writeNativeMessage = (message) => {
  process.stdout.write(encodeNativeMessage(message))
}

const sendSocketResponse = (socket, response) => {
  if (socket.destroyed) return
  socket.end(`${JSON.stringify(response)}\n`)
}

const removeOwnedPath = (path, predicate) => {
  if (!existsSync(path)) return
  try {
    if (predicate(lstatSync(path))) rmSync(path)
  } catch {
    // Shutdown cleanup is best-effort.
  }
}

const ensurePrivateDirectory = (path) => {
  if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 })
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("agent-private-path-is-not-a-directory")
  }
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new Error("agent-private-path-owner-mismatch")
  }
  chmodSync(path, 0o700)
}

const cleanupFiles = () => {
  removeOwnedPath(socketPath, (stat) => stat.isSocket())
  if (!existsSync(connectionPath)) return
  try {
    const connection = JSON.parse(readFileSync(connectionPath, "utf8"))
    if (connection.pid === process.pid) rmSync(connectionPath)
  } catch {
    // Never delete an unreadable file that might belong to another process.
  }
}

const failPendingClients = (error) => {
  for (const pending of pendingClients.values()) {
    clearTimeout(pending.timeout)
    sendSocketResponse(pending.socket, { ok: false, error })
  }
  pendingClients.clear()
}

const server = createServer((socket) => {
  socket.setEncoding("utf8")
  let input = ""
  let accepted = false

  const reject = (error) => {
    if (accepted) return
    accepted = true
    sendSocketResponse(socket, { ok: false, error })
  }

  socket.on("data", (chunk) => {
    if (accepted) return
    input += chunk
    if (Buffer.byteLength(input, "utf8") > MAX_SOCKET_REQUEST_BYTES) {
      reject("agent-request-too-large")
      return
    }
    const lineEnd = input.indexOf("\n")
    if (lineEnd < 0) return

    accepted = true
    let request
    try {
      request = JSON.parse(input.slice(0, lineEnd))
    } catch {
      sendSocketResponse(socket, { ok: false, error: "invalid-agent-request" })
      return
    }

    const requestId = randomUUID()
    const timeout = setTimeout(() => {
      pendingClients.delete(requestId)
      sendSocketResponse(socket, { ok: false, error: "agent-request-timeout" })
    }, REQUEST_TIMEOUT_MS)
    pendingClients.set(requestId, { socket, timeout })
    socket.once("close", () => {
      const pending = pendingClients.get(requestId)
      if (!pending) return
      clearTimeout(pending.timeout)
      pendingClients.delete(requestId)
    })

    try {
      writeNativeMessage({
        type: "request",
        protocolVersion: AGENT_PROTOCOL_VERSION,
        requestId,
        request
      })
    } catch {
      clearTimeout(timeout)
      pendingClients.delete(requestId)
      sendSocketResponse(socket, {
        ok: false,
        error: "agent-request-too-large"
      })
    }
  })

  socket.on("error", () => undefined)
})

const shutdown = (error = "agent-control-disconnected") => {
  if (shuttingDown) return
  shuttingDown = true
  failPendingClients(error)
  server.close(() => {
    cleanupFiles()
    process.exit(0)
  })
  setTimeout(() => {
    cleanupFiles()
    process.exit(0)
  }, 500).unref()
}

const handleNativeMessage = (message) => {
  if (
    !message ||
    typeof message !== "object" ||
    message.type !== "response" ||
    message.protocolVersion !== AGENT_PROTOCOL_VERSION ||
    typeof message.requestId !== "string"
  ) {
    return
  }
  const pending = pendingClients.get(message.requestId)
  if (!pending) return
  clearTimeout(pending.timeout)
  pendingClients.delete(message.requestId)
  sendSocketResponse(pending.socket, message.response)
}

const decodeNativeMessage = createNativeMessageDecoder({
  onMessage: handleNativeMessage
})

process.stdin.on("data", (chunk) => {
  try {
    decodeNativeMessage(chunk)
  } catch (error) {
    process.stderr.write(
      `[TabPlex] Native Messaging 数据无效：${error.message}\n`
    )
    shutdown("invalid-native-message")
  }
})
process.stdin.on("end", () => shutdown())
process.stdin.on("error", () => shutdown())
process.on("SIGTERM", () => shutdown())
process.on("SIGINT", () => shutdown())

ensurePrivateDirectory(stateDirectory)
ensurePrivateDirectory(socketDirectory)
process.umask(0o077)

const socketIsActive = () =>
  new Promise((resolveActive, reject) => {
    const probe = createConnection(socketPath)
    probe.once("connect", () => {
      probe.destroy()
      resolveActive(true)
    })
    probe.once("error", (error) => {
      if (error.code === "ENOENT" || error.code === "ECONNREFUSED") {
        resolveActive(false)
      } else {
        reject(error)
      }
    })
  })

if (existsSync(socketPath)) {
  const stat = lstatSync(socketPath)
  if (!stat.isSocket()) throw new Error("agent-socket-path-is-not-a-socket")
  if (await socketIsActive())
    throw new Error("agent-native-host-already-running")
  rmSync(socketPath)
}

server.listen(socketPath, () => {
  chmodSync(socketPath, 0o600)
  const temporaryConnectionPath = `${connectionPath}.${process.pid}.tmp`
  writeFileSync(
    temporaryConnectionPath,
    `${JSON.stringify({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      extensionId,
      socketPath,
      pid: process.pid,
      startedAt: Date.now()
    })}\n`,
    { mode: 0o600 }
  )
  renameSync(temporaryConnectionPath, connectionPath)
  chmodSync(connectionPath, 0o600)
  writeNativeMessage({
    type: "ready",
    protocolVersion: AGENT_PROTOCOL_VERSION
  })
})

server.on("error", (error) => {
  process.stderr.write(`[TabPlex] Native Host 启动失败：${error.message}\n`)
  cleanupFiles()
  process.exit(1)
})
