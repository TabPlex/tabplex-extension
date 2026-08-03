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

const ARROW_TRANSITION: Transition = {
  type: "spring",
  stiffness: 250,
  damping: 25
}

const ARROW_VARIANTS: Variants = {
  normal: {
    rotate: "0deg"
  },
  animate: {
    rotate: "-50deg"
  }
}

const HAND_TRANSITION: Transition = {
  duration: 0.6,
  ease: [0.4, 0, 0.2, 1]
}

const HAND_VARIANTS: Variants = {
  normal: {
    rotate: 0,
    originX: "0%",
    originY: "100%"
  },
  animate: {
    rotate: -360,
    originX: "0%",
    originY: "100%"
  }
}

const MINUTE_HAND_TRANSITION: Transition = {
  duration: 0.5,
  ease: "easeInOut"
}

const MINUTE_HAND_VARIANTS: Variants = {
  normal: {
    rotate: 0,
    originX: "0%",
    originY: "0%"
  },
  animate: {
    rotate: -45,
    originX: "0%",
    originY: "0%"
  }
}

const HistoryIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
          <motion.g
            animate={controls}
            transition={ARROW_TRANSITION}
            variants={ARROW_VARIANTS}>
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </motion.g>
          <motion.line
            animate={controls}
            initial="normal"
            transition={HAND_TRANSITION}
            variants={HAND_VARIANTS}
            x1="12"
            x2="12"
            y1="12"
            y2="7"
          />
          <motion.line
            animate={controls}
            initial="normal"
            transition={MINUTE_HAND_TRANSITION}
            variants={MINUTE_HAND_VARIANTS}
            x1="12"
            x2="16"
            y1="12"
            y2="14"
          />
        </svg>
      </div>
    )
  }
)

HistoryIcon.displayName = "HistoryIcon"

export { HistoryIcon }
