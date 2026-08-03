export const createLongHoverController = ({
  delayMs = 900
}: { delayMs?: number } = {}) => {
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    if (!timer) return
    globalThis.clearTimeout(timer)
    timer = null
  }

  return {
    enter: (onFire: () => void) => {
      clear()
      timer = globalThis.setTimeout(() => {
        timer = null
        onFire()
      }, delayMs)
    },
    leave: () => clear(),
    dispose: () => clear()
  }
}
