import {
  lazy,
  memo,
  default as React,
  Suspense,
  useId,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject
} from "react"
import { useTranslation } from "react-i18next"

import type { TabSpec } from "~core/types"
import {
  clampNotePanelWidth,
  DEFAULT_NOTE_PANEL_WIDTH,
  MIN_NOTE_PANEL_WIDTH,
  resolveNotePanelKeyboardWidth
} from "~features/home/logic/notePanelSizing"

const NoteEditorLazy = lazy(() => import("~components/NoteEditor"))

interface NotePanelProps {
  notePanelWidth: number
  notePanelMaxWidth: number
  setNotePanelWidth: (w: number) => void
  noteCardRef: RefObject<HTMLElement>
  selectedId: string | null
  noteDraft: string
  onNoteChange: (val: string) => void
  onNoteResizeStart: (e: PointerEvent) => void
  mentionTabs?: TabSpec[]
  onLinkClick?: (url: string) => void
}

export const NotePanel = memo(function NotePanel({
  notePanelWidth,
  notePanelMaxWidth,
  setNotePanelWidth,
  noteCardRef,
  selectedId,
  noteDraft,
  onNoteChange,
  onNoteResizeStart,
  mentionTabs = [],
  onLinkClick
}: NotePanelProps) {
  const { t } = useTranslation()
  const noteCardId = useId()

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const nextWidth = resolveNotePanelKeyboardWidth({
      currentWidth: notePanelWidth,
      maxWidth: notePanelMaxWidth,
      key: event.key,
      largeStep: event.shiftKey
    })
    if (nextWidth === null) return
    event.preventDefault()
    setNotePanelWidth(nextWidth)
  }

  return (
    <>
      <div
        className="workspace-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("home.note.resizeLabel")}
        aria-controls={noteCardId}
        aria-valuemin={MIN_NOTE_PANEL_WIDTH}
        aria-valuemax={notePanelMaxWidth}
        aria-valuenow={Math.round(notePanelWidth)}
        aria-valuetext={t("home.note.resizeValue", {
          width: Math.round(notePanelWidth)
        })}
        aria-keyshortcuts="ArrowLeft ArrowRight Home End"
        tabIndex={0}
        onPointerDown={onNoteResizeStart}
        onKeyDown={handleResizeKeyDown}
        onDoubleClick={() =>
          setNotePanelWidth(
            clampNotePanelWidth(DEFAULT_NOTE_PANEL_WIDTH, notePanelMaxWidth)
          )
        }
      />

      <section
        id={noteCardId}
        className="workspace-card note-card"
        aria-label={t("home.note.title")}
        ref={noteCardRef}>
        <div className="note-panel-editor">
          <Suspense fallback={<div className="h-full min-h-[220px]" />}>
            <NoteEditorLazy
              docKey={selectedId ?? "none"}
              value={noteDraft}
              onChange={onNoteChange}
              mentionTabs={mentionTabs}
              onLinkClick={onLinkClick}
            />
          </Suspense>
        </div>
      </section>
    </>
  )
})
