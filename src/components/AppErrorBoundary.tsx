import React from "react"

import { logError } from "~lib/logger"

type AppErrorBoundaryProps = {
  children: React.ReactNode
}

type AppErrorBoundaryState = {
  failed: boolean
}

const isChineseUi = () => {
  const language =
    typeof chrome !== "undefined" && chrome.i18n?.getUILanguage
      ? chrome.i18n.getUILanguage()
      : typeof navigator !== "undefined"
        ? navigator.language
        : "en-US"
  return language.toLowerCase().startsWith("zh")
}

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    void logError("ui-error-boundary", "界面渲染失败", {
      message: error.message,
      componentStack: info.componentStack
    })
  }

  render() {
    if (!this.state.failed) return this.props.children

    const chinese = isChineseUi()
    return (
      <main
        role="alert"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          color: "#111827",
          background: "#f8fafc",
          fontFamily: "system-ui, sans-serif"
        }}>
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>
            {chinese ? "TabPlex 暂时无法显示" : "TabPlex could not render"}
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 16px" }}>
            {chinese
              ? "本地工作区数据没有被删除。请重新加载；若问题持续，请在设置中复制诊断日志。"
              : "Your local workspace data was not deleted. Reload the page, and copy diagnostics from Settings if the problem continues."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              minHeight: 40,
              padding: "8px 16px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              background: "#ffffff",
              color: "#111827",
              cursor: "pointer"
            }}>
            {chinese ? "重新加载" : "Reload"}
          </button>
        </div>
      </main>
    )
  }
}
