import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import Login from '../pages/Login'

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    if (localStorage.getItem('osf_token')) throw redirect({ to: '/' })
  },
  component: LoginRoute,
})

function LoginRoute() {
  const { onLogin } = useAuth()
  return <Login onLogin={onLogin} />
}
