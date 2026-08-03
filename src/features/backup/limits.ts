export const BACKUP_LIMITS = Object.freeze({
  // Keep restore parsing comfortably below chrome.storage.local's 10 MiB
  // budget. Parsing, canonicalization and import planning temporarily retain
  // more than one representation of the file in an MV3 worker.
  maxBytes: 8 * 1024 * 1024,
  maxAggregateStringBytes: 6 * 1024 * 1024,
  maxDepth: 64,
  maxJsonNodes: 750_000,
  maxArrayEntries: 50_000,
  maxObjectEntries: 10_000,
  maxJsonKeyLength: 1024,
  maxWarnings: 500,
  maxWorkspaces: 1000,
  // Legacy v1/v2 import boundary only.
  maxSlotsPerWorkspace: 50,
  maxHistoryPerWorkspace: 15,
  maxResourcesPerWorkspace: 1000,
  maxTotalTabRecords: 50_000,
  maxIdLength: 256,
  maxNameLength: 200,
  maxUrlLength: 16 * 1024,
  maxTitleLength: 4096,
  maxNoteLength: 1024 * 1024
})
