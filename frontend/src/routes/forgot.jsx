import { createFileRoute, redirect } from '@tanstack/react-router'
import ForgotPassword from '../pages/ForgotPassword'

export const Route = createFileRoute('/forgot')({
  beforeLoad: () => {
    if (localStorage.getItem('osf_token')) throw redirect({ to: '/' })
  },
  component: ForgotPassword,
})
