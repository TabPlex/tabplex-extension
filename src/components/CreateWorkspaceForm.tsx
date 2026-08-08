import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~components/ui/button"
import { CheckIcon } from "~components/ui/check"
import { Input } from "~components/ui/input"
import { LoaderPinwheelIcon } from "~components/ui/loader-pinwheel"
import { ScrollArea } from "~components/ui/scroll-area"
import type { Workspace } from "~core/types"
import { DEFAULT_SETTINGS } from "~core/types"
import { resolveWorkspaceColor } from "~core/utils/colors"
import type { CreateWorkspaceResult } from "~features/workspace/hooks/workspaceCrudActions"
import type { CreateOptions } from "~hooks/useWorkspaceManager"
import { cn } from "~lib/utils"

const VARIANT_STYLES = {
  popup: {
    container: "space-y-3",
    // 在 popup 中让输入框与按钮始终同一行显示
    controls: "flex items-center gap-2",
    // 去掉输入框边框/描边，风格与 Home 页一致
    input:
      "create-workspace-name-input flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
    buttonWrapper: "w-auto",
    button: "px-4",
    status: "text-sm",
    suggestions: "rounded-lg border border-border bg-muted/40 p-3",
    suggestionItem:
      "flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/80",
    suggestionName: "flex items-center gap-2",
    suggestionDot:
      "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-base shadow-sm",
    suggestionHint: "text-xs text-muted-foreground"
  },
  header: {
    container: "create-workspace-inline-form space-y-1.5",
    controls: "create-workspace-inline-controls flex items-center gap-0.5",
    input:
      "create-workspace-name-input create-workspace-inline-input h-9 min-w-0 flex-1 border-0 bg-transparent px-2.5 text-sm font-medium shadow-none outline-none focus-visible:bg-transparent focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60",
    buttonWrapper: "shrink-0",
    button:
      "create-workspace-inline-submit h-9 w-9 min-w-[2.25rem] rounded-xl border-0 bg-primary/10 p-0 text-primary-readable shadow-none transition-colors hover:bg-primary/15 hover:text-primary-readable hover:shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-60",
    status: "create-workspace-inline-status text-xs",
    suggestions: "rounded-xl border border-border bg-muted/30 p-3",
    suggestionItem:
      "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/70",
    suggestionName: "flex items-center gap-2",
    suggestionDot:
      "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-lg shadow-sm",
    suggestionHint: "text-xs text-muted-foreground"
  }
} as const

type Variant = keyof typeof VARIANT_STYLES

type Status = "idle" | "saving" | "success" | "warning" | "error"

type Props = {
  createWorkspace: (options?: CreateOptions) => Promise<CreateWorkspaceResult>
  sortedWorkspaces: Workspace[]
  initialName?: string
  open?: boolean
  variant?: Variant
  placeholder?: string
  submitLabel?: string
  submittingLabel?: string
  successLabel?: string
  partialSuccessLabel?: string
  errorLabel?: string
  autoFocus?: boolean
  allowEmptyName?: boolean
  showSuggestions?: boolean
  suggestionsLimit?: number
  showStatus?: boolean
  autoResetStatus?: boolean
  enableGlobalSubmit?: boolean
  createOptions?: Omit<CreateOptions, "name">
  onSuccess?: (
    workspace: Workspace,
    result: CreateWorkspaceResult
  ) => void | Promise<void>
  onError?: (error: unknown) => void
  onSavingChange?: (saving: boolean) => void
  accentColor?: string
}

const VARIANT_DEFAULTS: Record<
  Variant,
  Required<
    Omit<
      Props,
      | "createWorkspace"
      | "sortedWorkspaces"
      | "createOptions"
      | "onSuccess"
      | "onError"
      | "onSavingChange"
      | "accentColor"
      | "initialName"
      | "open"
    >
  >
> = {
  popup: {
    variant: "popup",
    placeholder: "",
    submitLabel: "",
    submittingLabel: "",
    successLabel: "",
    partialSuccessLabel: "",
    errorLabel: "",
    autoFocus: true,
    allowEmptyName: true,
    showSuggestions: true,
    suggestionsLimit: 5,
    showStatus: true,
    autoResetStatus: true,
    enableGlobalSubmit: true
  },
  header: {
    variant: "header",
    placeholder: "",
    submitLabel: "",
    submittingLabel: "",
    successLabel: "",
    partialSuccessLabel: "",
    errorLabel: "",
    autoFocus: true,
    allowEmptyName: false,
    showSuggestions: false,
    suggestionsLimit: 5,
    showStatus: true,
    autoResetStatus: false,
    enableGlobalSubmit: false
  }
}

