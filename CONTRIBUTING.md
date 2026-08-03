# Contributing

Thanks for helping improve TabPlex. Keep changes focused and describe the user
problem they solve.

## Local checks

Use Node 24 and pnpm 10, then run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm typecheck:unused
pnpm typecheck:strictnull:core
pnpm test
pnpm build:chrome
pnpm build:edge
```

Tests should protect stable behavior such as migrations, storage transactions,
message handlers, queues, and state machines. Avoid source-text or static CSS
assertions. UI-only changes should include concise Chrome and Edge smoke-test
steps and screenshots when visual behavior changes.

Never commit real credentials, exported user backups, browsing history, or Agent
pairing/session material. Run `pnpm scan:secrets` before opening a pull request.

By contributing, you agree that your contribution is licensed under the
repository's AGPL-3.0-only license.
