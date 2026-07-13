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
// ── Third-party form endpoints (M7, audit F-09) ──────────────────────────────
// Previously the web3forms access key was hardcoded in THREE component files and
// the Mailchimp subscribe URL inline in Onboarding — four places to update on a
// key rotation. This is now the single home. HONEST SECURITY NOTE: this is a
// client-side app, so the fallback key still ships in the served bundle; the env
// override (VITE_WEB3FORMS_KEY, set in Amplify env vars) plus this single
// rotation point is the achievable win here. Keeping the key out of the bundle
// entirely requires a small server-side relay — tracked in KNOWN_LIMITATIONS.md
// (OBS-5) as an owner decision.
// OBS-5 RESOLVED (Phase 2.2c, Jul 2026): WEB3FORMS_ACCESS_KEY no longer exists
// in the client. The key lives ONLY server-side (taxstat360-api env
// WEB3FORMS_ACCESS_KEY); all form/alert submissions go through
// POST {API_BASE_URL}/alerts/form-relay, which attaches the key, whitelists
// fields, and rate-limits (5/min/IP). The old key in git history should be
// rotated in the web3forms dashboard; delete VITE_WEB3FORMS_KEY from the
// Amplify console (owner action).
export const MAILCHIMP_SUBSCRIBE_URL =
  'https://taxstat360.us4.list-manage.com/subscribe/post?u=c09d008a62d6587f7f0b7e6888c354e8&id=f546bd92ac&f_id=00e0e0e1f0'

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
// OBS-2 RESOLVED (Batch 6, Jul 2026): both disconnect paths now clear BOTH
// stores — a disconnected integration retains no live token anywhere.

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

// ─── OAuth tokens are NOT stored in the browser (audit P0-#1) ────────────────
//
// readIntegrationToken / writeIntegrationToken / removeIntegrationSessionToken are
// GONE. A QuickBooks/Xero access token — and especially a Xero refresh token — is a
// live credential to the customer's accounting system. Keeping one in localStorage
// put it one XSS away from exfiltration, and the token then had to be passed to our
// own API in a query string, where it landed in access logs and browser history.
//
// The API now holds these tokens server-side against the user's account and reads
// them from there (GET /integrations/{p}/data authenticates by session). The browser
// never sees, stores, or transmits a provider token. Connection state comes from
// GET /integrations/status — a boolean, not a credential.
//
// `connected` / `failed` / `extra` / `syncedAt` remain in localStorage: they are UI
// hints, not secrets.

export const INTEGRATION_PROVIDERS = ['quickbooks', 'xero', 'wave', 'freshbooks']

/**
 * One-time scrub of credentials this app used to persist.
 *
 * Anyone who connected an integration before this fix still has a live provider
 * token — and, for Xero, a long-lived refresh token — sitting in their browser.
 * Shipping the fix without clearing them would leave the exposure in place for
 * exactly the existing customers who trusted us first. Called on app load.
 */
export function purgeLegacyIntegrationTokens() {
  for (const providerId of INTEGRATION_PROVIDERS) {
    localStorage.removeItem(integrationKey(providerId, 'token'))
    sessionStorage.removeItem(integrationKey(providerId, 'token'))
  }
  localStorage.removeItem('ts360_xero_refresh')
  sessionStorage.removeItem('ts360_xero_refresh')
}
