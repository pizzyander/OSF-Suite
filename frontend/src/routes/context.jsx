import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import Context from '../pages/Context'

export const Route = createFileRoute('/context')({
  beforeLoad: () => {
    if (!localStorage.getItem('osf_token')) throw redirect({ to: '/login' })
  },
  component: ContextRoute,
})

function ContextRoute() {
  const { token } = useAuth()
  return <Context token={token} />
}
