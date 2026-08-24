const BASE = import.meta.env.VITE_API_URL || ''

let refreshPromise = null

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined
  })

  if (res.status === 401 && token) {
    const newAccessToken = await refreshAccessToken()
    if (newAccessToken) {
      return request(method, path, body, newAccessToken)
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const error = new Error(err.detail || res.statusText)
    error.status = res.status  // lets callers check e.g. error.status === 402 instead of matching message text
    throw error
  }
  return res.json()
}

let onTokenRefreshed = null

export function setTokenRefreshHandler(fn) {
  onTokenRefreshed = fn
}

async function refreshAccessToken() {
  const storedRefresh = localStorage.getItem('osf_refresh_token')
  if (!storedRefresh) return null

  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE}/agents/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: storedRefresh })
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.access_token) {
          localStorage.setItem('osf_token', data.access_token)
          if (data.refresh_token) {
            localStorage.setItem('osf_refresh_token', data.refresh_token)
          }
          onTokenRefreshed?.(data.access_token)
          return data.access_token
        }
        localStorage.removeItem('osf_token')
        localStorage.removeItem('osf_refresh_token')
        onTokenRefreshed?.(null)
        return null
      })
      .catch(() => null)
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

export const api = {
  // -- Auth --------------------------------------------------------------------
  login:          (email, password)         => request('POST', '/agents/login',    { email, password }),
  register: (name, email, pass, referral_code = null, terms_version = null, privacy_version = null) =>
  request('POST', '/agents/register', { name, email, password: pass, referral_code, terms_version, privacy_version }),
  me:             (token)                   => request('GET',  '/agents/me',       null, token),
  changePassword: (token, old_password, new_password) =>
                                               request('PUT',  '/agents/password', { old_password, new_password }, token),

  // -- Email verification & password reset --------------------------------------
  verifyEmail:         (token)               => request('POST', '/agents/verify-email', { token }, null),
  resendVerification:  (token)               => request('POST', '/agents/resend-verification', null, token),
  forgotPassword:      (email)               => request('POST', '/agents/forgot-password', { email }, null),
  resetPassword:       (token, new_password) => request('POST', '/agents/reset-password', { token, new_password }, null),

  // -- Onboarding ----------------------------------------------------------------
  saveOnboarding: (token, fields) => request('PUT', '/agents/onboarding', fields, token),

  // -- Billing ---------------------------------------------------------------------
  // currency defaults to 'NGN'; pass 'USD' for dollar-denominated plans.
  subscribe:     (token, plan, seats = null, currency = 'NGN') =>
                     request('POST', '/billing/subscribe', { plan, seats, currency }, token),
  billingStatus: (token)                     => request('GET', '/billing/status', null, token),
  getTrialStatus: (token)                    => request('GET', '/billing/trial-status', null, token),

  // -- Referrals ---------------------------------------------------------------------
  getReferralLink:  (token) => request('GET', '/referrals/my-code', null, token),
  getReferralStats: (token) => request('GET', '/referrals/stats', null, token),

  // -- Organizations ---------------------------------------------------------------
  createOrganization: (token, name) => request('POST', '/organizations', { name }, token),
  createInvite: (token, email, role, manager_id = null) =>
    request('POST', '/organizations/invites', { email, role, manager_id }, token),
  listInvites:  (token)             => request('GET', '/organizations/invites', null, token),
  revokeInvite: (token, invite_id)  => request('DELETE', `/organizations/invites/${invite_id}`, null, token),
  listMembers:  (token)             => request('GET', '/organizations/members', null, token),
  updateMember: (token, agent_id, updates) => request('PATCH', `/organizations/members/${agent_id}`, updates, token),

  // -- Invite acceptance -----------------------------------------------------------
  previewInvite: (inviteToken)        => request('GET', `/invites/${inviteToken}`, null, null),
  acceptInvite:  (token, inviteToken) => request('POST', `/invites/${inviteToken}/accept`, null, token),

  // -- Manager dashboard -------------------------------------------------------------
  getTeamMeetings: (token, limit = 50) => request('GET', `/team/meetings?limit=${limit}`, null, token),
  getTeamStats:    (token)             => request('GET', '/team/stats', null, token),

  // -- Feedback & feature requests -----------------------------------------------
  submitFeedback:    (token, message, category = 'general') =>
                        request('POST', '/feedback', { message, category }, token),
  getFeatures:       (token) => request('GET', '/features', null, token),
  submitFeature:     (token, title, description) =>
                        request('POST', '/features', { title, description }, token),
  toggleFeatureVote: (token, featureId) => request('POST', `/features/${featureId}/vote`, null, token),

  // -- Legal ---------------------------------------------------------------------
  getLegalMeta:  ()                        => request('GET', '/legal/meta', null, null),
  logLegalView:  (document, eventType = 'view') =>
                     request('POST', '/legal/view', { document, event_type: eventType }, null),

  // -- Coaching plans & winning patterns -----------------------------------------------
  getCoachingPlan:    (token) => request('GET', '/coaching/plan', null, token),
  getCoachingHistory: (token) => request('GET', '/coaching/plans', null, token),
  getWinningPatterns: (token) => request('GET', '/coaching/winning-patterns', null, token),

  // -- Meetings ------------------------------------------------------------------------
  startMeeting:   (token)                   => request('POST', '/meetings/start',  null, token),
  endMeeting:     (token, id, total_chunks) => request('POST', `/meetings/${id}/end`, { total_chunks }, token),
  getResults:     (token, id)               => request('GET',  `/meetings/${id}/results`, null, token),
  getMeetings:    (token)                   => request('GET',  '/meetings?limit=20', null, token),
  getGrowth:      (token)                   => request('GET',  '/growth',          null, token),

  getUploadUrl: (token, id, filename) =>
    request('GET', `/meetings/${id}/upload-url?filename=${encodeURIComponent(filename)}`, null, token),

  uploadChunk: (token, meeting_id, s3_key) => {
    const fd = new FormData()
    fd.append('s3_key', s3_key)
    return fetch(`${BASE}/meetings/${meeting_id}/chunk`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
      body:    fd
    }).then(r => r.json())
  },

  uploadComplete: (token, meeting_id, s3_key, chunk_seconds = 30) => {
    const fd = new FormData()
    fd.append('s3_key', s3_key)
    fd.append('chunk_seconds', chunk_seconds)
    return fetch(`${BASE}/meetings/${meeting_id}/upload-complete`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
      body:    fd
    }).then(r => {
      if (!r.ok) return r.json().then(e => { throw new Error(e.detail || r.statusText) })
      return r.json()
    })
  },

  // -- Company context ----------------------------------------------------------------
  getContext:        (token)       => request('GET',    '/agents/context',      null, token),
  deleteContext:     (token)       => request('DELETE', '/agents/context',      null, token),
  uploadContextText: (token, text) => request('POST',   '/agents/context/text', { text }, token),

  uploadContextFile: (token, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return fetch(`${BASE}/agents/context/upload`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
      body:    fd
    }).then(r => r.json())
  },
}
