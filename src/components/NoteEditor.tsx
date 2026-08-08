import { memo } from "react"
import type { FC } from "react"
import { useTranslation } from "react-i18next"

import { WysiwygMarkdownEditor } from "~components/WysiwygMarkdownEditor"
import type { TabSpec } from "~core/types"

interface NoteEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  docKey: string
  autoFocus?: boolean
  mentionTabs?: TabSpec[]
  onLinkClick?: (url: string) => void
}

const NoteEditor: FC<NoteEditorProps> = ({
  value,
  onChange,
  placeholder = "",
  docKey,
  autoFocus = false,
  mentionTabs = [],
  onLinkClick
}) => {
  const { t } = useTranslation()
  const resolvedPlaceholder = placeholder || t("home.note.placeholder")

  return (
    <div className="h-full min-h-0">
      <WysiwygMarkdownEditor
        docKey={docKey}
        value={value}
        onChange={onChange}
        placeholder={resolvedPlaceholder}
        autoFocus={autoFocus}
        mentionTabs={mentionTabs}
        onLinkClick={onLinkClick}
      />
    </div>
  )
}

export default memo(NoteEditor)
