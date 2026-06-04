// src/utils/signOut.jsx
//
// FIX (SIGN-OUT): Replace localStorage.clear() with a controlled removal list.
//
// The original implementation called localStorage.clear() which deleted ALL
// user data on sign-out — including ts360_records_* (saved tax scenarios)
// that users expect to persist across sessions. This fix removes only auth
// tokens, session state, and integration credentials, leaving saved records
// and user preferences intact.
//
// PRESERVE on sign-out:
//   ts360_records_*        — saved tax scenarios (per-email keyed)
//   ts360_records          — canonical records mirror
//   ts360_disclaimer_seen  — "don't show again" preference
//
// REMOVE on sign-out:
//   auth / session         — ts360_token, ts360_session, ts360_session_start,
//                            ts360_email, ts360_login_history, ts360_plan,
//                            token, plan, billing, userName
//   integration tokens     — QuickBooks, Xero, Wave, FreshBooks
//   app state              — ts360_connected_app

const AUTH_KEYS = [
  // Core auth / session
  'ts360_token',
  'ts360_session',
  'ts360_session_start',
  'ts360_email',
  'ts360_email_verified',
  'ts360_email_confirmed_ack',
  'pendingEmail',
  'ts360_login_history',
  'ts360_plan',
  // Legacy non-prefixed keys written by older code paths
  'token',
  'plan',
  'billing',
  'userName',
  // Integration connection state
  'ts360_connected_app',
  'ts360_quickbooks_token',
  'ts360_quickbooks_connected',
  'ts360_quickbooks_extra',
  'ts360_xero_token',
  'ts360_xero_connected',
  'ts360_xero_refresh',
  'ts360_wave_token',
  'ts360_wave_connected',
  'ts360_freshbooks_token',
  'ts360_freshbooks_connected',
]

export function signOut(nav) {
  AUTH_KEYS.forEach(k => localStorage.removeItem(k))
  nav('/')
}
