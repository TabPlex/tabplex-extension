import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "~components/ui/dialog"
import {
  resolveNoticeLabel,
  resolveNoticeSubLabel,
  type HomeNotice
} from "~features/home/notice"
import { useWorkspaceSwitching } from "~hooks/useWorkspaceSwitching"

type WorkspaceSwitchProgressProps = {
  notice?: HomeNotice
}

export const WorkspaceSwitchProgress = ({
  notice = null
}: WorkspaceSwitchProgressProps) => {
  const { t } = useTranslation()
  const {
    isSwitchingInProgress,
    isRecoveryFailed,
    discardRecovery,
    targetName,
    progressRatio,
    counts
  } = useWorkspaceSwitching()
  const [isDiscardingRecovery, setIsDiscardingRecovery] = useState(false)
  const [discardFailed, setDiscardFailed] = useState(false)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)

  const noticeLabel = useMemo(
    () =>
      resolveNoticeLabel({
        notice,
        t,
        fallbackName: t("common.unnamedWorkspace")
      }),
    [notice, t]
  )
  const noticeSubLabel = useMemo(
    () =>
      resolveNoticeSubLabel({
        notice,
        t
      }),
    [notice, t]
  )
  const shouldShow = isSwitchingInProgress || isRecoveryFailed || !!noticeLabel

  if (!shouldShow) return null

  const percentage = Math.round(progressRatio * 100)
  const primaryLabel = isRecoveryFailed
    ? t("home.switchProgress.recoveryFailed")
    : isSwitchingInProgress
      ? t("home.switchProgress.opening", { name: targetName })
      : noticeLabel

  const handleDiscardRecovery = async () => {
    setIsDiscardingRecovery(true)
    setDiscardFailed(false)
    try {
      await discardRecovery()
      setDiscardConfirmOpen(false)
    } catch {
      setDiscardFailed(true)
    } finally {
      setIsDiscardingRecovery(false)
    }
  }

  return (
    <>
      <div
        className={`home-switch-indicator animate-in fade-in zoom-in-95 duration-300${
          isRecoveryFailed ? " is-recovery-failed" : ""
        }`}
        role={isRecoveryFailed ? "alert" : "status"}
        aria-live={isRecoveryFailed ? "assertive" : "polite"}>
        <div className="home-switch-indicator-copy">
          <div className="home-switch-indicator-line">
            <span className="text-xs font-medium text-foreground/80">
              {primaryLabel}
            </span>
            {isSwitchingInProgress && counts.expected > 0 ? (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {counts.completed}/{counts.expected}
              </span>
            ) : null}
          </div>
          {!isSwitchingInProgress && noticeSubLabel ? (
            <div className="home-switch-indicator-sub">{noticeSubLabel}</div>
          ) : null}
          {isRecoveryFailed ? (
            <div className="home-switch-indicator-sub">
              {discardFailed
                ? t("home.switchProgress.discardRecoveryFailed")
                : t("home.switchProgress.recoveryFailedHint")}
            </div>
          ) : null}
        </div>
        {isRecoveryFailed ? (
          <button
            type="button"
            className="rounded-md border border-border/70 px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isDiscardingRecovery}
            onClick={() => setDiscardConfirmOpen(true)}>
            {isDiscardingRecovery
              ? t("home.switchProgress.discardingRecovery")
              : t("home.switchProgress.discardRecovery")}
          </button>
        ) : null}
        {isSwitchingInProgress && counts.expected > 0 ? (
          <div
            className="h-1 w-24 overflow-hidden rounded-full bg-muted/50"
            role="progressbar"
            aria-label={primaryLabel || t("common.switching")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}>
            <div
              className="h-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${percentage}%` }}
            />
          </div>
        ) : null}
      </div>

      <Dialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("home.switchProgress.discardRecovery")}
            </DialogTitle>
            <DialogDescription>
              {t("home.switchProgress.discardRecoveryConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isDiscardingRecovery}
              onClick={() => setDiscardConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDiscardingRecovery}
              onClick={() => void handleDiscardRecovery()}>
              {isDiscardingRecovery
                ? t("home.switchProgress.discardingRecovery")
                : t("home.switchProgress.discardRecovery")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
