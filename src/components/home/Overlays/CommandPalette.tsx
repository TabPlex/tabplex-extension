import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "~components/ui/dialog"
import { Input } from "~components/ui/input"
import { ScrollArea } from "~components/ui/scroll-area"
import { SearchIcon } from "~components/ui/search"
import type { Workspace } from "~core/types"
import { DEFAULT_SETTINGS } from "~core/types"
import { resolveWorkspaceColor } from "~core/utils/colors"
import { cn } from "~lib/utils"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaces: Workspace[]
  currentWorkspaceId: string | null
  onSwitch: (tag: Workspace) => void
  onCreate: (name: string) => void
}

export const CommandPalette = ({
  open,
  onOpenChange,
  workspaces,
  currentWorkspaceId,
  onSwitch,
  onCreate
}: CommandPaletteProps) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const defaultWorkspaceColor = DEFAULT_SETTINGS.accentColor ?? "#6C5CE7"

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [open])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? workspaces.filter((tag) => (tag.name || "").toLowerCase().includes(q))
      : workspaces
    return list.slice(0, 8)
  }, [query, workspaces])

  const hasExactMatch = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return false
    return workspaces.some((tag) => (tag.name || "").toLowerCase() === q)
  }, [query, workspaces])

  const canCreate = query.trim().length > 0 && !hasExactMatch
  const actionCount = matches.length + (canCreate ? 1 : 0)

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (activeIndex >= actionCount) {
      setActiveIndex(0)
    }
  }, [actionCount, activeIndex])

  const handleSelect = (index: number) => {
    if (index < 0) return
    if (canCreate && index === matches.length) {
      const name = query.trim()
      if (name) onCreate(name)
      return
    }
    const target = matches[index]
    if (target) {
      onSwitch(target)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="command-dialog"
        onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("home.command.title")}</DialogTitle>
          <DialogDescription>{t("home.command.desc")}</DialogDescription>
        </DialogHeader>
        <div className="command-input">
          <SearchIcon className="command-search-icon" />
          <Input
            ref={inputRef}
            className="command-input-field"
            placeholder={t("home.command.placeholder")}
            aria-label={t("home.command.placeholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              const maxIndex = Math.max(0, actionCount - 1)
              if (event.key === "ArrowDown") {
                if (!actionCount) return
                event.preventDefault()
                setActiveIndex((prev) => (prev >= maxIndex ? 0 : prev + 1))
                return
              }
              if (event.key === "ArrowUp") {
                if (!actionCount) return
                event.preventDefault()
                setActiveIndex((prev) => (prev <= 0 ? maxIndex : prev - 1))
                return
              }
              if (event.key === "Enter") {
                if (!actionCount) return
                event.preventDefault()
                handleSelect(activeIndex)
                return
              }
              if (event.key === "Escape") {
                event.preventDefault()
                onOpenChange(false)
              }
            }}
          />
        </div>
        {matches.length || canCreate ? (
          <ScrollArea className="command-list">
            <ul className="command-items">
              {matches.map((tag, index) => {
                const badgeColor = resolveWorkspaceColor(
                  tag.color,
                  defaultWorkspaceColor
                )
                const badgeClass = cn(
                  "command-badge",
                  badgeColor === "transparent" && "is-transparent"
                )
                const isActive = index === activeIndex
                const isCurrent = tag.id === currentWorkspaceId
                return (
                  <li
                    key={tag.id}
                    className={`command-item${isActive ? " is-active" : ""}`}
                    role="option"
                    aria-selected={isActive}
                    tabIndex={0}
                    onClick={() => handleSelect(index)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return
                      event.preventDefault()
                      handleSelect(index)
                    }}
                    onMouseEnter={() => setActiveIndex(index)}>
                    <span
                      className={badgeClass}
                      style={{ backgroundColor: badgeColor }}
                      aria-hidden="true">
                      {tag.emoji ? tag.emoji : null}
                    </span>
                    <div className="command-meta">
                      <span className="command-name">
                        {tag.name || t("common.unnamedWorkspace")}
                      </span>
                      <span className="command-desc">
                        {t("common.pageCount", {
                          count: tag.tabs?.length || 0
                        })}
                      </span>
                    </div>
                    {isCurrent ? (
                      <span className="command-pill">
                        {t("common.current")}
                      </span>
                    ) : null}
                  </li>
                )
              })}
              {canCreate ? (
                <li
                  className={`command-item command-create${
                    activeIndex === matches.length ? " is-active" : ""
                  }`}
                  role="option"
                  aria-selected={activeIndex === matches.length}
                  tabIndex={0}
                  onClick={() => handleSelect(matches.length)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    handleSelect(matches.length)
                  }}
                  onMouseEnter={() => setActiveIndex(matches.length)}>
                  <span className="command-create-label">
                    {t("home.command.create", { name: query.trim() })}
                  </span>
                  <span className="command-create-hint">
                    {t("home.command.hint")}
                  </span>
                </li>
              ) : null}
            </ul>
          </ScrollArea>
        ) : (
          <div className="command-empty">{t("home.command.empty")}</div>
        )}
        <div className="command-footer">{t("home.command.footer")}</div>
      </DialogContent>
    </Dialog>
  )
}
