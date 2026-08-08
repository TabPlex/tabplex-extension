import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

import {
  createNativeMessageDecoder,
  encodeNativeMessage,
  MAX_NATIVE_EXTENSION_MESSAGE_BYTES
} from "./native-framing.mjs"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const children = new Set()
const temporaryDirectories = new Set()

const waitForExit = (child) =>
  child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve(child.exitCode)
    : new Promise((resolveExit) => child.once("exit", resolveExit))

afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM")
  }
  await Promise.all([...children].map(waitForExit))
  children.clear()
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true })
  }
  temporaryDirectories.clear()
})

describe("TabPlex native host", () => {
  it.runIf(
    process.env.CI === "true" ||
      process.env.TABPLEX_RUN_NATIVE_INTEGRATION === "1"
  )(
    "relays one CLI request and response without a network port",
    async () => {
      const temporaryRoot =
        process.platform === "darwin" ? "/private/tmp" : tmpdir()
      const stateDirectory = mkdtempSync(join(temporaryRoot, "tpx-"))
      temporaryDirectories.add(stateDirectory)
      const environment = {
        ...process.env,
        TABPLEX_AGENT_STATE_DIR: stateDirectory,
        TABPLEX_AGENT_SOCKET_DIR: stateDirectory
      }
      const extensionId = "b".repeat(32)
      const host = spawn(
        process.execPath,
        [
          join(scriptDirectory, "tabplex-native-host.mjs"),
          `chrome-extension://${extensionId}/`
        ],
        { env: environment, stdio: ["pipe", "pipe", "pipe"] }
      )
      children.add(host)

      let ready = false
      let resolveReady
      const readyPromise = new Promise((resolve) => {
        resolveReady = resolve
      })
      const decode = createNativeMessageDecoder({
        onMessage: (message) => {
          if (message.type === "ready") {
            ready = true
            resolveReady()
            return
          }
          if (message.type !== "request") return
          host.stdin.write(
            encodeNativeMessage(
              {
                type: "response",
                protocolVersion: 1,
                requestId: message.requestId,
                response: { ok: true, result: { version: "0.0.3" } }
              },
              MAX_NATIVE_EXTENSION_MESSAGE_BYTES
            )
          )
        }
      })
      host.stdout.on("data", decode)
      await readyPromise
      expect(ready).toBe(true)

      const cli = spawn(
        process.execPath,
        [join(scriptDirectory, "tabplex-agent-cli.mjs"), "getState"],
        { env: environment, stdio: ["ignore", "pipe", "pipe"] }
      )
      children.add(cli)
      let stdout = ""
      cli.stdout.setEncoding("utf8")
      cli.stdout.on("data", (chunk) => {
        stdout += chunk
      })

      const exitCode = await waitForExit(cli)
      children.delete(cli)
      expect(exitCode).toBe(0)
      expect(JSON.parse(stdout)).toEqual({
        ok: true,
        result: { version: "0.0.3" }
      })
    },
    10_000
  )
})
