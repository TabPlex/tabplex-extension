import React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~components/ui/button"
import { LoaderPinwheelIcon } from "~components/ui/loader-pinwheel"
import { PlusIcon } from "~components/ui/plus"

interface CreateWorkspaceInlineActionProps {
  onCreate: () => void | Promise<void>
  disabled: boolean
  busy: boolean
}

export const CreateWorkspaceInlineAction = ({
  onCreate,
  disabled,
  busy
}: CreateWorkspaceInlineActionProps) => {
  const { t } = useTranslation()
  const label = t("home.create.popup.submit")
  const busyLabel = t("home.create.popup.submitting")

  return (
    <Button
      variant="ghost"
      size="sm"
      className="create-workspace-button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-label={busy ? busyLabel : label}
      type="button"
      onClick={() => void onCreate()}>
      {busy ? (
        <LoaderPinwheelIcon
          className="animate-spin"
          size={17}
          aria-hidden="true"
        />
      ) : (
        <PlusIcon aria-hidden="true" />
      )}
      <span>{label}</span>
    </Button>
  )
}
