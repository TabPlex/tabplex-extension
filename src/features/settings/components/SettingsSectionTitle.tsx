import React, { type PropsWithChildren } from "react"

import { cn } from "~lib/utils"

export type SettingsSectionHeadingLevel = "h2" | "h3"

type SettingsSectionTitleProps = PropsWithChildren<{
  as: SettingsSectionHeadingLevel
  className?: string
}>

export const SettingsSectionTitle = ({
  as: Heading,
  className,
  children
}: SettingsSectionTitleProps) => (
  <Heading className={cn("settings-section-title", className)}>
    {children}
  </Heading>
)
