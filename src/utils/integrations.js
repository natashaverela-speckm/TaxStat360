// src/utils/integrations.js
//
// Integration credential helpers — extracted from constants.js (audit F-09, June 2026).
// Tax constants and credential helpers are environment-specific concerns; they do not
// belong in the same file. Import integrationKey() from here — never from constants.js.
//
// integrationKey() produces the namespaced localStorage/sessionStorage key used for
// every accounting-software integration field (token, connected, syncedAt, failed, extra).
//
// Consumers: CalculateTaxInner.jsx, App.jsx
// Key shape: ts360_{providerId}_{field}
//   e.g. integrationKey('quickbooks', 'connected') → 'ts360_quickbooks_connected'
//        integrationKey('xero', 'token')           → 'ts360_xero_token'

/**
 * Returns the namespaced storage key for an integration provider field.
 *
 * @param {string} providerId - e.g. 'quickbooks' | 'xero' | 'wave' | 'freshbooks'
 * @param {string} field      - e.g. 'connected' | 'token' | 'syncedAt' | 'failed' | 'extra'
 * @returns {string}
 */
export function integrationKey(providerId, field) {
  return `ts360_${providerId}_${field}`
}

// ─── Integration storage accessors (M4, audit F-06) ──────────────────────────
//
// CalculateTaxInner.jsx previously called localStorage/sessionStorage directly
// with integrationKey() in ~25 places. These helpers centralize every access so
// the storage layout is auditable in one file. SEMANTICS ARE PRESERVED EXACTLY:
//
//   • token       — written to BOTH stores (localStorage for persistence across
//                   sessions, sessionStorage so the current tab wins immediately
//                   after the OAuth return); READ session-first, then local.
//   • connected / failed / extra / syncedAt — localStorage only.
//   • No try/catch: the prior raw calls had none, and a storage exception here
//     surfaced to the ErrorBoundary before — behavior unchanged.
//
// KNOWN INCONSISTENCY PRESERVED (OBS-2, see KNOWN_LIMITATIONS.md): one legacy
// disconnect path clears only the localStorage token and leaves the session
// copy; the other clears both. Call sites reproduce their prior behavior
// verbatim via these fine-grained helpers — reconciling the two paths is an
// owner decision (it changes when a stale token can be reused within a tab).

/** localStorage field read (connected / failed / extra / syncedAt / token). */
export function readIntegrationField(providerId, field) {
  return localStorage.getItem(integrationKey(providerId, field))
}
export function writeIntegrationField(providerId, field, value) {
  localStorage.setItem(integrationKey(providerId, field), value)
}
export function removeIntegrationField(providerId, field) {
  localStorage.removeItem(integrationKey(providerId, field))
}

/** Token, session-first (matches every prior inline read):
 *  sessionStorage || localStorage || ''. */
export function readIntegrationToken(providerId) {
  return sessionStorage.getItem(integrationKey(providerId, 'token'))
      || localStorage.getItem(integrationKey(providerId, 'token'))
      || ''
}
/** OAuth-return token write: BOTH stores, matching the prior inline pair. */
export function writeIntegrationToken(providerId, token) {
  localStorage.setItem(integrationKey(providerId, 'token'), token)
  sessionStorage.setItem(integrationKey(providerId, 'token'), token)
}
/** Session-copy removal only — used by the disconnect path that also clears
 *  the localStorage copy separately (and by design NOT by the legacy path
 *  that leaves the session copy; see OBS-2 above). */
export function removeIntegrationSessionToken(providerId) {
  sessionStorage.removeItem(integrationKey(providerId, 'token'))
}
