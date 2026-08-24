// frontend/src/routes/feedback.jsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import Feedback from '../pages/Feedback'

export const Route = createFileRoute('/feedback')({
  beforeLoad: () => {
    if (!localStorage.getItem('osf_token')) throw redirect({ to: '/login' })
  },
  component: FeedbackRoute,
})

function FeedbackRoute() {
  const { token } = useAuth()
  return <Feedback token={token} />
}