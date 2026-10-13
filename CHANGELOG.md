# Changelog

This project follows a release-note format based on user-visible changes.

## 1.0.5 - 2026-10-13

### 新增

- 为每个笔记编辑窗口保留本机草稿；保存失败或页面关闭后，可重新打开并明确选择恢复草稿。
- 在 Home 工具栏增加回收站入口，搜索栏明确显示新建工作区选项。

### 修复

- 防止工作区切换时笔记内容错配，并在离开 Home 时重试所有待保存笔记。
- 排除已保存的重复草稿后再选择恢复内容，避免新版副本遮住旧的未保存草稿。
- 永久删除和清空回收站时清除已关闭编辑窗口的草稿；保留失败清理任务供重试，并拒绝对已删除工作区的迟到笔记保存。
- 空工作区也进入回收站并可恢复，避免包含笔记的空工作区被直接删除。
- 为标签移动、删除和 Agent 按索引排除操作增加版本保护，防止过期索引误操作。
- 标签操作失败时保留并发修改，回滚后阻止旧窗口覆盖恢复结果。
- 统一 Popup、Home 和命令面板的搜索行为，支持网页与笔记搜索，并优先匹配完整工作区名称。
- 统一同名判断、快速创建和回车行为，改善中文输入与键盘导航，并防止重复触发快速创建。

### 兼容性与权限

- 新增 `offscreen` 权限，用于 Home 关闭后的本机草稿清理；最低 Chrome 版本为 109。
- Agent 按索引删除、移动或排除标签时必须传入 `expectedTabsRevision`；按 URL 排除标签仍可省略版本。

## 1.0.4 - 2026-08-17

### Added

- Localize the extension name and browser/store summary for English and
  Simplified Chinese while preserving the independent in-app language setting.

## 1.0.3 - 2026-08-16

### Fixed

- Keep workspace and webpage-list deletion disabled while a workspace is
  opening, and explain the temporary lock on hover or keyboard focus.
- Keep the toolbar quick switcher open while maintaining the pinned Home tab,
  and create Home once during the first installation.

## 1.0.2 - 2026-08-10

### Changed

- Pin Chrome and Edge production packages to the Chrome Web Store public key,
  so GitHub releases from this version onward keep the extension ID
  `cgenkcelnlbjbnpmembeekfjcldfagbh`.
- Simplify the feedback copy and add the official X and GitHub links beneath
  the copy-log and email actions.

### Fixed

- Keep the social icons aligned with the feedback description instead of
  wrapping into a detached footer row.

## 1.0.1 - 2026-08-09

### Changed

- Request Native Messaging only when the user explicitly enables optional
  Agent control, and remove the permission again when the feature is disabled.
- Align release metadata, contact details, and the official homepage with the
  store-ready build.

### Fixed

- Publish the post-1.0.0 workspace-switch reliability fixes under a distinct
  version so one release number never identifies different binaries.

## 1.0.0 - 2026-08-09

### Added

- Current-window workspaces with portable Chrome tab-group restoration and
  stale-window write protection.
- Local backup v3 with bounded validation, checksum checks, preview,
  transactional recovery, and startup rollback after interruption.
- Global workspace, tab, resource, and note search.
- Optional, off-by-default Native Messaging Agent control for local workflows.

### Changed

- Workspace switching now persists recovery state before destructive tab
  operations and can recover interrupted MV3 service-worker runs.
- Chrome and Edge use the same local-first feature set and release checks.

### Security

- Added strict internal-message validation and scoped Agent capabilities, replay
  protection, rate limiting, audit records, and immediate revocation.
