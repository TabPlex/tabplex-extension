import { createContext, useContext, type ReactNode } from "react"

import { useWorkspaceData } from "./hooks/useWorkspaceData"

type WorkspaceDataValue = ReturnType<typeof useWorkspaceData>

const WorkspaceDataContext = createContext<WorkspaceDataValue | null>(null)

export const WorkspaceDataProvider = ({
  children
}: {
  children: ReactNode
}) => {
  const data = useWorkspaceData()
  return (
    <WorkspaceDataContext.Provider value={data}>
      {children}
    </WorkspaceDataContext.Provider>
  )
}

/**
 * 从最近的 WorkspaceDataProvider 获取工作区数据。
 * 必须在 WorkspaceDataProvider 内部使用。
 */
export const useWorkspaceDataContext = (): WorkspaceDataValue => {
  const ctx = useContext(WorkspaceDataContext)
  if (!ctx) {
    throw new Error(
      "[TabPlex] useWorkspaceDataContext 必须在 WorkspaceDataProvider 内部使用"
    )
  }
  return ctx
}
