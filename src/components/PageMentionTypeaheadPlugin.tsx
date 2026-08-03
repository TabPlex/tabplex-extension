import { $createLinkNode } from "@lexical/link"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  PUNCTUATION,
  useBasicTypeaheadTriggerMatch,
  type MenuRenderFn
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  type TextNode
} from "lexical"
import { memo, useCallback, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import type { TabSpec } from "~core/types"
import { describeUrl } from "~lib/common"
import { cn } from "~lib/utils"
import { getTabDisplayTitle } from "~shared/logic"

class PageOption extends MenuOption {
  title: string
  url: string
  displayUrl: string
  faviconUrl?: string
  pinned?: boolean
  hostLetter: string

  constructor(
    key: string,
    title: string,
    url: string,
    displayUrl: string,
    hostLetter: string,
    faviconUrl?: string,
    pinned?: boolean
  ) {
    super(key)
    this.title = title
    this.url = url
    this.displayUrl = displayUrl
    this.hostLetter = hostLetter
    this.faviconUrl = faviconUrl
    this.pinned = pinned
  }
}

const MAX_OPTIONS = 10

const normalize = (value: string) =>
  value.trim().toLowerCase().replaceAll(/\s+/g, " ")

export const PageMentionTypeaheadPlugin = memo(
  function PageMentionTypeaheadPlugin({ tabs }: { tabs: TabSpec[] }) {
    const { t } = useTranslation()
    const [queryString, setQueryString] = useState<string | null>(null)

    const checkForPageMentionMatch = useBasicTypeaheadTriggerMatch("@", {
      minLength: 0,
      maxLength: 50,
      punctuation: PUNCTUATION,
      allowWhitespace: false
    })

    const options = useMemo(() => {
      if (!tabs?.length) return []
      const q = queryString ? normalize(queryString) : ""
      const seen = new Set<string>()
      const filtered: TabSpec[] = []

      for (const tab of tabs) {
        const url = tab.url
        if (!url || seen.has(url)) continue
        seen.add(url)
        if (!q) {
          filtered.push(tab)
          continue
        }
        const { host, display } = describeUrl(url)
        const title = getTabDisplayTitle(tab, host || url)
        const hay = `${title} ${display} ${url}`
        if (normalize(hay).includes(q)) filtered.push(tab)
      }

      return filtered.slice(0, MAX_OPTIONS).map((tab, index) => {
        const { host, display } = describeUrl(tab.url)
        const title = getTabDisplayTitle(tab, host || tab.url)
        const hostLetter = (host || tab.url).slice(0, 1).toUpperCase() || "·"
        return new PageOption(
          `${tab.url}-${index}`,
          title,
          tab.url,
          display,
          hostLetter,
          tab.faviconUrl,
          tab.pinned
        )
      })
    }, [queryString, tabs])

    const onSelectOption = useCallback(
      (
        selectedOption: PageOption,
        textNodeContainingQuery: TextNode | null,
        closeMenu: () => void
      ) => {
        const label = selectedOption.title
        const linkNode = $createLinkNode(selectedOption.url)
        linkNode.append($createTextNode(label))

        const trailingSpace = $createTextNode(" ")

        if (textNodeContainingQuery) {
          textNodeContainingQuery.replace(linkNode)
          linkNode.insertAfter(trailingSpace)
          trailingSpace.select(1, 1)
        } else {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            selection.insertNodes([linkNode, trailingSpace])
            trailingSpace.select(1, 1)
          }
        }

        closeMenu()
      },
      []
    )

    const menuRenderFn: MenuRenderFn<PageOption> = useCallback(
      (
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex, options }
      ) => {
        const anchorElement = anchorElementRef.current
        if (!anchorElement || options.length === 0) return null

        return createPortal(
          <div className="note-autocomplete-menu w-[360px]">
            <ul className="max-h-64 overflow-y-auto">
              {options.map((option, index) => {
                const isSelected = selectedIndex === index
                return (
                  <li key={option.key} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      ref={option.setRefElement}
                      id={`typeahead-item-${index}`}
                      className={cn(
                        "note-autocomplete-item is-tab",
                        isSelected && "is-selected"
                      )}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        selectOptionAndCleanUp(option)
                      }}>
                      {option.faviconUrl ? (
                        <img
                          className="tab-icon"
                          src={option.faviconUrl}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.style.display = "none"
                          }}
                        />
                      ) : (
                        <span className="tab-icon fallback">
                          {option.hostLetter}
                        </span>
                      )}
                      <span className="note-autocomplete-text">
                        <span className="note-autocomplete-title">
                          {option.title}
                        </span>
                        <span className="note-autocomplete-url">
                          {option.displayUrl}
                        </span>
                      </span>
                      {option.pinned ? (
                        <span className="tab-badge">{t("common.pinned")}</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>,
          anchorElement
        )
      },
      [t]
    )

    return (
      <LexicalTypeaheadMenuPlugin<PageOption>
        onQueryChange={setQueryString}
        onSelectOption={onSelectOption}
        options={options}
        triggerFn={checkForPageMentionMatch}
        menuRenderFn={menuRenderFn}
      />
    )
  }
)
