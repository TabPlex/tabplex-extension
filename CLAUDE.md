# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 语言和沟通规范 / Language and Communication Guidelines

**重要：在此代码库中工作时，请遵循以下语言规范：**

- **用中文回答问题** - 与用户交流时使用中文
- **用中文编写代码注释** - 所有新增或修改的代码注释应使用中文
- 代码本身（变量名、函数名等）使用英文，遵循现有代码风格

## Project Overview

**TabPlex** is a Chrome browser extension built with the Plasmo framework for managing browser tabs and local workspaces. Cloud sync is a roadmap item and is not present in the current runtime.

**Tech Stack:**

- Plasmo 0.90.5 (browser extension framework)
- React 18.2.0 + TypeScript 5.3.3
- TailwindCSS 3.4.17 + shadcn/ui components
- Legacy Supabase SQL assets (inactive; no runtime client or authentication)
- Vitest 3.2.4 (testing)

## Common Development Commands

```bash
# 开发模式（热重载）
pnpm dev

# 生产构建
pnpm build

# 创建市场提交包
pnpm package

# 运行测试（带覆盖率）
pnpm test

# 代码格式化
pnpm exec prettier --write .
```

### Loading the Extension in Browser

1. Run `pnpm dev` to create development build
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select `build/chrome-mv3-dev` directory

## High-Level Architecture

### Background Service Orchestration

The extension uses a **background service worker** ([src/background/index.ts](src/background/index.ts)) as the central orchestration hub:

- **Message Router**: Handles messages from UI (popup/options) and routes to appropriate handlers
- **Lifecycle Manager**: Initializes core services on startup, handles Chrome extension events
- **Home Tab Manager**: Ensures a pinned "home" tab exists in the managed window

**Key Services:**

1. **WorkspaceController** ([src/background/workspaceController.ts](src/background/workspaceController.ts))

   - 核心工作区管理器，负责工作区切换和自动同步
   - Transaction-based workspace switching with progress tracking (phases: opening → loading → done/aborted)
   - Auto-sync logic: listens to tab events and coalesces updates to avoid excessive writes
   - Queue system prevents concurrent switches

2. **TabOrchestrator** ([src/background/services/TabOrchestrator.ts](src/background/services/TabOrchestrator.ts))

   - 低级标签页操作服务
   - Smart tab reuse: matches existing tabs by normalized URL to avoid unnecessary reloads
   - Batched operations: opens tabs in batches (BATCH_SIZE=3) to avoid overwhelming browser
   - Home tab protection during switches

3. **Queue Systems** ([lib/workspacesQueue.ts](lib/workspacesQueue.ts), [src/background/workspaceStateQueue.ts](src/background/workspaceStateQueue.ts))
   - 防止并发存储操作的竞态条件
   - Serializes all workspace array mutations and state patches
   - Uses promise chaining for sequential execution

### Cloud Sync Status

Cloud sync is not implemented in the current extension. There is no Supabase
client, Auth/OTP flow, entitlement consumer, sync scheduler, or remote snapshot
transport. Files under `supabase/oss` are inactive design history; follow
[`supabase/README.md`](supabase/README.md) before touching them. Do not infer a
runtime feature from SQL assets or reintroduce an anonymous email eligibility
RPC.

### State Management and Communication

**Storage Architecture:**

- `chrome.storage.local`: Large data (workspaces and workspace state)
- `chrome.storage.sync`: Small synced data (settings only)

**Communication Patterns:**

1. **Message Passing** (chrome.runtime.sendMessage):

   - UI sends structured commands to background (workspace-switch, workspaces-apply, etc.)
   - Background validates and executes, responds with success/failure

2. **Storage Events** (chrome.storage.onChanged):

   - Both background and UI listen for storage changes
   - Enables reactive updates across contexts

3. **React Hooks Layer**:
   - `useWorkspaceManager` ([src/hooks/useWorkspaceManager.ts](src/hooks/useWorkspaceManager.ts)): Main hook for UI, provides reactive state
   - `useWorkspaceActions` ([src/features/workspace/hooks/useWorkspaceActions.ts](src/features/workspace/hooks/useWorkspaceActions.ts)): Encapsulates all mutation operations

### Key Design Patterns

1. **Event-Driven Architecture**: Background service reacts to events (tab changes, storage changes, alarms)
2. **Message Passing with Command Pattern**: UI sends structured commands, background executes
3. **Queue-Based Concurrency Control**: Serializes storage writes to prevent race conditions
4. **Transaction-Based State Machines**: Workspace switching uses explicit transaction with phases
5. **Smart Caching with Invalidation**: Background caches workspaces/settings, invalidates on storage changes

## Path Aliases

The project uses TypeScript path aliases (defined in [tsconfig.json](tsconfig.json)) for cleaner imports:

```typescript
~components/*  → ./src/components/*
~hooks/*       → ./src/hooks/*
~lib/*         → ./lib/*
~core/*        → ./src/core/*
~features/*    → ./src/features/*
~shared/*      → ./src/shared/*
~styles/*      → ./styles/*
~src/*         → ./src/*
~*             → ./*
```

**Usage**: Prefer `~` aliases for root-relative imports to keep import trees tidy.

## Critical Files and Their Roles

- [src/background/index.ts](src/background/index.ts) - Background service entry point, message router
- [src/background/workspaceController.ts](src/background/workspaceController.ts) - Workspace orchestration and auto-sync
- [src/background/services/TabOrchestrator.ts](src/background/services/TabOrchestrator.ts) - Low-level tab manipulation
- [src/features/workspace/hooks/useWorkspaceActions.ts](src/features/workspace/hooks/useWorkspaceActions.ts) - UI mutation operations
- [lib/workspaceUtils.ts](lib/workspaceUtils.ts) - Core utilities (prepareTabMove, etc.)
- [supabase/README.md](supabase/README.md) - Inactive SQL status and entitlement security contract

## Important Architectural Considerations

### MV3 Service Worker Constraints

- Background service worker can be suspended by Chrome
- Use `chrome.alarms` API for periodic tasks (not setTimeout)
- Coalesce updates to avoid excessive writes during suspension

### Queue Systems for Race Condition Prevention

- Always use `workspacesQueue` for workspace array mutations
- Always use `workspaceStateQueue` for workspace state patches
- Never directly write to storage without queuing

### Transaction-Based Workspace Switching

- Switching is a complex transaction with phases: opening → loading → done/aborted
- Track progress with detailed counts (opened, completed, failed)
- Timeout protection (60s) via Chrome alarms
- Handle abort scenarios (window closed, superseded by new switch)

### Home Tab Management

- Extension maintains a pinned "home" tab (popup.html?mode=home)
- Prevents navigation away from home tab (creates new tab instead)
- Single-window mode with managed window tracking
- Deduplicates home tabs automatically

### Tab Capture with pendingUrl

- Tab capture respects Chrome's `pendingUrl` to prevent navigation drops
- Use `prepareTabMove` in [lib/workspaceUtils.ts](lib/workspaceUtils.ts) for bulk tab moves
- Keep pinned tabs untouched during operations

## Additional Documentation

For detailed coding style, testing guidelines, and commit conventions, see [AGENTS.md](AGENTS.md).
