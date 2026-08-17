import React, { type ReactElement } from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "~components/ui/tooltip"
import { cn } from "~lib/utils"

type LockedDeleteTooltipProps = {
  locked: boolean
  message: string
  children: ReactElement
  triggerClassName?: string
}

export const LockedDeleteTooltip = ({
  locked,
  message,
  children,
  triggerClassName
}: LockedDeleteTooltipProps) => {
  if (!locked) return children

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn("locked-delete-tooltip-trigger", triggerClassName)}
            role="group"
            aria-label={message}
            tabIndex={0}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse") event.preventDefault()
            }}
            onClick={(event) => {
              if (event.detail > 0) event.currentTarget.blur()
            }}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">{message}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
