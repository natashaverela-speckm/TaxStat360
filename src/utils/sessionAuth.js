// Client-side session validity + auth-flag cleanup.
// Saved tax records (ts360_records_*) are intentionally preserved by everything here.

import { apiPost } from './apiClient.js'
import { readLoggedIn, readSessionStart } from './sessionState.js'

// D-11 (dead-code & duplication audit, Jul 2026): AUTH_KEYS, SESSION_MAX_AGE_MS,
// and isValidSession() moved here from App.jsx so there is ONE definition of
// "is this session valid". Onboarding.jsx previously carried a same-named
// function with DIFFERENT rules (no expiry check) — it now composes this one.
export const AUTH_KEYS = [
  'ts360_logged_in','ts360_token','ts360_session_start',
  'ts360_email','ts360_plan','plan','userName','ts360_connected_app',
  // Legacy keys from pre-SEC-04 — included so they get wiped on sign-out
  'token','ts360_session',
]
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

// Verbatim move of App.jsx's implementation: a session older than the max age is
// actively expired (server logout best-effort + auth-key purge) and reported invalid.
export function isValidSession() {
  const loggedIn = readLoggedIn()
  if (!loggedIn) return false
  const start = readSessionStart()
  if (start) {
    const startMs = parseInt(start, 10)
    if (!isNaN(startMs) && Date.now() - startMs > SESSION_MAX_AGE_MS) {
      apiPost('/auth/logout', undefined, { credentials: 'include' }).catch(() => {})
      AUTH_KEYS.forEach(k => localStorage.removeItem(k))
      return false
    }
  }
  return true
}

// D-07: no longer exported — only clearInvalidSession() below consumes it.
const INVALID_SESSION_KEYS = [
  'ts360_logged_in',
  'ts360_token',
  'ts360_plan',
  'ts360_session_start',
  'ts360_session',
  'token',
]

export function clearInvalidSession() {
  INVALID_SESSION_KEYS.forEach((k) => {
    try { localStorage.removeItem(k) } catch (_e) { /* ignore */ }
  })
}
