# Changelog

This project follows a release-note format based on user-visible changes.

## 1.0.0 - 2026-08-09

### Added

- Current-window workspaces with portable Chrome tab-group restoration and
  stale-window write protection.
- Local backup v3 with bounded validation, checksum checks, preview,
  transactional recovery, and startup rollback after interruption.
- Global workspace, tab, resource, and note search.
- Optional, off-by-default Native Messaging Agent control for local workflows.

### Changed

- Workspace switching now persists recovery state before destructive tab
  operations and can recover interrupted MV3 service-worker runs.
- Chrome and Edge use the same local-first feature set and release checks.

### Security

- Added strict internal-message validation and scoped Agent capabilities, replay
  protection, rate limiting, audit records, and immediate revocation.
