const BASE = import.meta.env.VITE_API_URL || ''

let refreshPromise = null
// A wrapper around fetch() that automatically adds the Authorization header
// and handles 401 responses by trying to refresh the access token once.
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
      return request(method, path, body, newAccessToken) // retry once
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

//setting-up a callback to notify React when the token is refreshed or invalidated
let onTokenRefreshed = null

export function setTokenRefreshHandler(fn) {
  onTokenRefreshed = fn
}
// Refresh the access token using the refresh token stored in localStorage.
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
          onTokenRefreshed?.(data.access_token) // tell React
          return data.access_token
        }
        localStorage.removeItem('osf_token')
        localStorage.removeItem('osf_refresh_token')
        onTokenRefreshed?.(null) // tell React the session is dead
        return null
      })
      .catch(() => null)
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}
// The main API object that the rest of the app uses.

export const api = {
  login:          (email, password)         => request('POST', '/agents/login',    { email, password }),
  register:       (name, email, pass)       => request('POST', '/agents/register', { name, email, password: pass }),
  me:             (token)                   => request('GET',  '/agents/me',       null, token),
  changePassword: (token, old_password, new_password) =>
                                               request('PUT',  '/agents/password', { old_password, new_password }, token),

  startMeeting:   (token)                   => request('POST', '/meetings/start',  null, token),
  endMeeting:     (token, id, total_chunks) => request('POST', `/meetings/${id}/end`, { total_chunks }, token),
  getResults:     (token, id)               => request('GET',  `/meetings/${id}/results`, null, token),
  getMeetings:    (token)                   => request('GET',  '/meetings?limit=20', null, token),
  getGrowth:      (token)                   => request('GET',  '/growth',          null, token),

  getUploadUrl:   (token, id, filename)     => request('GET',
    `/meetings/${id}/upload-url?filename=${encodeURIComponent(filename)}`, null, token),

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
  getContext:        (token)        => request('GET',    '/agents/context',      null, token),
  deleteContext:     (token)        => request('DELETE', '/agents/context',      null, token),
  uploadContextText: (token, text)  => request('POST',   '/agents/context/text', { text }, token),

  uploadContextFile: (token, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return fetch(`${BASE}/agents/context/upload`, {   // ← missing ${BASE}
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
      body:    fd
    }).then(r => r.json())
  },
}