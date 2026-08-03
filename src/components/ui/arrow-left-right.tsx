import type { HTMLAttributes } from "react"
import { forwardRef } from "react"

import { ICON_SIZE, ICON_STROKE } from "~lib/iconDefaults"
import { cn } from "~lib/utils"

interface ArrowLeftRightIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const ArrowLeftRightIcon = forwardRef<HTMLDivElement, ArrowLeftRightIconProps>(
  ({ className, size = ICON_SIZE, ...props }, ref) => (
    <div ref={ref} className={cn(className)} {...props}>
      <svg
        aria-hidden="true"
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={ICON_STROKE}
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg">
        <path d="m8 3-4 4 4 4" />
        <path d="M4 7h16" />
        <path d="m16 21 4-4-4-4" />
        <path d="M20 17H4" />
      </svg>
    </div>
  )
)

ArrowLeftRightIcon.displayName = "ArrowLeftRightIcon"

export { ArrowLeftRightIcon }
