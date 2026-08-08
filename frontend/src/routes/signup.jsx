import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import Signup from '../pages/Signup'

export const Route = createFileRoute('/signup')({
  beforeLoad: () => {
    if (localStorage.getItem('osf_token')) throw redirect({ to: '/' })
  },
  head: () => ({
    meta: [
      { title: 'Create your OSF-Suite account' },
      {
        name: 'description',
        content: 'Sign up for OSF-Suite and start coaching your sales team with real-time AI call guidance.',
      },
      { property: 'og:title', content: 'Create your OSF-Suite account' },
      {
        property: 'og:description',
        content: 'Start coaching your sales team with real-time AI call guidance.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: SignupRoute,
})

function SignupRoute() {
  const { onLogin } = useAuth()
  return <Signup onLogin={onLogin} />
}
