import React from "react"

import { CheckIcon } from "~components/ui/check"
import { cn } from "~lib/utils"

type AccentColorPickerProps = {
  value: string
  presets: readonly string[]
  onChange: (value: string) => void
  onCommit?: (value: string) => void
  classPrefix: "settings" | "options"
  inputId: string
  inputLabel: string
  srLabel?: string
  title?: string
  titleClassName?: string
}

export const AccentColorPicker = ({
  value,
  presets,
  onChange,
  onCommit,
  classPrefix,
  inputId,
  inputLabel,
  srLabel,
  title,
  titleClassName
}: AccentColorPickerProps) => {
  const prefix = `${classPrefix}-accent`
  const showCheck = classPrefix === "settings"
  const titleRowClass = `${prefix}-title-row`
  const pickerClass = `${prefix}-picker`
  const swatchesClass = `${prefix}-swatches`
  const swatchClass = `${prefix}-swatch`
  const checkClass = `${prefix}-check`
  const handleSwatchClick = (color: string) => {
    onChange(color)
    onCommit?.(color)
  }

  const handleInputCommit = (event: React.PointerEvent<HTMLInputElement>) => {
    onCommit?.(event.currentTarget.value)
  }

  const picker = (
    <label className={pickerClass} htmlFor={inputId}>
      <span>{inputLabel}</span>
      <input
        id={inputId}
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPointerUp={handleInputCommit}
        onBlur={(event) => onCommit?.(event.currentTarget.value)}
      />
    </label>
  )

  const titleRow = title ? (
    <div className={titleRowClass}>
      <span className={cn(titleClassName)}>{title}</span>
      {picker}
    </div>
  ) : (
    picker
  )

  const swatches = (
    <div className={swatchesClass}>
      {presets.map((color) => {
        const isActive = color === value
        return (
          <button
            key={color}
            type="button"
            className={cn(swatchClass, isActive && "is-active")}
            style={{ backgroundColor: color }}
            onClick={() => handleSwatchClick(color)}
            aria-pressed={isActive}
            title={color}>
            {isActive && showCheck ? (
              <CheckIcon className={checkClass} />
            ) : null}
            <span className="sr-only">
              {srLabel ? `${srLabel} ${color}` : color}
            </span>
          </button>
        )
      })}
    </div>
  )

  return (
    <>
      {titleRow}
      {swatches}
    </>
  )
}
