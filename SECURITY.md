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

The optional Agent control channel is intentionally limited to the fixed
`http://127.0.0.1:17655/tabplex-agent` loopback page and requires an explicit,
short-lived pairing session. Reports about origin validation, capability
escalation, replay protection, or unintended data exposure are in scope.
