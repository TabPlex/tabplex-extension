import {
  hasAgentControlPermission,
  includesAgentControlPermission,
  removeAgentControlPermission
} from "~core/permissions/agentControlPermission"
import {
  getWorkspaceWindowBinding,
  loadSettings,
  loadWorkspaces,
  loadWorkspaceState,
  migrateLegacyStorage
} from "~core/storage"
import {
  COMMAND_SHORTCUT_MAP,
  DEFAULT_SETTINGS,
  STORAGE_KEYS
} from "~core/types"
import { normalizeShortcutLabel, uuid } from "~core/utils"
import { setLoggerConsoleEnabled } from "~lib/logger"
import {
  applySettingsUpdate,
  withAuxiliaryStorageWriteLock,
  withGlobalStorageWriteBarrier
} from "~lib/storageQueues"
import { applyWorkspacesUpdate } from "~lib/workspacesQueue"

import {
  clearLegacyAgentControlState,
  createAgentControlRuntime,
  createAgentRequestProcessor,
  createAgentWorkspaceFactory,
  disconnectAgentControl,
  registerAgentControlRuntime,
  type AgentControlRuntime
} from "./agentControl"
import { createAgentBackgroundActionBridge } from "./agentControlInternalBridge"
import { reconcileAgentControlPermissionState } from "./agentControlPermissionState"
import { withAgentOperationLock } from "./agentOperationGate"
import { runBackupRestoreCleanupAlarm } from "./backupRestoreCleanup"
import { handleAgentControlMessage } from "./messages/handlers/agentControl"
import { handleBackupRestoreMessage } from "./messages/handlers/backupRestore"
import { createHomeMessageHandlers } from "./messages/handlers/home"
import { handleOnboardingMessage } from "./messages/handlers/onboarding"
import { handlePendingActionMessage } from "./messages/handlers/pendingAction"
import { handleSettingsApplyMessage } from "./messages/handlers/settingsApply"
import {
  handleWorkspaceStatePatchMessage,
  handleWorkspaceSwitchMessage
} from "./messages/handlers/workspace"
import { handleWorkspacesApplyMessage } from "./messages/handlers/workspacesApply"
import { handleWorkspaceWindowOperationMessage } from "./messages/handlers/workspaceWindow"
import { createBackgroundMessageListener } from "./messages/router"
import type {
  BackgroundMessageHandler,
  TabplexMessageType
} from "./messages/types"
import { createBackgroundMessageValidator } from "./messages/validator"
import { isTrustedInternalMessageSender } from "./messageSecurity"
import {
  BACKUP_RESTORE_CLEANUP_ALARM,
  readPendingBackupRestorePhase,
  recoverInterruptedBackupRestore
} from "./services/backupRestoreService"
import {
  getCurrentNormalWindowId,
  openAndPinHomeInCurrentWindow,
  openAndPinHomeInWindow,
  openPinnedHomeAfterInstall,
  registerHomeNavigationListener
} from "./services/homeTabService"
import {
  createStartupRecoveryGate,
  gateBackgroundMessageHandler
} from "./startupRecoveryGate"
import {
  abortCurrentSwitch,
  handleWorkspaceSwitch,
  initWorkspaceController,
  requestWorkspaceSwitch,
  runWorkspaceDataOperation,
  withWorkspaceControllerMaintenance
} from "./workspaceController"

// Start backup-journal reconciliation first, but register controller listeners
// synchronously in the same task. Hydration and all startup side effects wait
// until the durable restore transaction is finalized or rolled back.
const backupRestoreRecoveryReady = recoverInterruptedBackupRestore({
  // The controller has not hydrated yet. Reconcile the backup journal first;
  // only then may controller init inspect and recover its own switch journal.
  abortSwitch: abortCurrentSwitch
}).then(async (result) => {
  try {
    await chrome.alarms.clear(BACKUP_RESTORE_CLEANUP_ALARM)
  } catch (error) {
    console.warn("[TabPlex] 清理旧备份恢复闹钟失败", error)
  }
  if (result.status !== "none") {
    console.info("[TabPlex] 已完成启动备份事务恢复", result.status)
  }
  await withGlobalStorageWriteBarrier(() => migrateLegacyStorage())
  return result
})
const startupRecoveryGate = createStartupRecoveryGate(
  backupRestoreRecoveryReady
)
const workspaceControllerReady = initWorkspaceController(
  startupRecoveryGate.ready
)
let agentControlRuntime: AgentControlRuntime | null = null

