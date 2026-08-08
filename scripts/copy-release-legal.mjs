#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs"
import { basename, dirname, relative, resolve, sep } from "node:path"

const LEGAL_FILES = ["LICENSE", "PRIVACY.md", "THIRD_PARTY_NOTICES.md"]
const ALLOWED_ARTIFACT_NAMES = new Set(["chrome-mv3-prod", "edge-mv3-prod"])
const workspaceRoot = process.cwd()
const buildRoot = resolve(workspaceRoot, "build")

const isInsideBuild = (path) => {
  const relativePath = relative(buildRoot, path)
  return (
    relativePath &&
    !relativePath.startsWith(`..${sep}`) &&
    relativePath !== ".."
  )
}

const copyLegalFiles = (rawDirectory) => {
  const directory = resolve(workspaceRoot, rawDirectory)
  if (
    !isInsideBuild(directory) ||
    !ALLOWED_ARTIFACT_NAMES.has(basename(directory))
  ) {
    throw new Error(`unsupported-artifact-directory:${rawDirectory}`)
  }
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`artifact-directory-missing:${rawDirectory}`)
  }

  mkdirSync(dirname(directory), { recursive: true })
  for (const filename of LEGAL_FILES) {
    const source = resolve(workspaceRoot, filename)
    if (!existsSync(source) || statSync(source).size === 0) {
      throw new Error(`legal-file-missing:${filename}`)
    }
    copyFileSync(source, resolve(directory, filename))
  }
  console.log(`[TabPlex] Legal files copied to ${rawDirectory}`)
}

const directories = process.argv.slice(2)
if (!directories.length) throw new Error("artifact-directory-required")
for (const directory of directories) copyLegalFiles(directory)
