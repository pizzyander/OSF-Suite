import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import Coaching from '../pages/Coaching'

export const Route = createFileRoute('/coaching')({
  beforeLoad: () => {
    if (!localStorage.getItem('osf_token')) throw redirect({ to: '/login' })
  },
  component: CoachingRoute,
})

function CoachingRoute() {
  const { token } = useAuth()
  return <Coaching token={token} />
}