const disableAgentControlSetting = async () => {
  await applySettingsUpdate((settings) =>
    settings.agentControlEnabled
      ? { ...settings, agentControlEnabled: false }
      : settings
  )
}

const reconcileAgentControlPermission = () =>
  reconcileAgentControlPermissionState({
    isEnabled: async () => (await loadSettings()).agentControlEnabled === true,
    hasPermission: hasAgentControlPermission,
    removePermission: removeAgentControlPermission,
    disable: disableAgentControlSetting
  })

const waitForStartupRecovery = async (scope: string) => {
  const ready = await startupRecoveryGate.wait()
  if (!ready) console.warn(`[TabPlex] ${scope} 等待启动恢复门失败`)
  return ready
}

const scheduleBackupJournalCleanup = () => {
  void chrome.alarms.create(BACKUP_RESTORE_CLEANUP_ALARM, {
    delayInMinutes: 1
  })
}

if (chrome?.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== BACKUP_RESTORE_CLEANUP_ALARM) return
    void (async () => {
      if (!(await waitForStartupRecovery("备份日志清理"))) return
      try {
        await runBackupRestoreCleanupAlarm({
          readPhase: readPendingBackupRestorePhase,
          recoverCommitted: () =>
            recoverInterruptedBackupRestore({
              abortSwitch: async () => undefined
            }),
          recoverUncommitted: async () => {
            await workspaceControllerReady
            return recoverInterruptedBackupRestore({
              abortSwitch: abortCurrentSwitch,
              withControllerMaintenance: withWorkspaceControllerMaintenance,
              withAgentOperation: withAgentOperationLock
            })
          },
          clearAlarm: () => chrome.alarms.clear(BACKUP_RESTORE_CLEANUP_ALARM),
          scheduleRetry: scheduleBackupJournalCleanup
        })
      } catch (error) {
        console.warn("[TabPlex] 备份恢复日志清理失败，已安排重试", error)
      }
    })()
  })
}

void workspaceControllerReady
  .then(loadSettings)
  .then((settings) => setLoggerConsoleEnabled(!!settings.devMode))
  .catch((error) => console.warn("[TabPlex] 工作区控制器水合失败", error))

try {
  chrome.runtime.onInstalled.addListener(async (details) => {
    try {
      await workspaceControllerReady
    } catch (error) {
      console.warn("[TabPlex] 安装初始化等待恢复门失败", error)
      return
    }
    let settings = DEFAULT_SETTINGS
    try {
      // Re-save through the split allowlist on every install/update so legacy
      // sync records cannot retain device-local Agent or developer switches.
      settings = await applySettingsUpdate((current) => current)
    } catch (err) {
      console.warn("[TabPlex] 初始化设置失败", err)
    }
    void applyCommandShortcuts(settings.shortcuts ?? DEFAULT_SETTINGS.shortcuts)
    try {
      await openPinnedHomeAfterInstall(details)
    } catch (error) {
      console.warn("[TabPlex] 首次安装创建 Home 失败", error)
    }
  })
} catch (err) {
  console.warn("[TabPlex] runtime.onInstalled 不可用", err)
}

if (chrome?.commands?.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (!(await waitForStartupRecovery("快捷键"))) return
    if (command === "open-quick-switcher") {
      await dispatchHomeAction("goHome")
    } else if (command === "open-quick-create") {
      await dispatchHomeAction("newWorkspace")
    } else if (command === "switch-workspace-prev") {
      await handleWorkspaceSwitch("prev")
    } else if (command === "switch-workspace-next") {
      await handleWorkspaceSwitch("next")
    }
  })
}

