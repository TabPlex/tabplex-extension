import { useEffect, useLayoutEffect } from "react"

import type { Settings } from "~core/types"
import { DEFAULT_SETTINGS } from "~core/types"
import { applyAccentTheme } from "~core/utils/colors"
import { useBrowserTheme } from "~hooks/useBrowserTheme"

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

export const useTheme = (settings: Settings) => {
  const themePreference = settings?.theme ?? "system"
  const accentColor =
    settings?.accentColor ?? DEFAULT_SETTINGS.accentColor ?? "#6C5CE7"

  const browserTheme = useBrowserTheme()

  const resolvedTheme =
    themePreference === "system" ? browserTheme : themePreference

  useIsomorphicLayoutEffect(() => {
    if (typeof document === "undefined") return
    const root = document.documentElement
    if (resolvedTheme === "dark") root.classList.add("dark")
    else root.classList.remove("dark")
    root.style.colorScheme = resolvedTheme
    root.dataset.themePreference = themePreference
    root.dataset.themeResolved = resolvedTheme
    return () => {
      root.classList.remove("dark")
      root.style.colorScheme = ""
      delete root.dataset.themePreference
      delete root.dataset.themeResolved
    }
  }, [resolvedTheme, themePreference])

  useEffect(() => {
    applyAccentTheme(accentColor, resolvedTheme)
  }, [accentColor, resolvedTheme])

  return { resolvedTheme, accentColor }
}
