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
const SCANNER_PATH = "scripts/check-secrets.mjs"

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
    id: "private-key",
    test(line) {
      return /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/.test(line)
        ? "检测到疑似私钥"
        : null
    }
  },
  {
    id: "provider-token",
    test(line) {
      return /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|(?:sk|rk)_live_[A-Za-z0-9]{16,}|npm_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b/.test(
        line
      )
        ? "检测到疑似第三方服务令牌"
        : null
    }
  },
  {
    id: "jwt-literal",
    test(line) {
      return /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(
        line
      )
        ? "检测到疑似 JWT 字面量"
        : null
    }
  },
  {
    id: "credential-url",
    test(line) {
      return /https?:\/\/[^\s/:@]+:[^\s/@]+@/.test(line)
        ? "检测到 URL 中的疑似明文凭据"
        : null
    }
  },
  {
    id: "machine-path",
    test(line) {
      return /\/Users\/[A-Za-z0-9._-]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\/.test(
        line
      )
        ? "检测到本机用户绝对路径"
        : null
    }
  },
  {
    id: "supabase-url",
    test(line) {
      const match = line.match(/PLASMO_PUBLIC_SUPABASE_URL\s*=\s*(\S+)/)
      if (!match) return null
      const value = match[1]
      if (value === "https://your-project.supabase.co") return null
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(value)) return null
      return "检测到疑似真实 Supabase URL"
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
  // The scanner contains the detection expressions themselves.
  if (file === SCANNER_PATH) continue
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