const applyCommandShortcuts = async (shortcuts?: Record<string, string>) => {
  const commandsApi = chrome?.commands as
    | (typeof chrome.commands & {
        update?: any
      })
    | undefined
  if (!commandsApi?.update) return
  for (const [key, command] of Object.entries(COMMAND_SHORTCUT_MAP)) {
    const raw = shortcuts?.[key]
    const normalized = normalizeShortcutLabel(raw)
    try {
      await new Promise<void>((resolve, reject) => {
        commandsApi.update(
          { name: command, shortcut: normalized ?? "" },
          () => {
            const err = chrome.runtime.lastError
            if (err) reject(err)
            else resolve()
          }
        )
      })
    } catch (err) {
      console.warn("[TabPlex] 同步快捷键失败", command, err)
    }
  }
}

if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    // Restore transactions can emit intermediate storage events. The startup
    // hydrate reads the final durable truth, so stale in-flight events must be
    // ignored instead of replayed after recovery.
    if (!startupRecoveryGate.hasSucceeded()) return
    if (areaName === "local" && changes[STORAGE_KEYS.LOCAL_SETTINGS]) {
      const nextLocalSettings = changes[STORAGE_KEYS.LOCAL_SETTINGS]
        .newValue as
        { devMode?: boolean; agentControlEnabled?: boolean } | undefined
      setLoggerConsoleEnabled(!!nextLocalSettings?.devMode)
      const enabled = nextLocalSettings?.agentControlEnabled === true
      if (agentControlRuntime) agentControlRuntime.setEnabled(enabled)
      else if (!enabled) void disconnectAgentControl()
      return
    }
    if (areaName !== "sync") return
    const next = changes[STORAGE_KEYS.SETTINGS]?.newValue as
      { shortcuts?: Record<string, string> } | undefined
    if (!next?.shortcuts) return
    void applyCommandShortcuts(next.shortcuts)
  })
}

if (chrome?.permissions?.onRemoved) {
  chrome.permissions.onRemoved.addListener((permissions) => {
    if (!includesAgentControlPermission(permissions)) return
    void workspaceControllerReady
      .then(disableAgentControlSetting)
      .catch((error) =>
        console.warn("[TabPlex] Agent 权限撤销后关闭设置失败", error)
      )
  })
}

// 仅保护用户显式打开的 Home 导航，不在其他窗口自动创建 Home。
registerHomeNavigationListener(backupRestoreRecoveryReady)

const registerMessageListener = () => {
  const validator = createBackgroundMessageValidator(
    isTrustedInternalMessageSender
  )
  const messageHandlers: Partial<
    Record<TabplexMessageType, BackgroundMessageHandler>
  > = {
    "workspace-switch": handleWorkspaceSwitchMessage,
    "workspace-window-operation": handleWorkspaceWindowOperationMessage,
    "workspace-state-patch": handleWorkspaceStatePatchMessage,
    "workspaces-apply": handleWorkspacesApplyMessage,
    "settings-apply": handleSettingsApplyMessage,
    "pending-action-consume": handlePendingActionMessage,
    "onboarding-transition": handleOnboardingMessage,
    "agent-control": handleAgentControlMessage,
    "backup-restore": handleBackupRestoreMessage,
    ...createHomeMessageHandlers({
      openAndPinHomeInCurrentWindow,
      openAndPinHomeInWindow
    })
  }

  const router = createBackgroundMessageListener({
    validator,
    router: (type) => {
      const handler = messageHandlers[type]
      return handler
        ? gateBackgroundMessageHandler(backupRestoreRecoveryReady, handler)
        : undefined
    }
  })

  chrome.runtime.onMessage.addListener(router)
}

if (chrome?.runtime?.onMessage) {
  registerMessageListener()
}

