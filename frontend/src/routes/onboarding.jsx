import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import Onboarding from '../pages/Onboarding'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: () => {
    if (!localStorage.getItem('osf_token')) throw redirect({ to: '/login' })
  },
  component: OnboardingRoute,
})

function OnboardingRoute() {
  const { token, handleOnboardingComplete } = useAuth()
  return <Onboarding token={token} onComplete={handleOnboardingComplete} />
}
