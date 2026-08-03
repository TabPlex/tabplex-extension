const safeExtensionId = (extensionId: string) =>
  /^[a-p]{32}$/.test(extensionId) ? extensionId : "<TABPLEX_EXTENSION_ID>"

export const createAgentControlInstructions = (
  extensionId: string
) => `# TabPlex Agent 控制

请为当前本机 Agent 创建并启用一个名为 \`tabplex-agent-control\` 的 Skill，把下面的规则作为该 Skill 的执行说明。如果当前环境不支持持久化 Skill，则在本次会话中按同样规则操作。

使用 TabPlex 自带的 Native Messaging CLI 操作插件。不要直接修改 Chrome 配置、LevelDB 或 chrome.storage 数据。

默认直接调用已经安装到当前 macOS 用户目录的 CLI：

"$HOME/Library/Application Support/TabPlex/NativeMessaging/tabplex-agent" help
"$HOME/Library/Application Support/TabPlex/NativeMessaging/tabplex-agent" getState
"$HOME/Library/Application Support/TabPlex/NativeMessaging/tabplex-agent" <command> '<payload-json>'

如果 CLI 不存在，才需要在 TabPlex 源码目录执行一次：

pnpm agent:install -- --extension-id=${safeExtensionId(extensionId)}

然后让用户在 TabPlex「设置 → 控制」中开启“Agent 控制”。开关是唯一授权边界：开启时，本机同一用户下的 Agent 可以调用；关闭后立即断开。

每次任务先调用 getState 获取当前窗口、工作区 ID 和支持的命令，再使用 ID 执行操作。涉及永久删除工作区或清空回收站时，payload 必须显式包含 confirm: true；用户没有明确要求时不得执行永久删除。

Native Host 未连接时，先执行安装命令，再让用户关闭并重新开启一次“Agent 控制”。所有写操作必须通过 CLI，让 TabPlex 自己执行版本校验、窗口绑定、写入队列与失败恢复。`
