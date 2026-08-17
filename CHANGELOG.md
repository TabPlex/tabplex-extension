# Changelog

This project follows a release-note format based on user-visible changes.

## 1.0.3 - 2026-08-16

### Fixed

- Keep workspace and webpage-list deletion disabled while a workspace is
  opening, and explain the temporary lock on hover or keyboard focus.
- Keep the toolbar quick switcher open while maintaining the pinned Home tab,
  and create Home once during the first installation.

## 1.0.2 - 2026-08-10

### Changed

- Pin Chrome and Edge production packages to the Chrome Web Store public key,
  so GitHub releases from this version onward keep the extension ID
  `cgenkcelnlbjbnpmembeekfjcldfagbh`.
- Simplify the feedback copy and add the official X and GitHub links beneath
  the copy-log and email actions.

### Fixed

- Keep the social icons aligned with the feedback description instead of
  wrapping into a detached footer row.

## 1.0.1 - 2026-08-09

### Changed

- Request Native Messaging only when the user explicitly enables optional
  Agent control, and remove the permission again when the feature is disabled.
- Align release metadata, contact details, and the official homepage with the
  store-ready build.

### Fixed

- Publish the post-1.0.0 workspace-switch reliability fixes under a distinct
  version so one release number never identifies different binaries.

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
