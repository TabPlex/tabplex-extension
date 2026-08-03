import { useAnimation } from "motion/react"
import type { ForwardedRef, HTMLAttributes, MouseEventHandler } from "react"
import { useCallback, useImperativeHandle, useRef } from "react"

export type AnimatedIconHandle = {
  startAnimation: () => void
  stopAnimation: () => void
}

export interface AnimatedIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

type AnimatedIconInteractionProps = Pick<
  AnimatedIconProps,
  "onMouseEnter" | "onMouseLeave"
>

export const useAnimatedIcon = (
  ref: ForwardedRef<AnimatedIconHandle>,
  { onMouseEnter, onMouseLeave }: AnimatedIconInteractionProps
) => {
  const controls = useAnimation()
  const isControlledRef = useRef(false)

  useImperativeHandle(
    ref,
    () => {
      isControlledRef.current = true
      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal")
      }
    },
    [controls]
  )

  const handleMouseEnter = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      if (isControlledRef.current) onMouseEnter?.(event)
      else controls.start("animate")
    },
    [controls, onMouseEnter]
  )

  const handleMouseLeave = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      if (isControlledRef.current) onMouseLeave?.(event)
      else controls.start("normal")
    },
    [controls, onMouseLeave]
  )

  return { controls, handleMouseEnter, handleMouseLeave }
}
