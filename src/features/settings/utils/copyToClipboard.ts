type ClipboardLike = {
  writeText: (text: string) => Promise<void>
}

type DocumentLike = {
  createElement: (tag: string) => {
    value: string
    setAttribute: (name: string, value: string) => void
    style: Record<string, string>
    select: () => void
  }
  body: {
    appendChild: (node: unknown) => void
    removeChild: (node: unknown) => void
  }
  execCommand: (command: string) => boolean
}

export const copyToClipboard = async (
  text: string,
  deps?: {
    clipboard?: ClipboardLike | null
    document?: DocumentLike | null
  }
): Promise<boolean> => {
  const clipboard =
    deps?.clipboard ??
    (typeof navigator !== "undefined" ? navigator.clipboard : null)
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text)
      return true
    } catch {
      // Fall through to execCommand fallback.
    }
  }

  const doc =
    deps?.document ?? (typeof document !== "undefined" ? document : null)
  if (!doc?.createElement || !doc.body || !doc.execCommand) {
    return false
  }

  try {
    const textarea = doc.createElement("textarea") as HTMLTextAreaElement
    textarea.value = text
    textarea.setAttribute("readonly", "true")
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    doc.body.appendChild(textarea as unknown as Node)
    textarea.select()
    const ok = doc.execCommand("copy")
    doc.body.removeChild(textarea as unknown as Node)
    return ok
  } catch {
    return false
  }
}
