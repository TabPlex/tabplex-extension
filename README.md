# TabPlex Extension

[![CI (main)](https://github.com/TabPlex/tabplex-extension/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/TabPlex/tabplex-extension/actions/workflows/ci.yml)

TabPlex is a local-first tab workspace extension for saving, recovering, and
switching task context across Chrome or Edge windows (Manifest V3).

## Current Features

- Save workspaces with multiple window slots, tab-group metadata, notes, and
  linked resources.
- Switch workspaces with a persistent recovery journal and configurable
  aggressive or soft tab restoration.
- Search across workspace names, tab titles and URLs, linked resources, and
  notes.
- Export and restore portable local backup files with a SHA-256 corruption
  check and transactional rollback.
- Use browser-level shortcuts and an optional, off-by-default Native Messaging
  Agent control channel for local workflows.

## Privacy & Storage

Workspace content, notes, resources, recovery state, and the device-local Agent
enable switch are stored in `chrome.storage.local`. Small portable preferences use the
browser's `chrome.storage.sync`. The current extension has no TabPlex account,
analytics client, remote workspace API, or background upload path. Backup files
are created locally and are only written when the user explicitly exports one.
Backup files use an 8 MiB safety limit. A matching checksum detects accidental
or malicious file changes but does not authenticate who created the file.

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Load the dev build in Chrome: `build/chrome-mv3-dev`.

## Build & Package

```bash
pnpm build:chrome
pnpm build:edge
pnpm verify:artifacts
pnpm package:chrome
pnpm package:edge
```

Artifacts:

- Chrome bundle / package: `build/chrome-mv3-prod` and
  `build/chrome-mv3-prod.zip`
- Edge bundle / package: `build/edge-mv3-prod` and `build/edge-mv3-prod.zip`

Before a release, run the same gates as CI:

```bash
pnpm scan:secrets
pnpm audit --audit-level high
pnpm typecheck
pnpm typecheck:unused
pnpm typecheck:strictnull:core
pnpm test
pnpm build:chrome
pnpm build:edge
pnpm verify:artifacts
```

## Optional Local Agent Control

Agent control is disabled by default. It uses Chrome Native Messaging plus a
user-only Unix socket; it does not expose MCP, HTTP, WebSocket, or a TCP port.
On macOS, install the local host once for the currently loaded extension ID:

```bash
pnpm agent:install -- --extension-id=<chrome-extension-id>
```

Then open **Settings → Control** and enable **Agent control**. The switch opens
or closes the native connection immediately. The settings row can also copy a
self-contained instruction for Codex or another local Agent. A project-local
skill is available at `.agents/skills/tabplex-agent-control/SKILL.md`.

Use the CLI from this checkout:

```bash
pnpm agent -- help
pnpm agent -- getState
pnpm agent -- switchWorkspace '{"workspaceId":"<id>"}'
```

The native host manifest accepts only the installed extension ID. Runtime files
are created under the current user's TabPlex application-support directory with
owner-only permissions. Window-bound commands default to the current normal
Chrome window and can also receive an explicit `--window-id`.

The validated command set covers workspace read/create/switch/rename/style/trash,
tab read/open/capture/move/remove/replace, notes, timeline snapshots, portable
settings, Home, Settings, and the Chrome shortcut settings page. Permanent
delete and empty-trash commands require `confirm: true`. Backup import/restore,
developer switches, and assigning browser shortcuts remain human-confirmed UI
flows rather than unattended Agent commands.

## Cloud Sync (roadmap)

The current extension has no Supabase client, login flow, entitlement consumer,
or cloud-sync runtime. Local workspaces do not require an account. The SQL under
`supabase/` is inactive design history and must not be presented as a feature
that can be enabled with build-time environment variables.

The former pre-login email eligibility RPC is retired. If OTP and cloud sync are
implemented later, entitlement lookup must be authenticated and self-only: read
the verified email from the Supabase JWT, accept no caller-supplied email, and
never grant the entitlement RPC to `anon`. See `supabase/README.md` for the
database cleanup and verification procedure.

## Shortcuts

TabPlex uses browser-level extension commands, so shortcuts also work on
regular Chrome pages. Customize them in `chrome://extensions/shortcuts`.

- Open Home / Switcher: `Alt+H`
- Quick Create Workspace: `Alt+N`
- Previous Workspace: `Alt+Up`
- Next Workspace: `Alt+Down`

## Notes

- Built with [Plasmo](https://docs.plasmo.com/).
- Licensed under [AGPL-3.0-only](LICENSE).
