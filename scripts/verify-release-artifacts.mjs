#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync
} from "node:fs"
import { tmpdir } from "node:os"
import { extname, join, relative, resolve, sep } from "node:path"

const DEFAULT_ARTIFACTS = ["build/chrome-mv3-prod", "build/edge-mv3-prod"]
const RELEASE_DESCRIPTION_ENV = "TABPLEX_RELEASE_DESCRIPTION"

const EXPECTED_PERMISSIONS = new Set([
  "alarms",
  "nativeMessaging",
  "storage",
  "tabGroups",
  "tabs",
  "windows"
])

const EXPECTED_EXTENSION_PAGE_CSP =
  "script-src 'self'; object-src 'none'; base-uri 'none';"
const FORBIDDEN_MANIFEST_ARRAY_FIELDS = [
  "content_scripts",
  "optional_host_permissions",
  "optional_permissions",
  "web_accessible_resources"
]
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json"])

const failures = []
const warnings = []

const reportFailure = (artifact, reason) => {
  failures.push(`${artifact}: ${reason}`)
}

const reportWarning = (artifact, reason) => {
  warnings.push(`${artifact}: ${reason}`)
}

const sameSet = (actual, expected) => {
  if (actual.size !== expected.size) return false
  return [...actual].every((value) => expected.has(value))
}

const toArchivePath = (path) => path.split(sep).join("/")

const listFiles = (root, artifact = root) => {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(path)
      else
        reportFailure(
          artifact,
          `${toArchivePath(relative(root, path))} 不是普通文件`
        )
    }
  }
  visit(root)
  return files
}

const readManifest = (root, artifact) => {
  const path = join(root, "manifest.json")
  if (!existsSync(path)) {
    reportFailure(artifact, "缺少 manifest.json")
    return null
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    reportFailure(artifact, "manifest.json 不是有效 JSON")
    return null
  }
}

const verifyManifestFile = (root, artifact, manifest, field, label) => {
  const path = manifest?.[field]
  if (typeof path !== "string" || !existsSync(join(root, path))) {
    reportFailure(artifact, `${label} 指向缺失文件`)
  }
}

const verifyReleaseDescription = (artifact, manifest, expectedDescription) => {
  if (!expectedDescription) return
  if (manifest.description !== expectedDescription) {
    reportFailure(
      artifact,
      `manifest.description 未使用 ${RELEASE_DESCRIPTION_ENV} 的正式商店文案`
    )
  }
  if (/本次测试范围|测试文案/.test(manifest.description ?? "")) {
    reportFailure(artifact, "正式商店产物仍包含本地测试范围文案")
  }
}

const verifyManifest = (root, artifact, manifest, expectedDescription) => {
  if (!manifest) return
  if (manifest.manifest_version !== 3) {
    reportFailure(artifact, "只允许 Manifest V3")
  }

  const permissions = new Set(manifest.permissions ?? [])
  if (!sameSet(permissions, EXPECTED_PERMISSIONS)) {
    reportFailure(artifact, "权限集合偏离已审计的最小权限基线")
  }
  if ((manifest.host_permissions ?? []).length > 0) {
    reportFailure(artifact, "正式产物不应声明 host_permissions")
  }
  for (const field of FORBIDDEN_MANIFEST_ARRAY_FIELDS) {
    const value = manifest[field]
    if (value !== undefined && (!Array.isArray(value) || value.length > 0)) {
      reportFailure(artifact, `正式产物不应声明非空 ${field}`)
    }
  }

  if (manifest.externally_connectable !== undefined) {
    reportFailure(
      artifact,
      "Native Messaging 模式不应再声明 externally_connectable"
    )
  }
  if (
    manifest.content_security_policy?.extension_pages !==
    EXPECTED_EXTENSION_PAGE_CSP
  ) {
    reportFailure(artifact, "扩展页面 CSP 偏离已审计的最小安全基线")
  }

  verifyManifestFile(
    root,
    artifact,
    manifest.background ?? {},
    "service_worker",
    "background.service_worker"
  )
  verifyManifestFile(
    root,
    artifact,
    manifest.action ?? {},
    "default_popup",
    "action.default_popup"
  )
  verifyManifestFile(
    root,
    artifact,
    manifest.options_ui ?? {},
    "page",
    "options_ui.page"
  )
  verifyReleaseDescription(artifact, manifest, expectedDescription)
}

const verifyHtmlReferences = (root, artifact, files) => {
  for (const file of files.filter((path) => extname(path) === ".html")) {
    const html = readFileSync(file, "utf8")
    for (const match of html.matchAll(
      /\b(?:href|src)=["']\/?([^"'#?]+)["']/g
    )) {
      const target = join(root, match[1])
      if (!existsSync(target)) {
        reportFailure(
          artifact,
          `${toArchivePath(relative(root, file))} 引用了缺失资源 ${match[1]}`
        )
      }
    }
  }
}