const CreateWorkspaceForm = ({
  createWorkspace,
  sortedWorkspaces,
  initialName,
  open,
  variant = "popup",
  placeholder,
  submitLabel,
  submittingLabel,
  successLabel,
  partialSuccessLabel,
  errorLabel,
  autoFocus,
  allowEmptyName,
  showSuggestions,
  suggestionsLimit,
  showStatus,
  autoResetStatus,
  enableGlobalSubmit,
  createOptions,
  onSuccess,
  onError,
  onSavingChange,
  accentColor
}: Props) => {
  const { t } = useTranslation()
  const defaults = VARIANT_DEFAULTS[variant]
  const styles = VARIANT_STYLES[variant]
  const resolvedAccent =
    accentColor ?? DEFAULT_SETTINGS.accentColor ?? "#6C5CE7"

  const [name, setName] = useState(() => initialName ?? "")
  const [status, setStatus] = useState<Status>("idle")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const resetTimerRef = useRef<number | null>(null)
  const submissionPendingRef = useRef(false)
  const containerRef = useRef<HTMLFormElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const statusId = useId()
  const isComposingRef = useRef(false)
  const optionsRef = useRef(createOptions)

  useEffect(() => {
    optionsRef.current = createOptions
  }, [createOptions])

  const resolvedPlaceholder =
    placeholder ??
    (variant === "popup"
      ? t("home.create.popup.placeholder")
      : t("home.create.inline.placeholder"))
  const resolvedSubmitLabel =
    submitLabel ??
    (variant === "header"
      ? t("home.create.inline.confirm")
      : t("home.create.popup.submit"))
  const resolvedSubmittingLabel =
    submittingLabel ?? t("home.create.popup.submitting")
  const resolvedSuccessLabel = successLabel ?? t("home.create.popup.success")
  const resolvedPartialSuccessLabel =
    partialSuccessLabel ?? t("home.create.popup.partialSuccess")
  const resolvedErrorLabel = errorLabel ?? t("home.create.popup.error")
  const resolvedAutoFocus = autoFocus ?? defaults.autoFocus
  const resolvedAllowEmpty = allowEmptyName ?? defaults.allowEmptyName
  const resolvedShowSuggestions = showSuggestions ?? defaults.showSuggestions
  const resolvedSuggestionLimit = suggestionsLimit ?? defaults.suggestionsLimit
  const resolvedShowStatus = showStatus ?? defaults.showStatus
  const resolvedAutoResetStatus = autoResetStatus ?? defaults.autoResetStatus
  const resolvedEnableGlobalSubmit =
    enableGlobalSubmit ?? defaults.enableGlobalSubmit

  useEffect(() => {
    if (!resolvedAutoFocus) return
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [resolvedAutoFocus])

  useEffect(() => {
    const isOpen = open ?? true
    if (!isOpen) return
    setName(initialName ?? "")
    setStatus("idle")
    setStatusMessage(null)
  }, [initialName, open])

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current)
        resetTimerRef.current = null
      }
    }
  }, [])

  const suggestions = useMemo(() => {
    if (!resolvedShowSuggestions) return []
    const trimmed = name.trim().toLowerCase()
    if (!trimmed) return []
    return sortedWorkspaces
      .filter((tag) => (tag.name || "").toLowerCase().includes(trimmed))
      .slice(0, resolvedSuggestionLimit)
  }, [name, resolvedShowSuggestions, resolvedSuggestionLimit, sortedWorkspaces])

  const queueStatusReset = useCallback(
    (duration: number) => {
      if (!resolvedAutoResetStatus) return
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current)
      }
      resetTimerRef.current = window.setTimeout(() => {
        setStatus("idle")
        setStatusMessage(null)
        resetTimerRef.current = null
      }, duration)
    },
    [resolvedAutoResetStatus]
  )

  const handleSubmit = useCallback(async () => {
    if (submissionPendingRef.current) return
    const trimmed = name.trim()
    if (!resolvedAllowEmpty && !trimmed) {
      inputRef.current?.focus()
      return
    }

    submissionPendingRef.current = true
    onSavingChange?.(true)
    setStatus("saving")
    setStatusMessage(null)

    let result: CreateWorkspaceResult
    try {
      const payload: CreateOptions = {
        ...(optionsRef.current ?? {}),
        name: trimmed || undefined
      }
      result = await createWorkspace(payload)
    } catch (err) {
      console.warn("[TabPlex] 新建工作区失败", err)
      setStatus("error")
      setStatusMessage(resolvedErrorLabel)
      if (variant === "header") {
        inputRef.current?.focus()
      }
      queueStatusReset(2000)
      if (onError) {
        onError(err)
      }
      submissionPendingRef.current = false
      onSavingChange?.(false)
      return
    }

    const activationFailed = result.activation.status === "failed"
    setStatus(activationFailed ? "warning" : "success")
    setStatusMessage(
      activationFailed ? resolvedPartialSuccessLabel : resolvedSuccessLabel
    )
    setName("")
    queueStatusReset(activationFailed ? 2400 : 1200)
    submissionPendingRef.current = false
    onSavingChange?.(false)

    if (onSuccess) {
      try {
        await onSuccess(result.workspace, result)
      } catch (error) {
        console.warn("[TabPlex] 新建工作区后的界面更新失败", error)
      }
    }
  }, [
    createWorkspace,
    name,
    onError,
    onSavingChange,
    onSuccess,
    queueStatusReset,
    resolvedAllowEmpty,
    resolvedErrorLabel,
    resolvedPartialSuccessLabel,
    resolvedSuccessLabel,
    status,
    variant
  ])

  useEffect(() => {
    if (!resolvedEnableGlobalSubmit) return
    const listener = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return
      const evAny = event as unknown as {
        isComposing?: boolean
        keyCode?: number
      }
      const isIME = Boolean(evAny?.isComposing) || evAny?.keyCode === 229
      if (isIME || isComposingRef.current) return
      const target = event.target as HTMLElement | null
      if (target && containerRef.current?.contains(target)) {
        event.preventDefault()
        void handleSubmit()
      }
    }
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [handleSubmit, resolvedEnableGlobalSubmit])

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void handleSubmit()
    },
    [handleSubmit]
  )

  const canSubmit =
    status !== "saving" && (resolvedAllowEmpty || name.trim().length > 0)
  const usesIconSubmit = variant === "header"

  return (
    <form
      ref={containerRef}
      className={cn("w-full", styles.container)}
      onSubmit={handleFormSubmit}
      noValidate>
      <div className={styles.controls}>
        <Input
          ref={inputRef}
          aria-label={resolvedPlaceholder}
          aria-describedby={
            resolvedShowStatus && statusMessage ? statusId : undefined
          }
          aria-invalid={status === "error" || undefined}
          placeholder={resolvedPlaceholder}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (
              status === "success" ||
              status === "warning" ||
              status === "error"
            ) {
              setStatus("idle")
              setStatusMessage(null)
            }
          }}
          onCompositionStart={() => {
            isComposingRef.current = true
          }}
          onCompositionEnd={() => {
            queueMicrotask(() => {
              isComposingRef.current = false
            })
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            const native = event.nativeEvent as KeyboardEvent
            const composing =
              Boolean(native.isComposing) || isComposingRef.current
            if (composing) {
              event.preventDefault()
              event.stopPropagation()
            }
          }}
          className={styles.input}
        />
        <div className={styles.buttonWrapper}>
          <Button
            type="submit"
            size="sm"
            className={styles.button}
            aria-label={
              usesIconSubmit
                ? status === "saving"
                  ? resolvedSubmittingLabel
                  : resolvedSubmitLabel
                : undefined
            }
            disabled={!canSubmit}>
            {status === "saving" ? (
              usesIconSubmit ? (
                <LoaderPinwheelIcon
                  className="animate-spin"
                  size={17}
                  aria-hidden="true"
                />
              ) : (
                <span className="flex items-center gap-2">
                  <LoaderPinwheelIcon className="animate-spin" />
                  {resolvedSubmittingLabel}
                </span>
              )
            ) : usesIconSubmit ? (
              <CheckIcon size={17} aria-hidden="true" />
            ) : (
              resolvedSubmitLabel
            )}
          </Button>
        </div>
      </div>

      {resolvedShowSuggestions && suggestions.length ? (
        <ScrollArea className={cn("max-h-40", styles.suggestions)}>
          <div className="space-y-1">
            {suggestions.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={styles.suggestionItem}
                onClick={() => setName(tag.name || "")}>
                <span className={styles.suggestionName}>
                  <span
                    className={styles.suggestionDot}
                    style={{
                      backgroundColor: resolveWorkspaceColor(
                        tag.color,
                        resolvedAccent
                      ),
                      boxShadow:
                        "0 8px 16px -18px hsl(var(--foreground) / 0.32)"
                    }}
                    aria-hidden="true">
                    {tag.emoji ? tag.emoji : null}
                  </span>
                  {tag.name || t("common.unnamedWorkspace")}
                </span>
                <span className={styles.suggestionHint}>
                  {t("common.pageCount", { count: tag.tabs?.length || 0 })}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      ) : null}

      {resolvedShowStatus && status !== "idle" && statusMessage ? (
        <div
          id={statusId}
          role={status === "error" ? "alert" : "status"}
          className={cn(
            styles.status,
            "rounded-md border px-3 py-2",
            status === "error"
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : status === "warning"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          )}>
          {statusMessage}
        </div>
      ) : null}
    </form>
  )
}

export default CreateWorkspaceForm
