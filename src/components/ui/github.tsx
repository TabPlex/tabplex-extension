import type { SVGProps } from "react"
import { forwardRef } from "react"

import { ICON_SIZE, ICON_STROKE } from "~lib/iconDefaults"
import { cn } from "~lib/utils"

type GitHubIconProps = SVGProps<SVGSVGElement> & {
  size?: number
}

const GitHubIcon = forwardRef<SVGSVGElement, GitHubIconProps>(
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
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.28-.36 6.72-1.61 6.72-7.25A5.65 5.65 0 0 0 19.22 3.3 5.3 5.3 0 0 0 19.13 1S17.95.65 15 2.48a13.38 13.38 0 0 0-7 0C5.05.65 3.87 1 3.87 1a5.3 5.3 0 0 0-.09 2.3 5.65 5.65 0 0 0-1.5 3.95c0 5.63 3.44 6.88 6.72 7.25A4.8 4.8 0 0 0 8 18v4" />
      <path d="M8 19c-3 .9-3-1.5-4-2" />
    </svg>
  )
)

GitHubIcon.displayName = "GitHubIcon"

export { GitHubIcon }
