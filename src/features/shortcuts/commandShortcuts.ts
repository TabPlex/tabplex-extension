const SHORTCUTS_MANAGER_URL = "chrome://extensions/shortcuts"

type CommandsApi = typeof chrome.commands & {
  getAll?: (callback: (items: chrome.commands.Command[]) => void) => void
}

const getCommandsApi = () => chrome?.commands as CommandsApi | undefined

export const loadCommandShortcuts = async () => {
  const commandsApi = getCommandsApi()
  if (!commandsApi?.getAll) {
    return { commands: [] as chrome.commands.Command[], available: false }
  }

  try {
    const commands = await new Promise<chrome.commands.Command[]>((resolve) => {
      commandsApi.getAll?.((items) => resolve(items ?? []))
    })

    return {
      commands: commands.filter((item) => !!item?.name),
      available: true
    }
  } catch (error) {
    console.warn("[TabPlex] 无法读取快捷键", error)
    return { commands: [] as chrome.commands.Command[], available: false }
  }
}

export const openShortcutsManager = () => {
  try {
    chrome?.tabs?.create?.({ url: SHORTCUTS_MANAGER_URL })
  } catch (error) {
    console.warn("[TabPlex] 打开快捷键设置页失败", error)
  }
}
