import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import JoinOrg from '../pages/JoinOrg'

export const Route = createFileRoute('/join')({
  component: JoinRoute,
})

function JoinRoute() {
  const { token, loadProfile } = useAuth()
  return <JoinOrg token={token} onAccepted={() => loadProfile(token)} />
}
