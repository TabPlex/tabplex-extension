"use client"

import type { Transition } from "motion/react"
import { motion } from "motion/react"
import { forwardRef } from "react"

import type {
  AnimatedIconHandle,
  AnimatedIconProps
} from "~components/ui/animated-icon"
import { useAnimatedIcon } from "~components/ui/animated-icon"
import { ICON_SIZE, ICON_STROKE } from "~lib/iconDefaults"
import { cn } from "~lib/utils"

const DEFAULT_TRANSITION: Transition = {
  times: [0, 0.4, 1],
  duration: 0.5
}

const ChevronUpIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { onMouseEnter, onMouseLeave, className, size = ICON_SIZE, ...props },
    ref
  ) => {
    const { controls, handleMouseEnter, handleMouseLeave } = useAnimatedIcon(
      ref,
      { onMouseEnter, onMouseLeave }
    )

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}>
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={ICON_STROKE}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg">
          <motion.path
            animate={controls}
            d="m18 15-6-6-6 6"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { y: 0 },
              animate: { y: [0, -2, 0] }
            }}
          />
        </svg>
      </div>
    )
  }
)

ChevronUpIcon.displayName = "ChevronUpIcon"

export { ChevronUpIcon }
