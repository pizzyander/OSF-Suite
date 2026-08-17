import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import Referrals from '../pages/Referrals'

export const Route = createFileRoute('/referrals')({
  beforeLoad: () => {
    if (!localStorage.getItem('osf_token')) throw redirect({ to: '/login' })
  },
  component: ReferralsRoute,
})

function ReferralsRoute() {
  const { token } = useAuth()
  return <Referrals token={token} />
}
