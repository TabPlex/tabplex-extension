import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "~components/ui/dialog"
import type { Workspace } from "~core/types"

const TimelineViewLazy = lazy(() => import("~components/TimelineView"))

interface TimelinePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedWorkspace: Workspace | null
  onRestoreApplied?: (payload: {
    restoredAt: number
    addedCount: number
    removedCount: number
  }) => void
}

export const TimelinePanel = ({
  open,
  onOpenChange,
  selectedWorkspace,
  onRestoreApplied
}: TimelinePanelProps) => {
  const { t } = useTranslation()

  return (
    <Dialog open={open && !!selectedWorkspace} onOpenChange={onOpenChange}>
      <DialogContent
        className="timeline-dialog"
        aria-describedby={undefined}
        aria-label={t("timeline.title")}>
        <DialogHeader className="sr-only">
          <DialogTitle>{t("timeline.title")}</DialogTitle>
          <DialogDescription>{t("timeline.selectHint")}</DialogDescription>
        </DialogHeader>
        {selectedWorkspace ? (
          <div className="timeline-wrapper">
            <div className="timeline-body">
              <Suspense
                fallback={
                  <div className="text-xs text-muted-foreground px-3 py-2">
                    {t("timeline.loading")}
                  </div>
                }>
                <TimelineViewLazy
                  mode="embedded"
                  workspaceId={selectedWorkspace.id}
                  onRequestClose={() => onOpenChange(false)}
                  onRestoreApplied={onRestoreApplied}
                />
              </Suspense>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