const CONTENT_RULES = [
  {
    id: "unresolved-react-runtime",
    pattern:
      /["']react(?:-dom)?(?:\/(?:client|jsx-runtime))?["']\s*:\s*["']react(?:-dom)?(?:\/(?:client|jsx-runtime))?["']/,
    reason: "bundle 含未解析的 React 运行时依赖"
  },
  {
    id: "supabase-runtime",
    pattern:
      /(?:PLASMO_PUBLIC_SUPABASE_|[a-z0-9-]+\.supabase\.co|sb_(?:publishable|secret)_)/i,
    reason: "bundle 意外包含 Supabase 配置或客户端痕迹"
  },
  {
    id: "jwt-literal",
    pattern: /eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}/,
    reason: "bundle 疑似包含 JWT 字面量"
  },
  {
    id: "source-map-reference",
    pattern: /sourceMappingURL=/,
    reason: "正式产物含 source map 引用"
  }
]

const verifyContent = (root, artifact, files) => {
  for (const file of files) {
    if (extname(file) === ".map") {
      reportFailure(
        artifact,
        `${toArchivePath(relative(root, file))} 不应出现在正式产物中`
      )
      continue
    }
    if (!TEXT_EXTENSIONS.has(extname(file))) continue
    if (statSync(file).size === 0) {
      reportFailure(artifact, `${toArchivePath(relative(root, file))} 为空文件`)
      continue
    }
    const content = readFileSync(file, "utf8")
    for (const rule of CONTENT_RULES) {
      if (rule.pattern.test(content)) {
        reportFailure(
          artifact,
          `${toArchivePath(relative(root, file))} [${rule.id}] ${rule.reason}`
        )
      }
    }
  }
}

const verifyArtifactDirectory = (root, artifact, expectedDescription) => {
  if (!existsSync(root)) {
    reportFailure(artifact, "产物目录不存在，请先构建")
    return []
  }
  const files = listFiles(root, artifact)
  const manifest = readManifest(root, artifact)
  verifyManifest(root, artifact, manifest, expectedDescription)
  verifyHtmlReferences(root, artifact, files)
  verifyContent(root, artifact, files)
  return files
}

const runUnzip = (artifact, args, encoding = "utf8") => {
  const result = spawnSync("unzip", args, {
    encoding,
    maxBuffer: 64 * 1024 * 1024
  })
  if (result.error?.code === "ENOENT") {
    reportFailure(artifact, "系统缺少 unzip，无法校验最终 ZIP")
    return null
  }
  if (result.error) {
    reportFailure(artifact, `unzip 执行失败：${result.error.message}`)
    return null
  }
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim()
    reportFailure(artifact, `ZIP 校验失败${detail ? `：${detail}` : ""}`)
    return null
  }
  return result
}

const isUnsafeZipEntry = (entry) => {
  const parts = entry.split("/")
  return (
    entry.length === 0 ||
    entry.includes("\\") ||
    entry.includes("\0") ||
    entry.startsWith("/") ||
    /^[A-Za-z]:/.test(entry) ||
    parts.includes("..")
  )
}

const readZipEntries = (zipPath) => {
  const result = runUnzip(zipPath, ["-Z1", resolve(zipPath)])
  if (!result) return null
  const entries = result.stdout.split(/\r?\n/).filter(Boolean)
  if (entries.length === 0) {
    reportFailure(zipPath, "ZIP 为空")
    return null
  }
  const seen = new Set()
  for (const entry of entries) {
    if (isUnsafeZipEntry(entry)) {
      reportFailure(zipPath, `ZIP 含不安全路径：${entry}`)
    }
    if (seen.has(entry)) {
      reportFailure(zipPath, `ZIP 含重复条目：${entry}`)
    }
    seen.add(entry)
  }
  return entries
}

const hashFile = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex")

const indexFiles = (root, files) =>
  new Map(
    files.map((path) => [
      toArchivePath(relative(root, path)),
      { path, hash: hashFile(path) }
    ])
  )

const compareDirectoryAndZip = (
  directory,
  directoryFiles,
  extractedRoot,
  zipFiles,
  zipPath
) => {
  const directoryIndex = indexFiles(directory, directoryFiles)
  const zipIndex = indexFiles(extractedRoot, zipFiles)

  for (const path of directoryIndex.keys()) {
    if (!zipIndex.has(path)) reportFailure(zipPath, `缺少目录中的文件：${path}`)
  }
  for (const path of zipIndex.keys()) {
    if (!directoryIndex.has(path))
      reportFailure(zipPath, `包含目录外的文件：${path}`)
  }
  for (const [path, directoryFile] of directoryIndex) {
    const zipFile = zipIndex.get(path)
    if (zipFile && directoryFile.hash !== zipFile.hash) {
      reportFailure(zipPath, `与产物目录内容不一致：${path}`)
    }
  }
}

