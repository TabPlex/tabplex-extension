import React from "react"
import { HexColorInput, HexColorPicker } from "react-colorful"

import { Popover, PopoverContent, PopoverTrigger } from "~components/ui/popover"
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
  const titleRowClass = `${prefix}-title-row`
  const pickerClass = `${prefix}-picker`
  const pickerPreviewClass = `${prefix}-picker-preview`
  const popoverClass = `${prefix}-popover`
  const controlClass = `${prefix}-control`
  const valueRowClass = `${prefix}-value-row`
  const valueLabelClass = `${prefix}-value-label`
  const valueInputClass = `${prefix}-value-input`
  const swatchesClass = `${prefix}-swatches`
  const swatchClass = `${prefix}-swatch`
  const handleSwatchClick = (color: string) => {
    onChange(color)
    onCommit?.(color)
  }

  const handleHexInputChange = (color: string) => {
    if (/^#[0-9a-f]{6}$/i.test(color)) onChange(color)
  }

  const commitHexInputValue = (color: string) => {
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return
    onChange(color)
    onCommit?.(color)
  }

  const picker = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={pickerClass}
          aria-label={`${inputLabel} ${value.toUpperCase()}`}>
          <span>{inputLabel}</span>
          <span
            className={pickerPreviewClass}
            style={{ backgroundColor: value }}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className={popoverClass}>
        <HexColorPicker
          color={value}
          onChange={onChange}
          onChangeEnd={(color) => onCommit?.(color)}
          className={controlClass}
          aria-label={inputLabel}
        />
        <label className={valueRowClass} htmlFor={inputId}>
          <span className={valueLabelClass}>HEX</span>
          <HexColorInput
            id={inputId}
            color={value}
            onChange={handleHexInputChange}
            onBlur={(event) => commitHexInputValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              commitHexInputValue(event.currentTarget.value)
              event.currentTarget.blur()
            }}
            className={valueInputClass}
            aria-label={inputLabel}
            prefixed
          />
          <span
            className={pickerPreviewClass}
            style={{ backgroundColor: value }}
            aria-hidden="true"
          />
        </label>
      </PopoverContent>
    </Popover>
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
