import type { SVGProps } from "react"
import { forwardRef } from "react"

import { ICON_SIZE, ICON_STROKE } from "~lib/iconDefaults"
import { cn } from "~lib/utils"

type TwitterIconProps = SVGProps<SVGSVGElement> & {
  size?: number
}

const TwitterIcon = forwardRef<SVGSVGElement, TwitterIconProps>(
  ({ className, size = ICON_SIZE, ...props }, ref) => (
    <svg
      ref={ref}
      className={cn(className)}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={ICON_STROKE}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
    </svg>
  )
)

TwitterIcon.displayName = "TwitterIcon"

export { TwitterIcon }