const verifyZipPair = (
  directory,
  directoryFiles,
  zipPath,
  expectedDescription
) => {
  if (!existsSync(zipPath)) return false

  const integrityResult = runUnzip(zipPath, ["-tqq", resolve(zipPath)])
  const entries = readZipEntries(zipPath)
  if (!integrityResult || !entries || entries.some(isUnsafeZipEntry))
    return true

  const extractedRoot = mkdtempSync(join(tmpdir(), "tabplex-release-artifact-"))
  try {
    const extractionResult = runUnzip(zipPath, [
      "-qq",
      resolve(zipPath),
      "-d",
      extractedRoot
    ])
    if (!extractionResult) return true

    const zipFiles = verifyArtifactDirectory(
      extractedRoot,
      zipPath,
      expectedDescription
    )
    if (directoryFiles.length > 0) {
      compareDirectoryAndZip(
        directory,
        directoryFiles,
        extractedRoot,
        zipFiles,
        zipPath
      )
    }

    const listedFiles = new Set(entries.filter((entry) => !entry.endsWith("/")))
    const extractedFiles = new Set(
      zipFiles.map((path) => toArchivePath(relative(extractedRoot, path)))
    )
    if (!sameSet(listedFiles, extractedFiles)) {
      reportFailure(zipPath, "ZIP 清单与实际解压文件不一致")
    }
  } finally {
    rmSync(extractedRoot, { force: true, recursive: true })
  }
  return true
}

const parseArguments = () => {
  const args = process.argv.slice(2)
  const releaseMode = args.includes("--release")
  const unknownOptions = args.filter(
    (arg) => arg.startsWith("--") && !["--", "--release"].includes(arg)
  )
  for (const option of unknownOptions) reportFailure("参数", `不支持 ${option}`)
  const paths = args.filter((arg) => arg !== "--" && !arg.startsWith("--"))
  return { releaseMode, paths: paths.length > 0 ? paths : DEFAULT_ARTIFACTS }
}

const validateExpectedDescription = (releaseMode) => {
  if (!releaseMode) return null
  const description = process.env[RELEASE_DESCRIPTION_ENV]?.trim()
  if (!description) {
    reportFailure(
      "release",
      `缺少 ${RELEASE_DESCRIPTION_ENV}，拒绝生成商店发布包`
    )
    return null
  }
  if (description.length > 132 || /[\r\n]/.test(description)) {
    reportFailure(
      "release",
      `${RELEASE_DESCRIPTION_ENV} 必须是 1–132 字符的单行文案`
    )
  }
  if (/本次测试范围|测试文案/.test(description)) {
    reportFailure(
      "release",
      `${RELEASE_DESCRIPTION_ENV} 不能使用本地测试范围文案`
    )
  }
  return description
}

const normalizeArtifactPair = (path) => {
  if (path.endsWith(".zip")) {
    return { directory: path.slice(0, -4), zipPath: path, explicitZip: true }
  }
  return { directory: path, zipPath: `${path}.zip`, explicitZip: false }
}

const { releaseMode, paths } = parseArguments()
const expectedDescription = validateExpectedDescription(releaseMode)
const pairs = new Map()

for (const path of paths) {
  const pair = normalizeArtifactPair(path)
  const existing = pairs.get(pair.directory)
  pairs.set(pair.directory, {
    ...pair,
    explicitZip: pair.explicitZip || existing?.explicitZip || false
  })
}

let verifiedZipCount = 0
for (const { directory, zipPath, explicitZip } of pairs.values()) {
  const directoryFiles = verifyArtifactDirectory(
    directory,
    directory,
    expectedDescription
  )
  if (verifyZipPair(directory, directoryFiles, zipPath, expectedDescription)) {
    verifiedZipCount += 1
  } else if (releaseMode || explicitZip) {
    reportFailure(zipPath, "最终 ZIP 不存在，请先执行对应的 package 命令")
  } else {
    reportWarning(
      zipPath,
      "未找到 ZIP；本次仅校验产物目录，正式发布请使用 --release"
    )
  }
}

for (const warning of warnings) console.warn(`[TabPlex] ${warning}`)

if (failures.length > 0) {
  console.error("\n[TabPlex] Release artifact verification failed:\n")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `[TabPlex] Release artifacts verified: ${pairs.size} directories, ${verifiedZipCount} ZIPs${releaseMode ? " (release mode)" : ""}`
)
