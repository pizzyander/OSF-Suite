import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import MeetingDetail from '../pages/MeetingDetail'

export const Route = createFileRoute('/meeting/$id')({
  beforeLoad: () => {
    if (!localStorage.getItem('osf_token')) throw redirect({ to: '/login' })
  },
  component: MeetingDetailRoute,
})

function MeetingDetailRoute() {
  const { token } = useAuth()
  const { id } = Route.useParams()
  return <MeetingDetail token={token} id={id} />
}
