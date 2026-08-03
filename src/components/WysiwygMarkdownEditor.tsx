import { CodeNode } from "@lexical/code"
import { LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS
} from "@lexical/markdown"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { $getRoot, ParagraphNode, TextNode, type EditorState } from "lexical"
import { memo, useCallback, useEffect, useMemo, useRef } from "react"
import type { MutableRefObject } from "react"
import { useTranslation } from "react-i18next"

import { PageMentionTypeaheadPlugin } from "~components/PageMentionTypeaheadPlugin"
import type { TabSpec } from "~core/types"
import { isSafeTabUrl } from "~core/utils"
import { cn } from "~lib/utils"

const editorTheme = {
  paragraph: "text-sm leading-relaxed",
  quote: "my-2 border-l-2 border-border pl-3 text-muted-foreground text-sm",
  heading: {
    h1: "mt-2 mb-1 text-xl font-semibold tracking-tight",
    h2: "mt-2 mb-1 text-lg font-semibold tracking-tight",
    h3: "mt-2 mb-1 text-base font-semibold tracking-tight"
  },
  list: {
    nested: {
      listitem: "list-none"
    },
    ol: "my-2 ml-5 list-decimal",
    ul: "my-2 ml-5 list-disc",
    listitem: "my-1"
  },
  text: {
    bold: "font-semibold",
    italic: "italic",
    underline: "underline",
    strikethrough: "line-through",
    code: "rounded bg-muted px-1 py-0.5 text-[0.85em]"
  },
  link: "text-primary-readable underline underline-offset-4"
} as const

const normalizeMarkdown = (markdown: string) =>
  markdown.replaceAll("\r\n", "\n").trimEnd()

function MarkdownValueSyncPlugin({
  value,
  lastEmittedRef
}: {
  value: string
  lastEmittedRef: MutableRefObject<string>
}) {
  const [editor] = useLexicalComposerContext()
  const lastAppliedRef = useRef<string | null>(null)

  useEffect(() => {
    const normalized = normalizeMarkdown(value)
    if (normalized === lastEmittedRef.current) return
    if (normalized === lastAppliedRef.current) return
    lastAppliedRef.current = normalized
    editor.update(() => {
      const root = $getRoot()
      root.clear()
      $convertFromMarkdownString(normalized, TRANSFORMERS)
    })
  }, [editor, lastEmittedRef, value])

  return null
}

interface WysiwygMarkdownEditorProps {
  docKey: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
  mentionTabs?: TabSpec[]
  onLinkClick?: (url: string) => void
}

export const WysiwygMarkdownEditor = memo(function WysiwygMarkdownEditor({
  docKey,
  value,
  onChange,
  placeholder,
  autoFocus = false,
  className,
  mentionTabs = [],
  onLinkClick
}: WysiwygMarkdownEditorProps) {
  const { t } = useTranslation()
  const resolvedPlaceholder = placeholder ?? t("home.note.placeholder")
  const initialMarkdown = useMemo(() => normalizeMarkdown(value), [docKey])
  const lastEmittedMarkdownRef = useRef(initialMarkdown)

  useEffect(() => {
    lastEmittedMarkdownRef.current = initialMarkdown
  }, [docKey, initialMarkdown])

  const initialConfig = useMemo(() => {
    return {
      namespace: `tabplex-note-${docKey}`,
      theme: editorTheme,
      nodes: [
        HeadingNode,
        QuoteNode,
        CodeNode,
        ListNode,
        ListItemNode,
        LinkNode,
        ParagraphNode,
        TextNode
      ],
      editorState: () => {
        $convertFromMarkdownString(initialMarkdown, TRANSFORMERS)
      },
      onError: (error: Error) => {
        console.error(error)
      }
    }
  }, [docKey, initialMarkdown])

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const next = normalizeMarkdown($convertToMarkdownString(TRANSFORMERS))
        lastEmittedMarkdownRef.current = next
        onChange(next)
      })
    },
    [onChange]
  )

  return (
    <div className={cn("note-lexical-root", className)}>
      <LexicalComposer initialConfig={initialConfig}>
        <div className="note-editor-surface">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label={t("home.note.editorLabel")}
                className="note-content-editable"
                onClick={(event) => {
                  const native = event.nativeEvent as MouseEvent
                  if (
                    native.metaKey ||
                    native.ctrlKey ||
                    native.shiftKey ||
                    native.altKey
                  ) {
                    return
                  }
                  const target = event.target as HTMLElement | null
                  if (!target) return
                  const link = target.closest("a") as HTMLAnchorElement | null
                  if (!link) return
                  const href = link.getAttribute("href") || link.href
                  if (!href) return
                  if (!isSafeTabUrl(href)) return
                  event.preventDefault()
                  onLinkClick?.(href)
                }}
              />
            }
            placeholder={
              resolvedPlaceholder ? (
                <div aria-hidden="true" className="note-placeholder">
                  {resolvedPlaceholder}
                </div>
              ) : null
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        {mentionTabs.length ? (
          <PageMentionTypeaheadPlugin tabs={mentionTabs} />
        ) : null}
        {autoFocus ? <AutoFocusPlugin /> : null}
        <OnChangePlugin onChange={handleEditorChange} />
        <MarkdownValueSyncPlugin
          value={value}
          lastEmittedRef={lastEmittedMarkdownRef}
        />
      </LexicalComposer>
    </div>
  )
})
