import { useEffect, useState } from "react"

import type { ResolvedTheme } from "~lib/common"
import { resolveBrowserThemeSync, watchBrowserTheme } from "~lib/common"

export const useBrowserTheme = () => {
  const [theme, setTheme] = useState<ResolvedTheme>(() =>
    resolveBrowserThemeSync()
  )

  useEffect(() => watchBrowserTheme(setTheme), [])

  return theme
}
