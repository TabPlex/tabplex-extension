---
name: tabplex-agent-control
description: 使用 TabPlex Native Messaging CLI 查看或操作浏览器工作区、标签页、备注、时间线与可迁移设置。用户要求 Codex 或其他本机 Agent 控制 TabPlex 时使用。
---

# TabPlex Agent Control

通过项目自带 CLI 调用 TabPlex；不要直接修改 Chrome profile、LevelDB、`chrome.storage` 或备份文件。CLI 会让扩展复用现有窗口绑定、`tabsRevision`、写入队列和失败恢复。

## 准备

1. 在 TabPlex 设置的“控制”中确认“Agent 控制”已开启。
2. 优先使用已经安装到当前 macOS 用户目录的 CLI：

```bash
"$HOME/Library/Application Support/TabPlex/NativeMessaging/tabplex-agent" getState
```

3. 若 CLI 不存在，取得当前扩展 ID，在 TabPlex 源码目录运行一次：

```bash
pnpm agent:install -- --extension-id=<extension-id>
```

4. 安装后让用户关闭并重新开启一次“Agent 控制”。不要启动 HTTP 服务，也不要配置 MCP。

## 操作顺序

每次任务先读取当前状态：

```bash
pnpm agent -- getState
```

从结果中取得 `controlWindowId`、工作区 ID、当前窗口绑定和 `supportedCommands`。后续命令默认作用于当前 normal Chrome 窗口；必须固定目标窗口时追加 `--window-id=<id>`。

命令格式：

```bash
pnpm agent -- <command> '<payload-json>' [--window-id=<id>]
```

常用命令：

```bash
pnpm agent -- searchWorkspaces '{"query":"research"}'
pnpm agent -- getWorkspace '{"workspaceId":"<id>"}'
pnpm agent -- createWorkspace '{"name":"Research"}'
pnpm agent -- switchWorkspace '{"workspaceId":"<id>"}'
pnpm agent -- renameWorkspace '{"workspaceId":"<id>","name":"New name"}'
pnpm agent -- setWorkspaceNote '{"workspaceId":"<id>","note":"Notes"}'
pnpm agent -- captureWorkspaceTabs '{"workspaceId":"<id>"}'
pnpm agent -- openWorkspaceTab '{"workspaceId":"<id>","tab":{"url":"https://example.com"}}'
```

运行 `pnpm agent -- help` 可查看完整命令名。其他 payload：

- `setWorkspaceColor`: `{"workspaceId":"<id>","color":"#0EA5E9"}`，清除颜色使用 `null`。
- `setWorkspaceEmoji`: `{"workspaceId":"<id>","emoji":"🧠"}`，清除图标使用 `null`。
- `setWorkspaceExcluded`: `{"workspaceId":"<id>","excluded":true}`。
- `trashWorkspace` / `restoreWorkspace` / `createWorkspaceSnapshot`: `{"workspaceId":"<id>"}`。
- `restoreWorkspaceSnapshot`: `{"workspaceId":"<id>","snapshotId":"<id>"}`。
- `setTabExcluded`: `{"workspaceId":"<id>","tabIndexOrUrl":0,"excluded":true}`。
- `removeWorkspaceTabs`: `{"workspaceId":"<id>","tabIndexes":[0,1]}`。
- `moveWorkspaceTabs`: `{"sourceId":"<id>","targetId":"<id>","tabIndexes":[0,1]}`。
- `replaceWorkspaceTabs`: `{"workspaceId":"<id>","tabs":[{"url":"https://example.com"}]}`。
- `updateSetting`: key 仅支持 `theme`、`language`、`accentColor`、`workspaceSort`。
- `openHome`、`openSettings`、`openShortcuts` 不需要 payload。

## 安全规则

- 用户没有明确要求时，优先 `trashWorkspace`，不要永久删除。
- `deleteWorkspace` 必须传 `{"workspaceId":"<id>","confirm":true}`；`emptyTrash` 必须传 `{"confirm":true}`。
- 修改前使用 `getState` 或 `getWorkspace` 核对 ID，修改后再次读取验证结果。
- 不通过 Agent 命令修改 Agent 开关、开发者开关、备份恢复或浏览器快捷键。
- CLI 返回失败时报告原始错误码；不要绕过校验直接改存储。
