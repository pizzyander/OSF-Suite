import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import Billing from '../pages/Billing'

export const Route = createFileRoute('/billing')({
  beforeLoad: () => {
    if (!localStorage.getItem('osf_token')) throw redirect({ to: '/login' })
  },
  component: BillingRoute,
})

function BillingRoute() {
  const { token, profile } = useAuth()
  return <Billing token={token} profile={profile} />
}
