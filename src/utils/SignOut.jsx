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

// M4 (audit F-06): the session wipe routes through sessionState so the
// ARCHITECTURE §3 contract holds; clear+swallow semantics unchanged.
import { clearAllSessionState } from './sessionState.js'
import { apiFetch } from './apiClient.js'

const AUTH_KEYS = [
  // Core auth / session
  'ts360_logged_in',
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
  // AUDIT #6: the device-local Step-1 draft is unsaved work; an explicit sign-out
  // clears it (privacy on shared devices). Tab close / idle-expiry do NOT go through
  // here, so those still resume from the draft.
  'ts360_step1_draft',
]

// ── FRESH-EYES F-1 (11 Sep 2026): SIGN-OUT CLEARED EVERYTHING EXCEPT THE CREDENTIAL ──
//
// After audit H5 (c16) removed the bearer token, the httpOnly session cookie became
// the ONLY credential. JavaScript cannot delete an httpOnly cookie. So this function
// was clearing the two things that had stopped being the credential (localStorage
// token, sessionStorage working set) and leaving the one that was. The API session
// stayed live after "Sign Out"; on a shared machine the next person at the browser
// could hit /auth/me, /records and the integrations routes directly, or re-enter the
// SPA by setting ts360_logged_in='1'. That is the H3 threat model reopened one layer
// down from where H3 closed it.
//
// The server already had the endpoint — POST /auth/logout (app/main.py:1715) deletes
// the cookie with the correct domain and path. Nothing called it.
//
// Ordering: fire the logout request FIRST (the cookie is still attached), then wipe
// local state, then navigate. The request is not awaited — signOut() is called
// synchronously from onClick handlers across six components and must stay that way —
// and the local wipe runs regardless of whether the request succeeds, so a network
// failure can never leave taxpayer data in the tab. keepalive is not available
// through apiFetch; a client-side route change (nav) does not tear down in-flight
// fetches the way a document unload does, so the request completes.
function endServerSession() {
  try {
    apiFetch('/auth/logout', { method: 'POST', credentials: 'include', raw: true })
      .catch(() => { /* F-1: local wipe below runs regardless; server session then expires on its own */ })
  } catch (_e) { /* F-1: same — never let a logout failure block the local wipe */ }
}

export function signOut(nav) {
  endServerSession()
  AUTH_KEYS.forEach(k => localStorage.removeItem(k))
  // ── AUDIT H3 (second launch audit, Sep 2026): SIGN-OUT LEFT TAXPAYER DATA IN THE TAB ──
  //
  // This function cleared localStorage only. clearAllSessionState() was imported at the
  // top of this file but had exactly one caller — wipeAccountLocalData() below, which
  // runs on account DELETION. So a normal sign-out left sessionStorage entirely intact:
  //
  //   ts360_f1040          the whole personal 1040 profile — W-2 income and withholding,
  //                        capital gains, dividends, SALT, ISO bargain element,
  //                        dependents, estimated payments
  //   ts360_entities_raw   per-entity P&L
  //   ts360_step1_entities  "
  //   ts360_biz_ein        the EIN, with the business name and address alongside it
  //
  // And the leak was not passive. CalculateTaxInner rehydrates from those keys on mount
  // with no account scoping — unlike the localStorage draft, which correctly refuses to
  // cross accounts. So: user A signs out on a shared machine, user B signs in in the same
  // tab, and B's Tax Tracker opens pre-populated with A's entity financials and A's 1040
  // figures. If B then saves, A's numbers are written into B's server-side record.
  //
  // A family computer or an office machine is enough. No technical skill required.
  //
  // Note what this does NOT clear: the ts360_records_* buckets in localStorage stay, by
  // deliberate design — signing out is not meant to destroy saved scenarios. That is a
  // separate, known exposure (audit item on unencrypted records surviving sign-out) and
  // is not what this line addresses.
  clearAllSessionState()
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
  clearAllSessionState()   // M4 (audit F-06): same clear+swallow semantics, contract-compliant home
  if (redirectTo) {
    window.location.replace(redirectTo)
    return
  }
  if (nav) nav('/')
}
