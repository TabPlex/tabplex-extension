"use client"

import { motion } from "motion/react"
import { forwardRef } from "react"

import type {
  AnimatedIconHandle,
  AnimatedIconProps
} from "~components/ui/animated-icon"
import { useAnimatedIcon } from "~components/ui/animated-icon"
import { ICON_SIZE, ICON_STROKE } from "~lib/iconDefaults"
import { cn } from "~lib/utils"

const PlusIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
        <motion.svg
          animate={controls}
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={ICON_STROKE}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
          variants={{
            normal: {
              rotate: 0
            },
            animate: {
              rotate: 180
            }
          }}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg">
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </motion.svg>
      </div>
    )
  }
)

PlusIcon.displayName = "PlusIcon"

export { PlusIcon }
