import { homedir } from "node:os"
import { join, resolve } from "node:path"

export const AGENT_PROTOCOL_VERSION = 1
export const NATIVE_HOST_NAME = "com.tabplex.agent"

export const getAgentStateDirectory = ({
  platform = process.platform,
  homeDirectory = homedir()
} = {}) => {
  if (process.env.TABPLEX_AGENT_STATE_DIR) {
    return resolve(process.env.TABPLEX_AGENT_STATE_DIR)
  }
  if (platform === "darwin") {
    return join(
      homeDirectory,
      "Library",
      "Application Support",
      "TabPlex",
      "Agent"
    )
  }
  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA
    return join(localAppData || homeDirectory, "TabPlex", "Agent")
  }
  return join(homeDirectory, ".local", "share", "tabplex", "agent")
}

export const getAgentConnectionPath = (options) =>
  join(getAgentStateDirectory(options), "connection.json")

export const getAgentSocketDirectory = () => {
  if (process.env.TABPLEX_AGENT_SOCKET_DIR) {
    return resolve(process.env.TABPLEX_AGENT_SOCKET_DIR)
  }
  const userId =
    typeof process.getuid === "function" ? process.getuid() : "user"
  return join("/tmp", `tabplex-${userId}`)
}

export const getAgentSocketPath = (extensionId, options) => {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\tabplex-agent-${extensionId}`
  }
  return join(getAgentSocketDirectory(options), `agent-${extensionId}.sock`)
}

export const isExtensionId = (value) =>
  typeof value === "string" && /^[a-p]{32}$/.test(value)
