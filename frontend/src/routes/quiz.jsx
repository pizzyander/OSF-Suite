import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import Quiz from '../pages/Quiz'

export const Route = createFileRoute('/quiz')({
  beforeLoad: () => {
    if (!localStorage.getItem('osf_token')) throw redirect({ to: '/login' })
  },
  component: QuizRoute,
})

function QuizRoute() {
  const { token } = useAuth()
  return <Quiz token={token} />
}