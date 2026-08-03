# Changelog

This project follows a release-note format based on user-visible changes. The
current `0.0.3` tree is a release candidate; dated release entries are added when
a version is actually published.

## Unreleased

### Added

- Multi-window workspace slots and portable Chrome tab-group restoration.
- Local backup v2 with bounded validation, checksum checks, preview,
  transactional recovery, and startup rollback after interruption.
- Global workspace, tab, resource, and note search.
- Optional loopback-only Agent control with one-time pairing and short sessions.

### Changed

- Workspace switching now persists recovery state before destructive tab
  operations and can recover interrupted MV3 service-worker runs.
- Chrome and Edge use the same local-first feature set and release checks.

### Security

- Retired legacy caller-supplied-email entitlement SQL and removed anonymous
  execution grants.
- Added strict internal-message validation and scoped Agent capabilities, replay
  protection, rate limiting, audit records, and immediate revocation.
