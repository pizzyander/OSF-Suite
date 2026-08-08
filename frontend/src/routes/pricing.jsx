import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import Pricing from '../pages/Pricing'

export const Route = createFileRoute('/pricing')({
  beforeLoad: () => {
    if (!localStorage.getItem('osf_token')) throw redirect({ to: '/login' })
  },
  component: PricingRoute,
})

function PricingRoute() {
  const { token, profile } = useAuth()
  return <Pricing token={token} profile={profile} />
}
