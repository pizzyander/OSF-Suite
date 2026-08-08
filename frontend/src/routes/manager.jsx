import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import ManagerDashboard from '../pages/ManagerDashboard'

export const Route = createFileRoute('/manager')({
  beforeLoad: () => {
    if (!localStorage.getItem('osf_token')) throw redirect({ to: '/login' })
  },
  component: ManagerRoute,
})

function ManagerRoute() {
  const { token, profile } = useAuth()
  return <ManagerDashboard token={token} profile={profile} />
}
