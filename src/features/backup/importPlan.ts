import { BackupValidationError } from "./errors"
import { BACKUP_LIMITS } from "./limits"
import type {
  BackupPayloadV3,
  PortableSettings,
  PortableWorkspace
} from "./types"
import { assertCount } from "./validation"

export type ImportMode = "merge" | "replace"

export type ImportPlanInput = {
  mode: ImportMode
  current: BackupPayloadV3
  incoming: BackupPayloadV3
  includeSettings?: boolean
}

export type ImportPlan = {
  mode: ImportMode
  payload: BackupPayloadV3
  workspaceIdMap: Record<string, string>
  settingsAction: "preserve" | "replace"
  summary: {
    importedWorkspaces: number
    remappedWorkspaceIds: number
    renamedWorkspaces: number
  }
  storagePolicy: {
    resetWorkspaceRuntime: boolean
    clearLegacyLayouts: boolean
    clearPendingAction: boolean
    preserveOnboardingAndLogs: true
    disableAgentControl: boolean
  }
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const withBoundedSuffix = (base: string, suffix: string, maximum: number) =>
  `${base.slice(0, Math.max(0, maximum - suffix.length))}${suffix}`

const buildUniqueIdMap = (incomingIds: string[], existingIds: string[]) => {
  const duplicateCheck = new Set<string>()
  for (const id of incomingIds) {
    if (duplicateCheck.has(id)) {
      throw new BackupValidationError("duplicate-import-id")
    }
    duplicateCheck.add(id)
  }

  const reserved = new Set(incomingIds)
  const used = new Set(existingIds)
  const mapping = new Map<string, string>()
  for (const id of incomingIds) {
    let nextId = id
    if (used.has(nextId)) {
      let suffix = 1
      do {
        const ending = `-imported${suffix === 1 ? "" : `-${suffix}`}`
        nextId = withBoundedSuffix(id, ending, BACKUP_LIMITS.maxIdLength)
        suffix += 1
      } while (used.has(nextId) || reserved.has(nextId))
    }
    used.add(nextId)
    mapping.set(id, nextId)
  }
  return mapping
}

const buildUniqueNames = (incoming: string[], existing: string[]) => {
  const reserved = new Set(incoming)
  const used = new Set(existing)
  return incoming.map((name) => {
    if (!used.has(name)) {
      used.add(name)
      return name
    }

    let sequence = 1
    let candidate = ""
    do {
      const ending = `-导入${sequence === 1 ? "" : ` ${sequence}`}`
      candidate = withBoundedSuffix(name, ending, BACKUP_LIMITS.maxNameLength)
      sequence += 1
    } while (used.has(candidate) || reserved.has(candidate))
    used.add(candidate)
    return candidate
  })
}

const mapWorkspace = (
  workspace: PortableWorkspace,
  name: string,
  workspaceIds: Map<string, string>
): PortableWorkspace => ({
  ...cloneJson(workspace),
  id: workspaceIds.get(workspace.id) ?? workspace.id,
  name
})

const toRecord = (mapping: Map<string, string>) =>
  Object.fromEntries(mapping.entries())

const identityMap = (ids: string[]) =>
  Object.fromEntries(ids.map((id) => [id, id]))

const resolveSettings = (
  current: PortableSettings,
  incoming: PortableSettings,
  includeSettings: boolean
) => cloneJson(includeSettings ? incoming : current)

const assertPayloadCounts = (payload: BackupPayloadV3) => {
  assertCount(
    payload.workspaces.length,
    BACKUP_LIMITS.maxWorkspaces,
    "$.workspaces"
  )

  let totalTabRecords = 0
  for (const [index, workspace] of payload.workspaces.entries()) {
    assertCount(
      workspace.history.length,
      BACKUP_LIMITS.maxHistoryPerWorkspace,
      `$.workspaces[${index}].history`
    )
    totalTabRecords += workspace.tabs.length
    totalTabRecords += workspace.history.reduce(
      (sum, snapshot) => sum + snapshot.tabs.length,
      0
    )
  }
  assertCount(totalTabRecords, BACKUP_LIMITS.maxTotalTabRecords, "$.tabs")
  for (const [index, context] of payload.workspaceContexts.entries()) {
    assertCount(
      context.linkedResources.length,
      BACKUP_LIMITS.maxResourcesPerWorkspace,
      `$.workspaceContexts[${index}].linkedResources`
    )
  }
  if (
    new TextEncoder().encode(JSON.stringify(payload)).byteLength + 1024 >
    BACKUP_LIMITS.maxBytes
  ) {
    throw new BackupValidationError("backup-too-large", "$.payload")
  }
}

const createReplacePlan = ({
  current,
  incoming,
  includeSettings = true
}: ImportPlanInput): ImportPlan => {
  const payload = cloneJson(incoming)
  payload.settings = resolveSettings(
    current.settings,
    incoming.settings,
    includeSettings
  )
  assertPayloadCounts(payload)
  return {
    mode: "replace",
    payload,
    workspaceIdMap: identityMap(
      incoming.workspaces.map((workspace) => workspace.id)
    ),
    settingsAction: includeSettings ? "replace" : "preserve",
    summary: {
      importedWorkspaces: incoming.workspaces.length,
      remappedWorkspaceIds: 0,
      renamedWorkspaces: 0
    },
    storagePolicy: {
      resetWorkspaceRuntime: true,
      clearLegacyLayouts: true,
      clearPendingAction: true,
      preserveOnboardingAndLogs: true,
      disableAgentControl: true
    }
  }
}

const createMergePlan = ({
  current,
  incoming,
  includeSettings = false
}: ImportPlanInput): ImportPlan => {
  const workspaceIds = buildUniqueIdMap(
    incoming.workspaces.map((workspace) => workspace.id),
    current.workspaces.map((workspace) => workspace.id)
  )
  const workspaceNames = buildUniqueNames(
    incoming.workspaces.map((workspace) => workspace.name),
    current.workspaces.map((workspace) => workspace.name)
  )
  const mappedWorkspaces = incoming.workspaces.map((workspace, index) =>
    mapWorkspace(workspace, workspaceNames[index], workspaceIds)
  )
  const mappedContexts = incoming.workspaceContexts.map((context) => ({
    ...cloneJson(context),
    workspaceId: workspaceIds.get(context.workspaceId) ?? context.workspaceId
  }))

  const payload: BackupPayloadV3 = {
    workspaces: [...cloneJson(current.workspaces), ...mappedWorkspaces],
    workspaceContexts: [
      ...cloneJson(current.workspaceContexts),
      ...mappedContexts
    ],
    settings: resolveSettings(
      current.settings,
      incoming.settings,
      includeSettings
    )
  }
  assertPayloadCounts(payload)

  return {
    mode: "merge",
    payload,
    workspaceIdMap: toRecord(workspaceIds),
    settingsAction: includeSettings ? "replace" : "preserve",
    summary: {
      importedWorkspaces: incoming.workspaces.length,
      remappedWorkspaceIds: [...workspaceIds].filter(
        ([source, target]) => source !== target
      ).length,
      renamedWorkspaces: incoming.workspaces.filter(
        (workspace, index) => workspace.name !== workspaceNames[index]
      ).length
    },
    storagePolicy: {
      resetWorkspaceRuntime: false,
      clearLegacyLayouts: false,
      clearPendingAction: false,
      preserveOnboardingAndLogs: true,
      disableAgentControl: false
    }
  }
}

export const createImportPlan = (input: ImportPlanInput): ImportPlan =>
  input.mode === "replace" ? createReplacePlan(input) : createMergePlan(input)
