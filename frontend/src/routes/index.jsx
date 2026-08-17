import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../authContext'
import OsfSuiteLandingPage from '../pages/OsfSuiteLandingPage'
import Dashboard from '../pages/Dashboard'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'OSF-Suite — Real-Time AI Sales Call Guidance' },
      {
        name: 'description',
        content:
          'OSF-Suite analyzes sales calls live, surfaces objection cards on the fly, and automates coaching for the whole team.',
      },
      { property: 'og:title', content: 'OSF-Suite — Real-Time AI Sales Call Guidance' },
      {
        property: 'og:description',
        content: 'Live in-call nudges, post-call analysis, and automated coaching for sales teams.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: IndexRoute,
})

function IndexRoute() {
  const { token, profile, logout } = useAuth()
  if (!token) return <OsfSuiteLandingPage />
  return <Dashboard token={token} profile={profile} onLogout={logout} />
}
