# TabPlex 设计 QA

日期：2026-07-11  
范围：Chrome / Edge 扩展的 Home、Settings、Recovery Center 与 Options；深色、浅色、键盘、减少动画、强制颜色与响应式状态。

## 设计基线与实现证据

旧版设计基线：

- `/tmp/tabplex-ui-audit-20260711/02-usable-version-ui.png` — Home，1440×900，深色。
- `/tmp/tabplex-ui-audit-20260711/04-usable-version-settings.png` — Settings，1440×900，深色。

最终实现：

- `/tmp/tabplex-ui-audit-20260711/33-final-home-token-separated.png` — Home，1440×900，深色。
- `/tmp/tabplex-ui-audit-20260711/35-final-home-token-separated-1024.png` — Home，1024×900。
- `/tmp/tabplex-ui-audit-20260711/36-final-home-token-separated-640.png` — Home，640×900。
- `/tmp/tabplex-ui-audit-20260711/37-final-home-token-separated-focus.png` — Home 搜索框键盘焦点。
- `/tmp/tabplex-ui-audit-20260711/34-final-options-token-separated.png` — Options，1440×900，深色。
- `/tmp/tabplex-ui-audit-20260711/26-final-options-light.png` — Options，1440×900，浅色。
- `/tmp/tabplex-ui-audit-20260711/25-final-display-create-focus.png` — 新建虚拟窗口与输入焦点。
- `/tmp/tabplex-ui-audit-20260711/32-final-note-clear-focus-clean.png` — 备注清空按钮焦点。
- `/tmp/tabplex-ui-audit-20260711/31-final-selection-actions-active.png` — 选择工具栏、移动与独立窗口操作。
- `/tmp/tabplex-ui-audit-20260711/09-recovery-preview.png` — Recovery Center 预览状态。

## 对比结论

第一轮旧版与改版对比发现：新版层级变平、嵌套边框过多、设置弹窗承载过重；部分操作仅 28px，工作区列表缺少标题。这些问题均已修复。

第二轮将旧版 Home 与最终 Home 放在同一比较输入中复核。最终版恢复旧版的三层结构、柔和深色表面、24/16px 圆角、紫色主操作与克制阴影，同时保留新功能的信息密度。Options 改为完整设置页是有意的信息架构升级，但颜色、间距、控件与旧版保持同一设计语言。

焦点对比确认：修复前的新建虚拟窗口输入框无清晰焦点；修复后为 2px 高对比轮廓并保留 2px offset。1024px 与 640px 下无横向溢出，窄屏改为纵向排列并保留内部滚动。

## 逐项核验

- 字体与层级：标题、元信息、正文和辅助文案层级清晰；Settings 使用 `h1/h2`，对话框使用 `h3`。
- 布局与间距：Home 保持左侧工作区、中央标签、右侧上下文的旧版心智模型；设置页按任务分区；触控目标不小于 40px。
- 色彩与令牌：主操作使用原始 accent；表面文本与焦点使用独立的 `primary-readable`；预设色与极端自定义色均满足 4.5:1 文本对比测试。
- 图标与资源：沿用现有图标库与真实站点 favicon，不使用临时图形或占位资产。
- 文案与反馈：创建、重命名、删除、清空均在当前上下文显示 status/alert；失败时焦点进入可修复位置。
- 键盘与语义：输入、编辑器、图标按钮、进度条、select、分隔条均有可访问名称；分隔条支持方向键、Home、End；Escape 关闭对话框并返回触发器。
- 非拖拽替代：选择工具栏可将标签移动到其他工作区或独立窗口。
- 动效：`prefers-reduced-motion: reduce` 下运动时长降为 0.01ms，无被隐藏的主内容；普通模式保持轻量过渡。
- 强制颜色：`forced-colors: active` 下控件边框与 2px 键盘焦点可见，无横向溢出。
- 浏览器：Chrome 与 Edge 的 Home / Options 均完成加载，Manifest V3，未发现运行时异常或未解析模块文本。

## 缺陷分级

- P0：0
- P1：0
- P2：0
- P3：Options 从旧版弹窗升级为完整页；640px 顶栏纵向排列。两项均为有意的响应式/信息架构取舍，不阻塞发布。

2026-07-11 result: passed（历史基线）

## 2026-07-12 Settings borderless 调整

本轮依据用户反馈重新收敛 Settings：弹窗改为单列、仅保留常用设置，并将虚拟窗口管理放回独立 Options 页；设置卡片、选择框、文本输入框与次级操作移除常驻描边，键盘焦点仍使用清晰的强调色提示，强制颜色模式保留真实 outline。

当前代码、类型检查、交互测试与 Chrome / Edge 生产构建均已通过。由于 ChatGPT Chrome 插件的本机 Native Host 当前不可用，本轮尚未完成新版本的同视口截图对比；此前截图只能作为历史设计基线，不能作为 2026-07-12 调整后的视觉通过证据。

2026-07-12 visual result: pending Chrome / Edge manual smoke
