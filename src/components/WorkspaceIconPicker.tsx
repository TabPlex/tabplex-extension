import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~components/ui/button"
import { PlusIcon } from "~components/ui/plus"
import { Popover, PopoverContent, PopoverTrigger } from "~components/ui/popover"
import { RefreshCCWIcon } from "~components/ui/refresh-ccw"
import { ScrollArea } from "~components/ui/scroll-area"
import { Separator } from "~components/ui/separator"
import { DEFAULT_SETTINGS } from "~core/types"
import {
  colorChoices,
  isWorkspaceColorTransparent,
  normalizeWorkspaceColor,
  resolveWorkspaceColor
} from "~core/utils/colors"
import { EMOJI_SUGGESTIONS } from "~core/utils/emojis"
import { cn } from "~lib/utils"

interface WorkspaceIconPickerProps {
  // Emoji
  value?: string | null
  onChange: (value: string | null) => void

  // Color
  color?: string | null
  onColorChange?: (color: string | null) => void
  accentColor?: string

  // Style
  className?: string
  align?: "start" | "center" | "end"
}

export const WorkspaceIconPicker = ({
  value,
  onChange,
  color,
  onColorChange,
  accentColor,
  className,
  align = "start"
}: WorkspaceIconPickerProps) => {
  const { t } = useTranslation()
  const resolvedAccent =
    accentColor ?? DEFAULT_SETTINGS.accentColor ?? "#6C5CE7"

  const workspacePalette = useMemo(
    () => colorChoices(resolvedAccent),
    [resolvedAccent]
  )
  const workspaceColorOptions = useMemo<(string | null)[]>(
    () => [null, ...workspacePalette],
    [workspacePalette]
  )
  const defaultWorkspaceColor = workspacePalette[0] ?? resolvedAccent

  const handleRandom = useCallback(() => {
    if (!EMOJI_SUGGESTIONS.length) return
    const index = Math.floor(Math.random() * EMOJI_SUGGESTIONS.length)
    const emoji = EMOJI_SUGGESTIONS[index]
    onChange(emoji)
  }, [onChange])

  // Resolved color for the trigger button background
  const triggerBackgroundColor = useMemo(() => {
    if (!color) return undefined
    return resolveWorkspaceColor(color, defaultWorkspaceColor)
  }, [color, defaultWorkspaceColor])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-12 w-12 shrink-0 rounded-full text-2xl transition-[background-color,color] hover:bg-muted/80",
            !value && !color && "bg-muted/30 text-muted-foreground",
            className
          )}
          style={{
            backgroundColor:
              !value && !color ? undefined : triggerBackgroundColor
          }}
          title={t("home.workspace.iconPicker.title")}
          aria-label={t("home.workspace.iconPicker.title")}>
          {value ? (
            <span>{value}</span>
          ) : !color ? (
            <span className="flex items-center justify-center opacity-50 transition-opacity hover:opacity-100">
              <PlusIcon />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0 border-none" align={align}>
        <div className="flex flex-col gap-2 p-3">
          {/* Emoji Section */}
          <ScrollArea className="h-[260px] pr-2">
            <div className="grid grid-cols-7 gap-1 place-items-center">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary-readable"
                onClick={handleRandom}
                title={t("home.workspace.iconPicker.random")}
                aria-label={t("home.workspace.iconPicker.random")}>
                <RefreshCCWIcon />
              </button>
              <button
                type="button"
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-muted",
                  !value && "bg-primary/10 ring-1 ring-primary/20"
                )}
                onClick={() => onChange(null)}
                title={t("home.workspace.iconPicker.none")}
                aria-label={t("home.workspace.iconPicker.none")}>
                <span className="block h-3 w-3 rotate-45 border-r border-muted-foreground/40" />
              </button>
              {EMOJI_SUGGESTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md text-lg transition hover:bg-muted",
                    value === emoji && "bg-primary/15 ring-1 ring-primary/20"
                  )}
                  onClick={() => onChange(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          </ScrollArea>

          {/* Color Section */}
          {onColorChange && (
            <>
              <Separator className="my-1" />
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1">
                  {t("home.workspace.iconPicker.colorLabel")}
                </span>
                <div className="flex flex-wrap gap-2 px-1">
                  {workspaceColorOptions.map((colorOption, index) => {
                    const isTransparentOption = colorOption === null
                    const normalizedSelected = normalizeWorkspaceColor(
                      color ?? undefined
                    )
                    const normalizedOption = normalizeWorkspaceColor(
                      colorOption ?? undefined
                    )
                    const isActiveColor = isTransparentOption
                      ? isWorkspaceColorTransparent(color)
                      : normalizedSelected !== null &&
                        normalizedSelected !== undefined &&
                        normalizedOption !== null &&
                        normalizedOption !== undefined &&
                        normalizedSelected === normalizedOption

                    const resolvedColor = isTransparentOption
                      ? "transparent"
                      : resolveWorkspaceColor(
                          colorOption,
                          defaultWorkspaceColor
                        )
                    const swatchStyle = isTransparentOption
                      ? {
                          backgroundColor: "transparent",
                          backgroundImage:
                            "linear-gradient(45deg, hsl(var(--border) / 0.35) 25%, transparent 25%, transparent 75%, hsl(var(--border) / 0.35) 75%, hsl(var(--border) / 0.35)), linear-gradient(45deg, hsl(var(--border) / 0.35) 25%, transparent 25%, transparent 75%, hsl(var(--border) / 0.35) 75%, hsl(var(--border) / 0.35))",
                          backgroundPosition: "0 0, 5px 5px",
                          backgroundSize: "10px 10px"
                        }
                      : { backgroundColor: resolvedColor }

                    return (
                      <button
                        key={colorOption ?? `transparent-${index}`}
                        type="button"
                        style={swatchStyle}
                        className={cn(
                          "h-6 w-6 rounded-full border border-transparent transition-transform hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100",
                          isTransparentOption &&
                            "border-border/50 bg-background",
                          isActiveColor &&
                            "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110"
                        )}
                        onClick={() => onColorChange(colorOption)}
                        title={
                          isTransparentOption
                            ? t("home.workspace.iconPicker.noColor")
                            : t("home.workspace.iconPicker.colorOption", {
                                color: colorOption || ""
                              })
                        }
                        aria-label={
                          isTransparentOption
                            ? t("home.workspace.iconPicker.noColor")
                            : t("home.workspace.iconPicker.colorOption", {
                                color: colorOption || ""
                              })
                        }
                      />
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
