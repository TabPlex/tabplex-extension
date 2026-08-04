import { motion, useInView, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useRef, type Key, type ReactNode } from "react"

import { cn } from "~lib/utils"

interface AnimatedListItemProps {
  children: ReactNode
  delay?: number
  index: number
  className?: string
}

const MAX_STAGGERED_ITEMS = 8

export const resolveAnimatedListItemDelay = (
  index: number,
  staggerDelay: number
) => (index < MAX_STAGGERED_ITEMS ? index * staggerDelay : 0)

export const resolveAnimatedListItemMotion = ({
  reduceMotion,
  inView,
  delay
}: {
  reduceMotion: boolean
  inView: boolean
  delay: number
}) => {
  if (reduceMotion) {
    return {
      initial: false as const,
      animate: { scale: 1, opacity: 1, y: 0 },
      transition: { duration: 0 }
    }
  }

  return {
    initial: { scale: 0.98, opacity: 0, y: 6 },
    animate: inView
      ? { scale: 1, opacity: 1, y: 0 }
      : { scale: 0.98, opacity: 0, y: 6 },
    transition: { duration: 0.2, delay }
  }
}

const AnimatedListItem = ({
  children,
  delay = 0,
  index,
  className
}: AnimatedListItemProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.5, once: true })
  const reduceMotion = useReducedMotion() === true
  const itemMotion = resolveAnimatedListItemMotion({
    reduceMotion,
    inView,
    delay
  })

  return (
    <motion.div
      ref={ref}
      data-index={index}
      className={className}
      initial={itemMotion.initial}
      animate={itemMotion.animate}
      transition={itemMotion.transition}>
      {children}
    </motion.div>
  )
}

interface AnimatedListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  getItemKey?: (item: T, index: number) => Key
  showGradients?: boolean
  className?: string
  listClassName?: string
  itemClassName?: string
  displayScrollbar?: boolean
  staggerDelay?: number
}

const AnimatedList = <T,>({
  items,
  renderItem,
  getItemKey,
  showGradients = true,
  className,
  listClassName,
  itemClassName,
  displayScrollbar = true,
  staggerDelay = 0.04
}: AnimatedListProps<T>) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const gradientFrameRef = useRef<number | null>(null)

  const updateGradients = useCallback(() => {
    if (gradientFrameRef.current !== null) return
    gradientFrameRef.current = window.requestAnimationFrame(() => {
      gradientFrameRef.current = null
      const target = listRef.current
      const container = containerRef.current
      if (!target || !container) return
      const { scrollTop, scrollHeight, clientHeight } = target
      const bottomDistance = scrollHeight - (scrollTop + clientHeight)
      container.style.setProperty(
        "--animated-list-top-opacity",
        String(Math.min(scrollTop / 50, 1))
      )
      container.style.setProperty(
        "--animated-list-bottom-opacity",
        String(
          scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1)
        )
      )
    })
  }, [])

  useEffect(() => {
    updateGradients()
    return () => {
      if (gradientFrameRef.current !== null) {
        window.cancelAnimationFrame(gradientFrameRef.current)
        gradientFrameRef.current = null
      }
    }
  }, [updateGradients, items.length])

  return (
    <div
      ref={containerRef}
      className={cn("animated-list-container", className)}>
      <div
        ref={listRef}
        className={cn(
          "animated-list-scroll",
          !displayScrollbar && "animated-list-no-scrollbar",
          listClassName
        )}
        onScroll={updateGradients}>
        {items.map((item, index) => (
          <AnimatedListItem
            key={getItemKey?.(item, index) ?? index}
            delay={resolveAnimatedListItemDelay(index, staggerDelay)}
            index={index}
            className={itemClassName}>
            {renderItem(item, index)}
          </AnimatedListItem>
        ))}
      </div>
      {showGradients ? (
        <>
          <div className="animated-list-top-gradient" />
          <div className="animated-list-bottom-gradient" />
        </>
      ) : null}
    </div>
  )
}

export default AnimatedList