const createAgentControl = () => {
  const createWorkspace = createAgentWorkspaceFactory({
    applyWorkspacesUpdate: (updater) =>
      runWorkspaceDataOperation(() => applyWorkspacesUpdate(updater)),
    createId: uuid,
    now: () => Date.now()
  })
  const actions = createAgentBackgroundActionBridge({
    workspacesApply: handleWorkspacesApplyMessage,
    workspaceStatePatch: handleWorkspaceStatePatchMessage,
    settingsApply: handleSettingsApplyMessage,
    workspaceWindowOperation: handleWorkspaceWindowOperationMessage
  })

  const openAgentPage = async (url: string, preferredWindowId?: number) => {
    const windowId = preferredWindowId ?? (await getCurrentNormalWindowId())
    if (typeof windowId !== "number") throw new Error("no-window")
    await chrome.tabs.create({ windowId, url, active: true })
  }

  const processRequest = createAgentRequestProcessor(
    {
      loadSettings,
      loadWorkspaces,
      loadWorkspaceState,
      loadWindowBinding: getWorkspaceWindowBinding,
      openHome: (preferredWindowId) =>
        typeof preferredWindowId === "number"
          ? openAndPinHomeInWindow(preferredWindowId, true)
          : openAndPinHomeInCurrentWindow(true),
      openSettings: (preferredWindowId) =>
        openAgentPage(chrome.runtime.getURL("options.html"), preferredWindowId),
      openShortcuts: (preferredWindowId) =>
        openAgentPage("chrome://extensions/shortcuts", preferredWindowId),
      switchWorkspace: (workspaceId, preferredWindowId) =>
        requestWorkspaceSwitch(workspaceId, { preferredWindowId }),
      createWorkspace,
      ...actions,
      getVersion: () => chrome.runtime.getManifest().version
    },
    {
      withAgentOperation: withAgentOperationLock,
      getCurrentWindowId: getCurrentNormalWindowId
    }
  )

  return createAgentControlRuntime({
    loadSettings,
    connectNative: (hostName) => chrome.runtime.connectNative(hostName),
    handleRequest: async (request) => {
      try {
        await workspaceControllerReady
      } catch {
        return { ok: false, error: "startup-recovery-failed" }
      }
      return processRequest(request)
    },
    getLastErrorMessage: () => chrome.runtime.lastError?.message
  })
}

agentControlRuntime = createAgentControl()
registerAgentControlRuntime(agentControlRuntime)
void workspaceControllerReady
  .then(async () => {
    await clearLegacyAgentControlState()
    await reconcileAgentControlPermission()
    return agentControlRuntime?.syncWithSettings()
  })
  .catch((error) =>
    console.warn("[TabPlex] Agent Native Messaging 初始化失败", error)
  )

async function dispatchHomeAction(action: "goHome" | "newWorkspace") {
  const targetWindowId = await getCurrentNormalWindowId()
  if (targetWindowId === undefined) {
    console.warn("[TabPlex] 快捷操作未找到当前 normal 窗口", action)
    return
  }
  const actionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  try {
    await withAuxiliaryStorageWriteLock(() =>
      chrome.storage.local.set({
        [STORAGE_KEYS.PENDING_ACTION]: {
          id: actionId,
          action,
          ts: Date.now(),
          targetWindowId
        }
      })
    )
  } catch (err) {
    console.warn("[TabPlex] 写入待执行快捷操作失败", err)
  }

  const tryNotify = async () => {
    try {
      await chrome.runtime.sendMessage({
        _tabplex: true,
        type: "app-shortcut",
        action,
        id: actionId,
        targetWindowId
      })
      return true
    } catch {
      return false
    }
  }

  const notified = await tryNotify()

  try {
    await openAndPinHomeInWindow(targetWindowId, true)
  } catch (err) {
    console.warn("[TabPlex] 执行快捷操作时打开 Home 失败", err)
  }
  // Retry once immediately; storage PENDING_ACTION handles late listeners.
  if (!notified) {
    await tryNotify()
  }
}
