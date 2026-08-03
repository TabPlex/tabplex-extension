import { DEFAULT_SETTINGS } from "~core/types"
import { addWorkspaceLinkedResource } from "~features/context/logic/workspaceLinkedResources"

import { BackupValidationError } from "./errors"
import { BACKUP_LIMITS } from "./limits"
import { sanitizeWorkspace, type WorkspaceSource } from "./sanitizeWorkspace"
import type {
  BackupPayloadV3,
  BackupSourceData,
  BackupWarning,
  PortableLinkedResource,
  PortableSettings,
  PortableWorkspace,
  PortableWorkspaceContext
} from "./types"
import {
  asArray,
  asRecord,
  assertCount,
  requiredId,
  requiredString,
  requiredTimestamp
} from "./validation"
import { pushBackupWarning } from "./warnings"

const sanitizeSettings = (value: unknown, path: string): PortableSettings => {
  const raw = value && typeof value === "object" ? asRecord(value, path) : {}
  const language =
    raw.language === "zh-CN" || raw.language === "en-US" ? raw.language : null
  const theme =
    raw.theme === "dark" || raw.theme === "light" || raw.theme === "system"
      ? raw.theme
      : DEFAULT_SETTINGS.theme
  const accentColor =
    typeof raw.accentColor === "string" &&
    /^#[0-9a-f]{6}$/i.test(raw.accentColor)
      ? raw.accentColor.toUpperCase()
      : (DEFAULT_SETTINGS.accentColor ?? "#6C5CE7").toUpperCase()
  // v3 keeps this field for schema compatibility, but runtime switching is
  // intentionally aggressive-only.
  const tabRestoreMode = "aggressive" as const
  const workspaceSort =
    raw.workspaceSort === "lastUsed" || raw.workspaceSort === "created"
      ? raw.workspaceSort
      : DEFAULT_SETTINGS.workspaceSort ?? "created"

  return { language, theme, accentColor, tabRestoreMode, workspaceSort }
}

const sanitizeWorkspaces = (
  value: unknown,
  source: WorkspaceSource,
  warnings: BackupWarning[]
) => {
  const rawWorkspaces = asArray(value, "$.workspaces")
  assertCount(rawWorkspaces.length, BACKUP_LIMITS.maxWorkspaces, "$.workspaces")
  const context = { warnings, totalTabRecords: 0 }
  const workspaces = rawWorkspaces.map((workspace, index) =>
    sanitizeWorkspace(workspace, `$.workspaces[${index}]`, source, context)
  )
  const ids = new Set<string>()
  for (const workspace of workspaces) {
    if (ids.has(workspace.id)) {
      throw new BackupValidationError("duplicate-workspace-id", "$.workspaces")
    }
    ids.add(workspace.id)
  }
  return workspaces
}

const sanitizeResourceList = (
  value: unknown,
  path: string,
  warnings: BackupWarning[]
) => {
  const rawResources = asArray(value, path)
  assertCount(rawResources.length, BACKUP_LIMITS.maxResourcesPerWorkspace, path)

  const resources: PortableLinkedResource[] = []
  const seenUrls = new Set<string>()
  for (const [index, value] of rawResources.entries()) {
    const resourcePath = `${path}[${index}]`
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      pushBackupWarning(warnings, {
        code: "invalid-resource-dropped",
        path: resourcePath,
        message: "无效关联资源已忽略"
      })
      continue
    }
    const raw = asRecord(value, resourcePath)
    if (typeof raw.url !== "string") {
      pushBackupWarning(warnings, {
        code: "invalid-resource-dropped",
        path: resourcePath,
        message: "缺少 URL 的关联资源已忽略"
      })
      continue
    }
    if (raw.url.length > BACKUP_LIMITS.maxUrlLength) {
      throw new BackupValidationError("string-too-long", `${resourcePath}.url`)
    }
    const createdAt = requiredTimestamp(
      raw.createdAt,
      `${resourcePath}.createdAt`
    )
    const result = addWorkspaceLinkedResource([], raw.url, createdAt)
    if (result.kind !== "added") {
      if (result.kind === "invalid") {
        pushBackupWarning(warnings, {
          code: "invalid-resource-dropped",
          path: resourcePath,
          message: "不安全的关联资源 URL 已忽略"
        })
        continue
      }
      throw new BackupValidationError("unexpected-resource-state", resourcePath)
    }
    if (seenUrls.has(result.resource.url)) {
      pushBackupWarning(warnings, {
        code: "duplicate-resource-dropped",
        path: resourcePath,
        message: "重复关联资源已忽略"
      })
      continue
    }
    seenUrls.add(result.resource.url)
    resources.push(result.resource)
  }
  return resources
}

