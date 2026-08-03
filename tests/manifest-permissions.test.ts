import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const packagePath = resolve(__dirname, "..", "package.json")

const readManifest = () => {
  const content = readFileSync(packagePath, "utf8")
  const pkg = JSON.parse(content) as { manifest?: { permissions?: string[] } }
  return pkg.manifest ?? {}
}

describe("manifest permissions", () => {
  it("does not request display access after removing virtual windows", () => {
    const manifest = readManifest()
    expect(manifest.permissions).not.toContain("system.display")
  })

  it("uses Native Messaging without exposing a web origin bridge", () => {
    const content = readFileSync(packagePath, "utf8")
    const pkg = JSON.parse(content) as {
      manifest?: {
        permissions?: string[]
        externally_connectable?: unknown
      }
    }
    expect(pkg.manifest?.permissions).toContain("nativeMessaging")
    expect(pkg.manifest?.externally_connectable).toBeUndefined()
  })
})
