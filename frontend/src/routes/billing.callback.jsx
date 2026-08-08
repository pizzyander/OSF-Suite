import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import BillingCallback from '../pages/BillingCallback'

export const Route = createFileRoute('/billing/callback')({
  component: BillingCallbackRoute,
})

function BillingCallbackRoute() {
  const { token } = useAuth()
  return <BillingCallback token={token} />
}
