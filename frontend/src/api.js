const BASE = import.meta.env.VITE_API_URL || ''

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export const api = {
  login:          (email, password)         => request('POST', '/agents/login',    { email, password }),
  register:       (name, email, pass)       => request('POST', '/agents/register', { name, email, password: pass }),
  me:             (token)                   => request('GET',  '/agents/me',       null, token),

  startMeeting:   (token)                   => request('POST', '/meetings/start',  null, token),
  endMeeting:     (token, id, total_chunks) => request('POST', `/meetings/${id}/end`, { total_chunks }, token),
  getResults:     (token, id)               => request('GET',  `/meetings/${id}/results`, null, token),
  getMeetings:    (token)                   => request('GET',  '/meetings/?limit=20', null, token),
  getGrowth:      (token)                   => request('GET',  '/growth',          null, token),

  getUploadUrl:   (token, id, filename)     => request('GET',
    `/meetings/${id}/upload-url?filename=${encodeURIComponent(filename)}`, null, token),

  uploadChunk: (token, meeting_id, s3_key) => {
    const fd = new FormData()
    fd.append('s3_key', s3_key)
    return fetch(`/meetings/${meeting_id}/chunk`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
      body:    fd
    }).then(r => r.json())
  },

  getContext:        (token)        => request('GET',    '/agents/context',      null, token),
  deleteContext:     (token)        => request('DELETE', '/agents/context',      null, token),
  uploadContextText: (token, text)  => request('POST',   '/agents/context/text', { text }, token),
}