import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import Meeting from '../pages/Meeting'

export const Route = createFileRoute('/meeting')({
  beforeLoad: () => {
    if (!localStorage.getItem('osf_token')) throw redirect({ to: '/login' })
  },
  component: MeetingRoute,
})

function MeetingRoute() {
  const { token } = useAuth()
  return <Meeting token={token} />
}
