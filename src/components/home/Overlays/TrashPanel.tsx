import React, { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~components/ui/button"
import { DeleteIcon } from "~components/ui/delete"
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
import { TooltipProvider } from "~components/ui/tooltip"
import type { Workspace } from "~core/types"
import { DEFAULT_SETTINGS } from "~core/types"
import { formatRelativeTime } from "~core/utils"
import { resolveWorkspaceColor } from "~core/utils/colors"

import { LockedDeleteTooltip } from "../LockedDeleteTooltip"

interface TrashPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trashCount: number
  totalTrashTabs: number
  query: string
  onQueryChange: (q: string) => void
  filteredTrash: Workspace[]
  interactionLocked: boolean
  onEmptyTrash: () => void
  onRestore: (id: string) => void
  onDeleteForever: (id: string) => void
}

export const TrashPanel = ({
  open,
  onOpenChange,
  trashCount,
  totalTrashTabs,
  query,
  onQueryChange,
  filteredTrash,
  interactionLocked,
  onEmptyTrash,
  onRestore,
  onDeleteForever
}: TrashPanelProps) => {
  const { t } = useTranslation()
  const defaultWorkspaceColor = DEFAULT_SETTINGS.accentColor ?? "#6C5CE7"
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null)
  const canEmptyTrash = filteredTrash.length > 0 && !interactionLocked

  const handlePanelOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setConfirmOpen(false)
      setConfirmDeleteOpen(false)
      setDeleteTarget(null)
    }
    onOpenChange(nextOpen)
  }

  const handleConfirmEmpty = () => {
    if (interactionLocked) return
    setConfirmOpen(false)
    onEmptyTrash()
  }

  const handleRequestDelete = (workspace: Workspace) => {
    if (interactionLocked) return
    setDeleteTarget(workspace)
    setConfirmDeleteOpen(true)
  }

  const handleConfirmDelete = () => {
    if (!deleteTarget || interactionLocked) return
    onDeleteForever(deleteTarget.id)
    setConfirmDeleteOpen(false)
    setDeleteTarget(null)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handlePanelOpenChange}>
        <DialogContent className="trash-dialog">
          <DialogHeader>
            <DialogTitle>{t("home.trash.title")}</DialogTitle>
            <DialogDescription>
              {t("home.trash.desc", {
                count: trashCount,
                totalTabs: totalTrashTabs
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="trash-toolbar">
            <div className="trash-search">
              <SearchIcon className="trash-search-icon" aria-hidden="true" />
              <Input
                className="trash-search-input"
                placeholder={t("home.trash.searchPlaceholder")}
                aria-label={t("home.trash.searchPlaceholder")}
                name="trash-search"
                autoComplete="off"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
              />
            </div>
            <div className="trash-header-actions">
              <LockedDeleteTooltip
                locked={interactionLocked}
                message={t("home.workspace.deleteBlocked")}
                triggerClassName="trash-locked-delete-tooltip-trigger">
                <Button
                  variant="ghost"
                  size="sm"
                  className="trash-empty-button"
                  aria-label={t("home.trash.emptyAction")}
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canEmptyTrash}>
                  <DeleteIcon className="trash-action-icon" />
                  {t("home.trash.emptyAction")}
                </Button>
              </LockedDeleteTooltip>
            </div>
          </div>

          {filteredTrash.length ? (
            <ScrollArea className="trash-scroll">
              <TooltipProvider delayDuration={150}>
                <ul className="trash-list">
                  {filteredTrash.map((tag) => {
                    const badgeColor = resolveWorkspaceColor(
                      tag.color,
                      defaultWorkspaceColor
                    )
                    const lastUsedLabel = tag.lastUsedAt
                      ? formatRelativeTime(tag.lastUsedAt)
                      : null
                    const trashedLabel = tag.trashedAt
                      ? formatRelativeTime(tag.trashedAt)
                      : null
                    const showTrashedTime =
                      !!trashedLabel &&
                      (!lastUsedLabel || trashedLabel !== lastUsedLabel)
                    return (
                      <li key={tag.id} className="trash-item">
                        <div className="trash-row-head">
                          <span
                            className="trash-badge"
                            style={{ backgroundColor: badgeColor }}
                          />
                          <div className="trash-title-block">
                            <div className="trash-name-row">
                              <span className="trash-name">
                                {tag.name || t("common.unnamedWorkspace")}
                              </span>
                              <span className="trash-pill">
                                {t("home.trash.pill")}
                              </span>
                            </div>
                            <div className="trash-meta">
                              <span>
                                {t("common.pageCount", {
                                  count: tag.tabs?.length || 0
                                })}
                              </span>
                              {showTrashedTime ? (
                                <span>
                                  {" / "}
                                  {t("home.trash.deletedAt", {
                                    time: trashedLabel
                                  })}
                                </span>
                              ) : lastUsedLabel ? (
                                <span>
                                  {" / "}
                                  {t("common.lastUsed", {
                                    time: lastUsedLabel
                                  })}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="trash-actions">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="trash-btn trash-btn-restore"
                              onClick={() => onRestore(tag.id)}>
                              {t("home.trash.restore")}
                            </Button>
                            <LockedDeleteTooltip
                              locked={interactionLocked}
                              message={t("home.workspace.deleteBlocked")}
                              triggerClassName="trash-locked-delete-tooltip-trigger">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="trash-btn trash-btn-delete"
                                disabled={interactionLocked}
                                onClick={() => handleRequestDelete(tag)}>
                                {t("home.trash.deletePermanently")}
                              </Button>
                            </LockedDeleteTooltip>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </TooltipProvider>
            </ScrollArea>
          ) : (
            <div className="trash-empty">{t("home.trash.listEmpty")}</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="trash-confirm-dialog">
          <DialogHeader>
            <DialogTitle>{t("home.trash.emptyConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("home.trash.emptyConfirmDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="trash-confirm-actions">
            <Button
              variant="ghost"
              className="trash-confirm-button trash-confirm-cancel"
              onClick={() => setConfirmOpen(false)}>
              {t("home.trash.emptyConfirmCancel")}
            </Button>
            <LockedDeleteTooltip
              locked={interactionLocked}
              message={t("home.workspace.deleteBlocked")}
              triggerClassName="trash-locked-delete-tooltip-trigger">
              <Button
                variant="destructive"
                className="trash-confirm-button trash-confirm-danger"
                disabled={interactionLocked}
                onClick={handleConfirmEmpty}>
                {t("home.trash.emptyConfirmAction")}
              </Button>
            </LockedDeleteTooltip>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDeleteOpen}
        onOpenChange={(nextOpen) => {
          setConfirmDeleteOpen(nextOpen)
          if (!nextOpen) setDeleteTarget(null)
        }}>
        <DialogContent className="trash-confirm-dialog">
          <DialogHeader>
            <DialogTitle>{t("home.trash.deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("home.trash.deleteConfirmDesc", {
                name: deleteTarget?.name || t("common.unnamedWorkspace")
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="trash-confirm-actions">
            <Button
              variant="ghost"
              className="trash-confirm-button trash-confirm-cancel"
              onClick={() => setConfirmDeleteOpen(false)}>
              {t("home.trash.deleteConfirmCancel")}
            </Button>
            <LockedDeleteTooltip
              locked={interactionLocked}
              message={t("home.workspace.deleteBlocked")}
              triggerClassName="trash-locked-delete-tooltip-trigger">
              <Button
                variant="destructive"
                className="trash-confirm-button trash-confirm-danger"
                disabled={interactionLocked}
                onClick={handleConfirmDelete}>
                {t("home.trash.deleteConfirmAction")}
              </Button>
            </LockedDeleteTooltip>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
