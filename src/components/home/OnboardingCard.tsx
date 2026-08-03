import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~components/ui/button"

type OnboardingCardProps = {
  guideWorkspaceId?: string | null
  onOpenGuide: () => void
  onDismiss: () => void
}

export const OnboardingCard = ({
  guideWorkspaceId,
  onOpenGuide,
  onDismiss
}: OnboardingCardProps) => {
  const { t } = useTranslation()
  const steps = useMemo(
    () => [
      {
        title: t("home.onboarding.steps.switch.title"),
        desc: t("home.onboarding.steps.switch.desc")
      },
      {
        title: t("home.onboarding.steps.create.title"),
        desc: t("home.onboarding.steps.create.desc")
      },
      {
        title: t("home.onboarding.steps.note.title"),
        desc: t("home.onboarding.steps.note.desc")
      }
    ],
    [t]
  )

  return (
    <section className="onboarding-card">
      <div className="onboarding-steps">
        {steps.map((step, index) => (
          <div className="onboarding-step" key={step.title}>
            <div className="onboarding-step-index">{index + 1}</div>
            <div className="onboarding-step-body">
              <div className="onboarding-step-title">{step.title}</div>
              <div className="onboarding-step-desc">{step.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="onboarding-actions">
        <Button
          size="sm"
          onClick={onOpenGuide}
          disabled={!guideWorkspaceId}
          type="button">
          {t("home.onboarding.actions.openGuide")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="onboarding-dismiss ml-auto"
          onClick={onDismiss}
          type="button">
          {t("home.onboarding.actions.dismiss")}
        </Button>
      </div>
    </section>
  )
}