const buildContextsFromState = (
  workspaces: PortableWorkspace[],
  source: BackupSourceData,
  warnings: BackupWarning[]
): PortableWorkspaceContext[] => {
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id))
  const contextIds = new Set([
    ...Object.keys(source.workspaceState.notes ?? {}),
    ...Object.keys(source.workspaceState.linkedResources ?? {})
  ])
  assertCount(
    contextIds.size,
    BACKUP_LIMITS.maxWorkspaces * 2,
    "$.workspaceContexts"
  )
  for (const orphanId of [...contextIds].sort()) {
    if (workspaceIds.has(orphanId)) continue
    pushBackupWarning(warnings, {
      code: "orphan-context-dropped",
      path: `$.workspaceContexts.${orphanId}`,
      message: "找不到对应工作区的上下文已忽略"
    })
  }

  return workspaces.map((workspace) => {
    const note = source.workspaceState.notes?.[workspace.id] ?? ""
    if (note.length > BACKUP_LIMITS.maxNoteLength) {
      throw new BackupValidationError(
        "string-too-long",
        `$.workspaceContexts[${workspace.id}].note`
      )
    }
    return {
      workspaceId: workspace.id,
      note,
      linkedResources: sanitizeResourceList(
        source.workspaceState.linkedResources?.[workspace.id] ?? [],
        `$.workspaceContexts[${workspace.id}].linkedResources`,
        warnings
      )
    }
  })
}

const sanitizeContextsV2 = (
  value: unknown,
  workspaces: PortableWorkspace[],
  warnings: BackupWarning[]
) => {
  const rawContexts = asArray(value, "$.workspaceContexts")
  assertCount(
    rawContexts.length,
    BACKUP_LIMITS.maxWorkspaces,
    "$.workspaceContexts"
  )
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id))
  const contexts = new Map<string, PortableWorkspaceContext>()

  for (const [index, value] of rawContexts.entries()) {
    const path = `$.workspaceContexts[${index}]`
    const raw = asRecord(value, path)
    const workspaceId = requiredId(
      raw.workspaceId,
      `${path}.workspaceId`,
      BACKUP_LIMITS.maxIdLength
    )
    if (contexts.has(workspaceId)) {
      throw new BackupValidationError(
        "duplicate-workspace-context",
        `${path}.workspaceId`
      )
    }
    if (!workspaceIds.has(workspaceId)) {
      pushBackupWarning(warnings, {
        code: "orphan-context-dropped",
        path,
        message: "找不到对应工作区的上下文已忽略"
      })
      continue
    }
    const note = requiredString(
      raw.note,
      `${path}.note`,
      BACKUP_LIMITS.maxNoteLength,
      { allowEmpty: true }
    )
    contexts.set(workspaceId, {
      workspaceId,
      note,
      linkedResources: sanitizeResourceList(
        raw.linkedResources,
        `${path}.linkedResources`,
        warnings
      )
    })
  }

  return workspaces.map((workspace) => {
    const context = contexts.get(workspace.id)
    if (!context) {
      throw new BackupValidationError(
        "missing-workspace-context",
        `$.workspaceContexts.${workspace.id}`
      )
    }
    return context
  })
}

export const buildPortablePayload = (source: BackupSourceData) => {
  const warnings: BackupWarning[] = []
  const workspaces = sanitizeWorkspaces(source.workspaces, "current", warnings)
  return {
    payload: {
      workspaces,
      workspaceContexts: buildContextsFromState(workspaces, source, warnings),
      settings: sanitizeSettings(source.settings, "$.settings")
    } satisfies BackupPayloadV3,
    warnings
  }
}

const sanitizePortablePayload = (value: unknown, source: "v2" | "v3") => {
  const warnings: BackupWarning[] = []
  const raw = asRecord(value, "$.payload")
  const workspaces = sanitizeWorkspaces(raw.workspaces, source, warnings)
  return {
    payload: {
      workspaces,
      workspaceContexts: sanitizeContextsV2(
        raw.workspaceContexts,
        workspaces,
        warnings
      ),
      settings: sanitizeSettings(raw.settings, "$.payload.settings")
    } satisfies BackupPayloadV3,
    warnings
  }
}

export const sanitizePayloadV2 = (value: unknown) =>
  sanitizePortablePayload(value, "v2")

export const sanitizePayloadV3 = (value: unknown) =>
  sanitizePortablePayload(value, "v3")

export const migratePayloadV1 = (value: unknown) => {
  const raw = asRecord(value, "$")
  const warnings: BackupWarning[] = [
    {
      code: "legacy-v1-unverified",
      path: "$",
      message: "v1 备份没有完整性校验"
    },
    {
      code: "legacy-v1-missing-contexts",
      path: "$.workspaces",
      message: "v1 备份不包含笔记和关联资源"
    }
  ]
  const workspaces = sanitizeWorkspaces(raw.workspaces, "v1", warnings)
  return {
    payload: {
      workspaces,
      workspaceContexts: workspaces.map((workspace) => ({
        workspaceId: workspace.id,
        note: "",
        linkedResources: []
      })),
      settings: sanitizeSettings(raw.settings, "$.settings")
    } satisfies BackupPayloadV3,
    warnings
  }
}
