#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { join, resolve, sep } from "node:path"

const source = resolve(process.argv[2] ?? "build/chrome-mv3-prod")
const destination = resolve("build/chrome-web-store-prod")
const zipPath = `${destination}.zip`
const metadata = JSON.parse(readFileSync("package.json", "utf8"))
const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"))

if (
  source === destination ||
  destination.startsWith(`${source}${sep}`) ||
  source.startsWith(`${destination}${sep}`)
) {
  throw new Error("Web Store output must be separate from the source build")
}
if (
  manifest.version !== metadata.version ||
  !manifest.key ||
  manifest.key !== metadata.manifest.key
) {
  throw new Error(
    "Source build must have the current version and extension key"
  )
}

// Keep the pinned-ID installation package intact. Only the store upload copy
// omits the development key; the existing store item supplies its identity.
rmSync(destination, { recursive: true, force: true })
cpSync(source, destination, { recursive: true })
delete manifest.key
writeFileSync(
  join(destination, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
)

if (existsSync(zipPath)) rmSync(zipPath)
const result = spawnSync("zip", ["-qr", zipPath, "."], {
  cwd: destination,
  stdio: "inherit"
})
if (result.error || result.status !== 0) {
  rmSync(zipPath, { force: true })
  throw result.error ?? new Error("Web Store ZIP creation failed")
}
console.log(
  `[TabPlex] Web Store ${manifest.version} package created: ${zipPath}`
)
