"use client"

import type { Transition, Variants } from "motion/react"
import { motion } from "motion/react"
import { forwardRef } from "react"

import type {
  AnimatedIconHandle,
  AnimatedIconProps
} from "~components/ui/animated-icon"
import { useAnimatedIcon } from "~components/ui/animated-icon"
import { ICON_SIZE, ICON_STROKE } from "~lib/iconDefaults"
import { cn } from "~lib/utils"

const G_VARIANTS: Variants = {
  normal: { rotate: 0 },
  animate: {
    rotate: 360,
    transition: {
      repeat: Number.POSITIVE_INFINITY,
      duration: 1,
      ease: "linear"
    }
  }
}

const DEFAULT_TRANSITION: Transition = {
  type: "spring",
  stiffness: 50,
  damping: 10
}

const LoaderPinwheelIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
        className={cn(
          "inline-flex shrink-0 items-center justify-center",
          className
        )}
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
          <motion.g
            animate={controls}
            transition={DEFAULT_TRANSITION}
            variants={G_VARIANTS}>
            <path d="M22 12a1 1 0 0 1-10 0 1 1 0 0 0-10 0" />
            <path d="M7 20.7a1 1 0 1 1 5-8.7 1 1 0 1 0 5-8.6" />
            <path d="M7 3.3a1 1 0 1 1 5 8.6 1 1 0 1 0 5 8.6" />
          </motion.g>
          <circle cx="12" cy="12" r="10" />
        </svg>
      </div>
    )
  }
)

LoaderPinwheelIcon.displayName = "LoaderPinwheelIcon"

export { LoaderPinwheelIcon }
