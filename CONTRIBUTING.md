# Contributing

Thanks for helping improve TabPlex. Keep changes focused and describe the user
problem they solve.

## Local checks

Use Node 24 and pnpm 10, then run:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm scan:secrets
pnpm licenses:check
pnpm audit:prod
pnpm typecheck
pnpm typecheck:unused
pnpm typecheck:strictnull:core
pnpm test
pnpm build:chrome
pnpm build:edge
pnpm smoke:extension-pages -- build/chrome-mv3-prod build/edge-mv3-prod
pnpm verify:artifacts -- build/chrome-mv3-prod build/edge-mv3-prod
```

Tests should protect stable behavior such as migrations, storage transactions,
message handlers, queues, and state machines. Avoid source-text or static CSS
assertions. UI-only changes should include concise Chrome and Edge smoke-test
steps and screenshots when visual behavior changes.
[The testing standards](docs/testing-standards.md) are the source of truth for
what belongs in the suite.

Never commit real credentials, exported user backups, browsing history, or Agent
pairing/session material. Run `pnpm scan:secrets` before opening a pull request.

By contributing, you agree that your contribution is licensed under the
repository's AGPL-3.0-only license.

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Suspected
security vulnerabilities must follow [SECURITY.md](SECURITY.md) instead of a
public issue.
