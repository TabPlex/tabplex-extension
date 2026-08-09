# Privacy Policy

Last updated: 2026-08-09

TabPlex is a local-first Chrome and Edge extension. This policy describes the
current open-source `1.0.1` runtime.

## Data TabPlex handles

To save and restore workspaces, TabPlex reads and stores the browser tab URLs,
titles, pinned state, and tab-group metadata that belong to a workspace. It also
stores workspace names and appearance, notes, linked resources, timeline
snapshots, recovery journals, local diagnostic errors, and extension settings.

TabPlex does not include an analytics client, advertising SDK, TabPlex account,
remote workspace API, or background upload path. It does not inject content
scripts into websites and does not request host permissions.

## Where data is stored

- Workspace content and recovery data use `chrome.storage.local`.
- Temporary per-window bindings use `chrome.storage.session`.
- A small set of portable preferences uses `chrome.storage.sync`. The browser
  vendor may synchronize those preferences when browser sync is enabled; they
  are not sent to a TabPlex service.
- Exported backup files are created only after an explicit export action and are
  written to the location chosen by the user.

The `unlimitedStorage` permission removes Chrome's fixed local extension-storage
quota. It does not grant access to website contents, device files, or a network
service. Available device storage still limits capacity.

## Optional local Agent control

Agent control is off by default and requires a separately installed Native
Messaging host bound to the exact extension ID. While enabled, other processes
running as the same operating-system user can use the local CLI to read or
change TabPlex data through the extension's validated commands. The bridge uses
an owner-only Unix socket in the currently supported macOS installer and exposes
no HTTP, WebSocket, or TCP port. Turning the setting off disconnects the host.

Do not enable Agent control on an operating-system account shared with people or
software you do not trust.

## Permissions

- `tabs`, `tabGroups`, and `windows`: capture and restore the current browser
  workspace and its group structure.
- `storage` and `unlimitedStorage`: keep local workspaces, settings, and recovery
  state.
- `alarms`: resume bounded recovery and maintenance work after an MV3 service
  worker stops.
- `nativeMessaging` (requested at runtime): connect to the optional local Agent
  component only after the user enables it.

## User control

Users can edit or delete workspaces, empty the trash after confirmation, export
a portable backup, disable Agent control immediately, clear extension data in
the browser, or uninstall the extension. Browser-managed sync retention is
controlled by the browser account and its sync settings.

## Reports and changes

Do not place browsing history, private URLs, backups, credentials, or Agent
connection material in a public issue. Follow [SECURITY.md](SECURITY.md) for
private vulnerability reports. Material policy changes will be published in
this file with the applicable extension release.
