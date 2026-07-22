// validation.js — shared frontend validation, mirroring schemas.py's rules.
//
// This is a first line of defense for UX (instant feedback, no round
// trip to the server for an obvious typo) — the backend's Pydantic
// schemas remain the real source of truth and validate again regardless.
// Never trust client-side validation alone for anything security-relevant.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email) {
  if (!email.trim()) return 'Email is required'
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address'
  return null
}

export function validatePassword(password) {
  if (!password) return 'Password is required'
  if (password.length < 8) return 'Password must be at least 8 characters'
  return null
}

export function passwordStrength(password) {
  if (!password) return { label: '', score: 0 }
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  const labels = ['Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Strong']
  return { label: labels[score], score }
}

export function validateRequired(value, fieldName) {
  if (!value || !value.toString().trim()) return `${fieldName} is required`
  return null
}