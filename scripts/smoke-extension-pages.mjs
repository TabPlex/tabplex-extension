#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { JSDOM, VirtualConsole } from "jsdom"

const DEFAULT_ARTIFACTS = ["build/chrome-mv3-prod"]
const ENTRY_NAMES = ["popup", "options"]
const RENDER_WAIT_MS = 700
const ERROR_BOUNDARY_MARKERS = [
  "TabPlex 暂时无法显示",
  "TabPlex could not render"
]

const createChromeEvent = () => ({
  addListener() {},
  removeListener() {},
  hasListener() {
    return false
  }
})

const createStorageArea = () => ({
  QUOTA_BYTES: 10 * 1024 * 1024,
  async get() {
    return {}
  },
  async set() {},
  async remove() {},
  async clear() {},
  async getBytesInUse() {
    return 0
  }
})

const createMediaQueryList = () => ({
  matches: false,
  media: "",
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true
  }
})

const installBrowserStubs = (window, version) => {
  const chromeEvent = createChromeEvent()
  window.matchMedia = createMediaQueryList
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  window.chrome = {
    i18n: { getUILanguage: () => "zh-CN" },
    runtime: {
      id: "b".repeat(32),
      getManifest: () => ({ version }),
      getURL: (path = "") => `chrome-extension://${"b".repeat(32)}/${path}`,
      sendMessage: async () => ({ ok: true }),
      onMessage: chromeEvent
    },
    storage: {
      local: createStorageArea(),
      sync: createStorageArea(),
      session: createStorageArea(),
      onChanged: chromeEvent
    },
    windows: {
      getCurrent: async () => ({ id: 1, type: "normal" })
    },
    tabs: {
      query: async () => []
    },
    commands: {
      getAll: async () => [],
      update: async () => {},
      onCommand: chromeEvent
    }
  }
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: async () => {} },
    configurable: true
  })
}

const formatConsoleArgs = (args) =>
  args
    .map((arg) =>
      arg instanceof Error ? arg.stack || arg.message : String(arg)
    )
    .join(" ")

const readEntryScript = (artifactRoot, entryName) => {
  const htmlPath = join(artifactRoot, `${entryName}.html`)
  if (!existsSync(htmlPath)) {
    throw new Error(`${entryName}.html 不存在`)
  }
  const html = readFileSync(htmlPath, "utf8")
  const scriptPath = html.match(/<script src="\/?([^"?#]+)"/)?.[1]
  if (!scriptPath) {
    throw new Error(`${entryName}.html 未引用入口脚本`)
  }
  const absoluteScriptPath = join(artifactRoot, scriptPath)
  if (!existsSync(absoluteScriptPath)) {
    throw new Error(`${entryName}.html 引用了缺失脚本 ${scriptPath}`)
  }
  return {
    script: readFileSync(absoluteScriptPath, "utf8"),
    scriptPath
  }
}

const waitForInitialRender = () =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, RENDER_WAIT_MS))

const smokeEntry = async (artifactRoot, entryName, version) => {
  const runtimeMessages = []
  const virtualConsole = new VirtualConsole()
  const record = (kind, args) => {
    runtimeMessages.push(`${kind}: ${formatConsoleArgs(args)}`)
  }
  virtualConsole.on("error", (...args) => record("console.error", args))
  virtualConsole.on("warn", (...args) => record("console.warn", args))
  virtualConsole.on("jsdomError", (error) => record("runtime", [error]))

  const { script, scriptPath } = readEntryScript(artifactRoot, entryName)
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="__plasmo"></div></body></html>',
    {
      runScripts: "dangerously",
      pretendToBeVisual: true,
      url: `https://extension.test/${entryName}.html`,
      virtualConsole,
      beforeParse: (window) => installBrowserStubs(window, version)
    }
  )

  try {
    dom.window.eval(`${script}\n//# sourceURL=${basename(scriptPath)}`)
    await waitForInitialRender()
    const renderedText = dom.window.document.body.textContent
      .replace(/\s+/g, " ")
      .trim()
    const renderedErrorBoundary = ERROR_BOUNDARY_MARKERS.some((marker) =>
      renderedText.includes(marker)
    )
    if (renderedErrorBoundary) {
      runtimeMessages.push("render: 进入 AppErrorBoundary 回退界面")
    }
    if (!renderedText) {
      runtimeMessages.push("render: 页面没有产生可见文本")
    }
    return runtimeMessages
  } catch (error) {
    return [`startup: ${formatConsoleArgs([error])}`, ...runtimeMessages]
  } finally {
    dom.window.close()
  }
}

const smokeArtifact = async (artifactPath) => {
  const artifactRoot = resolve(artifactPath)
  const manifestPath = join(artifactRoot, "manifest.json")
  if (!existsSync(manifestPath)) {
    return [`${artifactPath}: 缺少 manifest.json`]
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const entryResults = await Promise.all(
    ENTRY_NAMES.map(async (entryName) => ({
      entryName,
      messages: await smokeEntry(artifactRoot, entryName, manifest.version)
    }))
  )
  return entryResults.flatMap(({ entryName, messages }) =>
    messages.map((message) => `${artifactPath}/${entryName}: ${message}`)
  )
}

const artifactPaths =
  process.argv.slice(2).filter((value) => value !== "--").length > 0
    ? process.argv.slice(2).filter((value) => value !== "--")
    : DEFAULT_ARTIFACTS

const failures = (
  await Promise.all(
    artifactPaths.map((artifactPath) => smokeArtifact(artifactPath))
  )
).flat()

if (failures.length > 0) {
  console.error("\n[TabPlex] Extension page smoke failed:\n")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `[TabPlex] Extension page smoke passed: ${artifactPaths.length} artifacts, ${artifactPaths.length * ENTRY_NAMES.length} pages`
)
