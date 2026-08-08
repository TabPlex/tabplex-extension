export const isSidebarDeleteReady = ({
  hoverDeleteId,
  workspaceId: tagId,
  isDragging
}: {
  hoverDeleteId: string | null
  workspaceId: string
  isDragging: boolean
}) => Boolean(hoverDeleteId && hoverDeleteId === tagId && !isDragging)
