import { MotionConfig } from "motion/react"

import { AppErrorBoundary } from "~components/AppErrorBoundary"
import { SettingsPage } from "~features/settings/components/SettingsPage"
import { WorkspaceDataProvider } from "~features/workspace/WorkspaceDataProvider"

import "~src/i18n"
import "~styles/tailwind.css"
import "~styles/home.css"
import "~styles/options.css"

const Options = () => (
  <MotionConfig reducedMotion="user">
    <AppErrorBoundary>
      <WorkspaceDataProvider>
        <SettingsPage />
      </WorkspaceDataProvider>
    </AppErrorBoundary>
  </MotionConfig>
)

export default Options
