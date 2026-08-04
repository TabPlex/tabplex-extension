# Repository Guidelines

## Project Structure & Module Organization

- `src/` holds all runtime TypeScript. `src/components/` contains popup views (for example, `HomeView.tsx` and `TimelineView.tsx`), `src/hooks/` houses shared hooks such as `useWorkspaceManager.ts`, and `src/background/index.ts` registers the background service. Entry points like `popup.tsx` and `options.tsx` live at the project root for Plasmo to discover.
- `styles/` stores surface-specific CSS (`popup.css`, `timeline.css`, etc.). Keep new styles grouped by surface to avoid leaking globals.
- `lib/common.ts` is the current home for reusable helpers; prefer expanding this module over duplicating logic.
- Static assets reside in `assets/` (e.g., `icon.png`). Plasmo outputs compiled bundles into `build/`; treat that directory as generated.

## Build, Test, and Development Commands

- `pnpm dev` — launches the Plasmo dev server and writes hot-reloadable builds under `build/<browser>-mv3-dev`.
- `pnpm build` — generates production-ready bundles in `build/` with optimized assets.
- `pnpm package` — creates zipped artifacts for marketplace submission; run after a clean `pnpm build`.

## 开发验证模式（团队约定）

- 沟通语言为中文（需求、说明、变更记录优先中文）。
- 需要让他人直接加载 **prod** 进行验证时：先停止 `pnpm dev`，确保 `.env` 含 Supabase 变量，再运行 `pnpm build`，加载 `build/chrome-mv3-prod`。
- 此模式下，`package.json` 的 `description` 必须写成“本次测试范围”的中文说明（短句），而不是正式产品文案。

## Coding Style & Naming Conventions

- We write in TypeScript + React, formatted by Prettier with `@ianvs/prettier-plugin-sort-imports`. Run `pnpm format` before committing; this enforces 2-space indentation and sorted import groups.
- Use `PascalCase` filenames for React components, `camelCase` for hooks and utilities, and prefix all hooks with `use`. Favor default exports for entry components and named exports for shared utilities.
- Prefer the `~` path alias (see `tsconfig.json`) for root-relative imports to keep import trees tidy.

## Testing Guidelines

- Use `pnpm test` for the retained high-signal Vitest suite.
- Only keep or add tests that protect stable business contracts: pure logic, storage migration/serialization, background message handlers, queues, and state machines.
- Do not add tests that read source files with regex, assert static JSX/className fragments, or guard README / workflow text. Those tests create maintenance cost without meaningful regression protection.
- Prefer colocated `*.test.ts` files for logic modules. Add `*.test.tsx` only when the test validates real interaction behavior rather than static markup.
- UI detail changes should default to manual smoke testing in Chrome unless the interaction is expensive to verify manually or easy to regress.
- Detailed rules live in `docs/testing-standards.md`; treat that document as the source of truth for future test additions and deletions.

## Workspace Handling Notes

- Tab capture and switching logic now respects Chrome's `pendingUrl`, preventing in-flight navigations from being dropped when switching workspaces.
- Bulk tab moves share `prepareTabMove` in `lib/workspaceUtils.ts`; reuse it when extending batch operations to keep pinned tabs untouched.

## Commit & Pull Request Guidelines

- Use imperative, concise commit subjects (for example, `Add timeline hover state`) and keep any body wrapped at ~72 characters. Reference tracking tickets with `Refs #123` when relevant.
- Pull requests should describe scope, list manual verification steps, and attach screenshots or recordings for UI updates. Call out manifest permission changes explicitly so reviewers can validate browser prompts.
- Request reviews from owners of affected modules (`src/components`, `lib/`, etc.) and ensure lint/format commands have been run before submitting.
