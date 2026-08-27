import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import Onboarding from '../pages/Onboarding'

export const Route = createFileRoute('/onboarding')({
  component: OnboardingRoute,
})

function OnboardingRoute() {
  const { onLogin, handleOnboardingComplete } = useAuth()
  return <Onboarding onLogin={onLogin} onComplete={handleOnboardingComplete} />
}