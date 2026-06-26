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
  'ts360_billing',
  'ts360_userName',
  'ts360_pendingEmail',
  // Legacy non-prefixed keys written by older code paths. The startup migration
  // (utils/migrateLegacyKeys) renames these to ts360_* on first load, so they will
  // normally be absent here; kept as belt-and-suspenders for not-yet-migrated state.
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

// Used after a permanent account DELETION (not a normal sign-out). Unlike signOut,
// which deliberately preserves saved tax scenarios, this erases EVERYTHING tied to
// the account on this device — auth, integration tokens, AND the ts360_records_*
// buckets — so no personal/tax data lingers locally after the account is gone.
export function wipeAccountLocalData(nav, { redirectTo = '/' } = {}) {
  try {
    const remove = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (k.startsWith('ts360_') || ['token', 'plan', 'billing', 'userName'].includes(k)) {
        remove.push(k)
      }
    }
    remove.forEach(k => localStorage.removeItem(k))
  } catch (e) {
    // Last resort: if enumeration fails, fall back to the known auth keys.
    AUTH_KEYS.forEach(k => localStorage.removeItem(k))
  }
  try {
    sessionStorage.clear()
  } catch (e) {}
  if (redirectTo) {
    window.location.replace(redirectTo)
    return
  }
  if (nav) nav('/')
}
