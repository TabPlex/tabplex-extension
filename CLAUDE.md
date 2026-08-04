# CLAUDE.md

Claude Code 在本仓库中的唯一完整协作规范是 [AGENTS.md](AGENTS.md)。请先
阅读并遵守它；不要在本文件复制依赖版本、测试清单或易过期的实现细节。

## 沟通与改动边界

- 与用户使用中文沟通。
- 保留现有功能、数据兼容性和 Chrome/Edge Manifest V3 约束。
- `build/` 与 `.plasmo/` 是生成目录，不直接编辑。
- 依赖版本以 `package.json` 和 `pnpm-lock.yaml` 为准。
- 测试边界以 [docs/testing-standards.md](docs/testing-standards.md) 为准。

## 常用命令

```bash
pnpm dev
pnpm format:check
pnpm typecheck
pnpm typecheck:unused
pnpm typecheck:strictnull:core
pnpm test
pnpm build:chrome
pnpm build:edge
```

Chrome 与 Edge 的 Plasmo 构建要顺序执行。需要校验生产目录时运行：

```bash
pnpm verify:artifacts -- build/chrome-mv3-prod build/edge-mv3-prod
```

## 不可破坏的架构约束

- 工作区切换只操作请求所在的当前 normal 浏览器窗口。
- `chrome.storage.local` 保存 canonical 工作区；每窗口 binding 位于
  `chrome.storage.session`，旧 revision 不能覆盖新数据。
- 工作区数组、运行状态和恢复事务必须继续经过现有队列与 service 层。
- 标签捕获保留 `pendingUrl` 语义，批量移动复用
  `lib/workspaceUtils.ts` 的 `prepareTabMove`，固定标签保持不动。
- 云同步、登录和订阅仍是 roadmap；不能从 `supabase/` 的历史 SQL 推断为
  当前运行时功能。
