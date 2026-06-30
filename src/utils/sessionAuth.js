// Clears client auth flags when the server rejects the session (401).
// Saved tax records (ts360_records_*) are intentionally preserved.

export const INVALID_SESSION_KEYS = [
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
