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
