import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import Team from '../pages/Team'

export const Route = createFileRoute('/team')({
  beforeLoad: () => {
    if (!localStorage.getItem('osf_token')) throw redirect({ to: '/login' })
  },
  component: TeamRoute,
})

function TeamRoute() {
  const { token, profile } = useAuth()
  return <Team token={token} profile={profile} />
}
