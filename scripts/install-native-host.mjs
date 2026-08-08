#!/usr/bin/env node
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  renameSync,
  writeFileSync
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { isExtensionId, NATIVE_HOST_NAME } from "./native-host/agent-paths.mjs"

const BROWSER_MANIFEST_DIRECTORIES = {
  chrome: ["Google", "Chrome"],
  edge: ["Microsoft Edge"],
  chromium: ["Chromium"]
}

const argumentValue = (name) => {
  const prefix = `--${name}=`
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`

const writeAtomicJson = (path, value) => {
  const temporaryPath = `${path}.${process.pid}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600
  })
  renameSync(temporaryPath, path)
  chmodSync(path, 0o600)
}

const extensionId = argumentValue("extension-id")
const browser = argumentValue("browser") ?? "chrome"

if (process.platform !== "darwin") {
  throw new Error("native-host-installer-currently-supports-macos-only")
}
if (!isExtensionId(extensionId)) throw new Error("invalid-extension-id")
if (!(browser in BROWSER_MANIFEST_DIRECTORIES)) {
  throw new Error("unsupported-browser")
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const sourceDirectory = join(scriptDirectory, "native-host")
const installDirectory = join(
  homedir(),
  "Library",
  "Application Support",
  "TabPlex",
  "NativeMessaging"
)
const installedSources = [
  "agent-paths.mjs",
  "native-framing.mjs",
  "tabplex-native-host.mjs",
  "tabplex-agent-cli.mjs"
]

mkdirSync(installDirectory, { recursive: true, mode: 0o700 })
chmodSync(installDirectory, 0o700)
for (const filename of installedSources) {
  copyFileSync(
    join(sourceDirectory, filename),
    join(installDirectory, filename)
  )
}

const nativeHostSource = join(installDirectory, "tabplex-native-host.mjs")
const agentCliSource = join(installDirectory, "tabplex-agent-cli.mjs")
const nativeHostLauncher = join(installDirectory, "tabplex-native-host")
const agentCliLauncher = join(installDirectory, "tabplex-agent")

writeFileSync(
  nativeHostLauncher,
  `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(nativeHostSource)} "$@"\n`,
  { mode: 0o700 }
)
writeFileSync(
  agentCliLauncher,
  `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(agentCliSource)} "$@"\n`,
  { mode: 0o700 }
)
chmodSync(nativeHostLauncher, 0o700)
chmodSync(agentCliLauncher, 0o700)

const manifestDirectory = join(
  homedir(),
  "Library",
  "Application Support",
  ...BROWSER_MANIFEST_DIRECTORIES[browser],
  "NativeMessagingHosts"
)
mkdirSync(manifestDirectory, { recursive: true, mode: 0o700 })
const manifestPath = join(manifestDirectory, `${NATIVE_HOST_NAME}.json`)
writeAtomicJson(manifestPath, {
  name: NATIVE_HOST_NAME,
  description: "TabPlex local Agent control",
  path: resolve(nativeHostLauncher),
  type: "stdio",
  allowed_origins: [`chrome-extension://${extensionId}/`]
})

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      browser,
      extensionId,
      manifestPath,
      hostPath: nativeHostLauncher,
      cliPath: agentCliLauncher,
      command: `${shellQuote(agentCliLauncher)} getState`
    },
    null,
    2
  )}\n`
)
