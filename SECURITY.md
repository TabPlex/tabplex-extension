# Security Policy

## Supported versions

Security fixes are applied to the latest published TabPlex extension release.
Older builds may not receive backports.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability or include live
credentials, pairing codes, exported backups, browsing history, or private URLs
in a report.

Use GitHub's private security-advisory reporting for this repository when it is
available. Otherwise, email `dvdx@foxmail.com` with:

- the affected version and browser;
- a concise reproduction;
- the impact you observed;
- any suggested mitigation; and
- only synthetic test data.

We will acknowledge the report, investigate it privately, and coordinate a fix
and disclosure before asking for public details.

## Scope notes

The optional Agent control channel is disabled by default. When enabled, the
extension connects to the `com.tabplex.agent` Native Messaging host registered
for that exact extension ID. The host exposes no HTTP, WebSocket, or TCP
listener. The currently supported macOS installer uses an owner-only Unix
socket for its CLI bridge.

The trust boundary is the current operating-system user: another process
running as that same user can call the local CLI while Agent control is enabled.
Turning Agent control off disconnects the Native Messaging host. Requests still
pass through the extension's command parser, size limits, destructive-action
confirmation, workspace revision checks, and serialized write paths.

Reports about Native Messaging registration, extension-ID binding, socket or
file permissions, same-user capability escalation, command validation,
unexpected persistence after disabling Agent control, or unintended data
exposure are in scope.

## Release security baseline

Release bundles must remain Manifest V3, declare no host permissions or content
scripts, use the repository's extension-page CSP, contain no source maps or
embedded cloud credentials, pass `pnpm audit:prod`, and pass
`pnpm verify:release-artifacts`. Permission changes require explicit review.

A plain `pnpm audit` also includes Plasmo, Parcel, Vitest, and other development
tooling. Review those findings separately against the code paths this React
extension actually uses; do not describe a toolchain advisory as shipped
runtime exposure without that analysis.
