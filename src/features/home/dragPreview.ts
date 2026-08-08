type CompactTabDragImageInput = {
  dataTransfer: Pick<DataTransfer, "setDragImage">
  source: HTMLElement
  itemCount: number
}

const clonePreviewIcon = (source: HTMLElement) => {
  const icon = source.querySelector<HTMLElement>(".tab-icon")
  if (!icon) return null

  const clone = icon.cloneNode(true) as HTMLElement
  clone.removeAttribute("id")
  clone.classList.add("tab-drag-preview-icon")
  return clone
}

const removeAfterDragSnapshot = (preview: HTMLElement) => {
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => preview.remove())
    return
  }
  preview.remove()
}

export const setCompactTabDragImage = ({
  dataTransfer,
  source,
  itemCount
}: CompactTabDragImageInput) => {
  if (typeof document === "undefined" || !document.body) return null

  const title =
    source.querySelector<HTMLElement>(".tab-title")?.textContent?.trim() ||
    source.textContent?.trim()
  if (!title) return null

  const preview = document.createElement("div")
  preview.className = "tab-drag-preview"
  preview.setAttribute("aria-hidden", "true")

  const icon = clonePreviewIcon(source)
  if (icon) preview.append(icon)

  const label = document.createElement("span")
  label.className = "tab-drag-preview-label"
  label.textContent = title
  preview.append(label)

  if (itemCount > 1) {
    const count = document.createElement("span")
    count.className = "tab-drag-preview-count"
    count.textContent = `+${itemCount - 1}`
    preview.append(count)
  }

  document.body.append(preview)
  try {
    dataTransfer.setDragImage(preview, 20, 22)
  } catch {
    preview.remove()
    return null
  }

  removeAfterDragSnapshot(preview)
  return preview
}
