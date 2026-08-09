<p align="center">
  <img src="./assets/icon.png" width="104" height="104" alt="TabPlex 图标" />
</p>

<h1 align="center">TabPlex</h1>

<p align="center">
  面向 Chrome 与 Edge 的本地优先、可恢复任务工作区。
</p>

<p align="center">
  <a href="https://www.tabplex.com/zh">官网</a> ·
  <a href="./README.md">English</a> ·
  <strong>简体中文</strong> ·
  <a href="./PRIVACY.md">隐私政策</a>
</p>

<p align="center">
  <a href="https://github.com/TabPlex/tabplex-extension/actions/workflows/ci.yml">
    <img src="https://github.com/TabPlex/tabplex-extension/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI 状态" />
  </a>
</p>

<p align="center">
  <img src="./assets/readme/workspace-switch-demo.gif" width="1024" alt="TabPlex 工作区切换演示" />
</p>

<p align="center">
  <sub>真实插件演示：在当前窗口切换整套任务上下文。</sub>
</p>

TabPlex 将一个浏览器任务的标签页、标签组、笔记、关联资源和恢复历史保存为
一个工作区。切换只作用于当前普通浏览器窗口，不会干扰其他窗口。

## 功能

- 保存完整任务工作区，并保留可迁移的标签组信息。
- 通过持久化恢复日志切换当前窗口，切换中断后可安全恢复或回滚。
- 搜索工作区名称、标签页标题与网址、关联资源和笔记。
- 通过时间线、回收站和本地备份找回较早状态。
- 导出和恢复 v3 便携备份，包含有界解析、SHA-256 损坏校验、预览和事务回滚。
- 使用浏览器快捷键，以及默认关闭的可选本地 Agent 控制通道。

## 隐私与存储

当前扩展不包含 TabPlex 账号、分析客户端、远程工作区 API、云同步运行时或后台
上传链路。

工作区内容与恢复数据保存在 `chrome.storage.local`；临时窗口绑定使用
`chrome.storage.session`；少量可迁移偏好使用浏览器管理的
`chrome.storage.sync`。只有用户主动导出时才会写出备份文件。

`unlimitedStorage` 权限仅移除 Chrome 对扩展本地存储的固定额度，不会授予网站
内容访问能力，也不会启用网络上传。完整边界见[隐私政策](./PRIVACY.md)。

## 本地运行

请使用 Node 24，以及 `package.json` 声明的 pnpm 版本。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

打开 `chrome://extensions`，启用**开发者模式**，选择**加载已解压的扩展程序**，
然后加载 `build/chrome-mv3-dev`。

生成优化构建：

```bash
pnpm build:chrome
pnpm build:edge
```

Chrome 加载 `build/chrome-mv3-prod`，Edge 加载
`build/edge-mv3-prod`。

## 验证与打包

```bash
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
pnpm package:chrome
pnpm package:edge
```

测试只保护稳定业务契约，例如存储与备份、消息处理、队列、切换状态机和高代价
交互。新增测试前请阅读[测试规范](./docs/testing-standards.md)。

## 可选本地 Agent 控制

Agent 控制默认关闭。它使用 Chrome Native Messaging 和仅限当前用户访问的 Unix
socket，不会暴露 HTTP、WebSocket、MCP 或 TCP 端口。只有主动开启功能时，Chrome
才会申请 Native Messaging 权限；关闭功能时会再次移除该权限。先为当前加载的
扩展 ID 安装本地主机：

```bash
pnpm agent:install -- --extension-id=<chrome-extension-id>
```

Edge 需追加 `--browser=edge`。随后打开**设置 → 控制**并启用
**Agent 控制**。

```bash
pnpm agent -- help
pnpm agent -- getState
pnpm agent -- switchWorkspace '{"workspaceId":"<id>"}'
```

本地主机只接受安装时绑定的扩展 ID。永久删除命令需要明确确认；备份恢复与浏览器
快捷键分配仍保留为人工确认的界面流程。

## 快捷键

- 打开主页 / 切换器：`Alt+H`
- 快速新建工作区：`Alt+N`
- 上一个工作区：`Alt+Up`
- 下一个工作区：`Alt+Down`

可在 `chrome://extensions/shortcuts` 中自定义快捷键。

## 贡献与许可证

参与贡献前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 和
[行为准则](./CODE_OF_CONDUCT.md)。安全问题请按
[SECURITY.md](./SECURITY.md) 中的私密流程报告。

TabPlex 使用 [AGPL-3.0-only](./LICENSE) 许可证。随包依赖声明见
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
