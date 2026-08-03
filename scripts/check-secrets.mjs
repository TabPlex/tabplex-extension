#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import { extname } from "node:path"

const MAX_TEXT_BYTES = 512 * 1024
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".env",
  ".txt",
  ".css",
  ".html",
  ".xml",
  ".toml",
  ".ini",
  ""
])

const stagedOnly = process.argv.includes("--staged")

const listFiles = () => {
  const args = stagedOnly
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACM"]
    : ["ls-files"]
  const output = execFileSync("git", args, { encoding: "utf8" }).trim()
  if (!output) return []
  return output.split("\n").filter(Boolean)
}

const patterns = [
  {
    id: "supabase-url",
    test(line) {
      const match = line.match(/PLASMO_PUBLIC_SUPABASE_URL\s*=\s*(\S+)/)
      if (!match) return null
      const value = match[1]
      if (value === "https://your-project.supabase.co") return null
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(value)) return null
      return `检测到疑似真实 Supabase URL: ${value}`
    }
  },
  {
    id: "supabase-anon-key",
    test(line) {
      const match = line.match(/PLASMO_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(\S+)/)
      if (!match) return null
      const value = match[1]
      if (value === "your_anon_key_here") return null
      if (!/^eyJ[\w.-]+$/.test(value)) return null
      return "检测到疑似真实 Supabase anon key"
    }
  },
  {
    id: "supabase-publishable-key",
    test(line) {
      const match = line.match(
        /PLASMO_PUBLIC_SUPABASE_PUBLISHABLE_KEY\s*=\s*(\S+)/
      )
      if (!match) return null
      const value = match[1]
      if (value === "your_publishable_key_here") return null
      if (!/^sb_publishable_[\w-]+$/.test(value)) return null
      return "检测到疑似真实 Supabase publishable key"
    }
  }
]

const violations = []

for (const file of listFiles()) {
  try {
    const stat = statSync(file)
    if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) continue
  } catch {
    continue
  }

  const ext = extname(file)
  if (!TEXT_EXTENSIONS.has(ext)) continue

  let content = ""
  try {
    content = readFileSync(file, "utf8")
  } catch {
    continue
  }

  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line || line.includes("tabplex-secret-scan:ignore")) continue
    for (const pattern of patterns) {
      const reason = pattern.test(line)
      if (!reason) continue
      violations.push({ file, line: index + 1, reason, id: pattern.id })
    }
  }
}

if (violations.length > 0) {
  console.error(
    "\n[TabPlex] Secret scan failed. Please remove sensitive values:\n"
  )
  for (const item of violations) {
    console.error(`- ${item.file}:${item.line} [${item.id}] ${item.reason}`)
  }
  console.error(
    "\nUse placeholders in committed files. Real credentials must stay in local env or CI secrets."
  )
  process.exit(1)
}

console.log("[TabPlex] Secret scan passed")
