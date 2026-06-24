// src/utils/formatMoney.js
// Canonical currency formatter for TaxStat360 — audit finding CC-M02.
// Replaces three divergent fmt() implementations in Dashboard.jsx,
// AIAnalysis.jsx, and TaxReturn.jsx. Import from here only.
//
// Accounting format: negatives display as ($X,XXX) — standard on tax forms.

/**
 * Format a number as a currency string.
 * Negative values use parenthetical accounting notation: ($1,234)
 * Null / undefined / NaN → '$0'
 */
export function fmt(n) {
  if (n === null || n === undefined) return '$0'
  const rounded = Math.round(parseFloat(n)) || 0
  const abs = Math.abs(rounded)
  const str = '$' + abs.toLocaleString('en-US')
  return rounded < 0 ? '(' + str + ')' : str
}

/** Percentage formatter: 0.22 → "22.0%" */
export function pct(n) {
  return (parseFloat(n) || 0).toFixed(1) + '%'
}

/**
 * Effective tax rate as a one-decimal string WITHOUT a percent sign (callers append
 * "%" via pct() or their own label): effectiveRate(1234, 10000) → "12.3".
 * Non-positive AGI → "0.0". Centralizes the formula previously duplicated across
 * Dashboard.jsx and TaxReturn.jsx (audit C-6).
 */
export function effectiveRate(totalTax, agi) {
  return agi > 0 ? (parseFloat(totalTax) / agi * 100).toFixed(1) : '0.0'
}

/** Compact dollar: 1234567 → "$1.2M", 12345 → "$12K", 1234 → "$1,234" */
export function fmtCompact(n) {
  const v = Math.round(parseFloat(n) || 0)
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (Math.abs(v) >= 1_000)     return '$' + Math.round(v / 1_000) + 'K'
  return fmt(v)
}

// Timestamp label for saved returns ("Mar 5, 2026, 4:30 PM"). Centralized so the
// two save sites (Tax Tracker step 1 and TaxReturn) stay byte-identical (audit D-4).
export function formatTimestamp(date = new Date()) {
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * Format an ISO timestamp as a relative-time string for sync labels and
 * activity feeds. Returns null when isoStr is falsy.
 *
 *   < 1 minute ago  → "Just now"
 *   < 60 minutes    → "5m ago"
 *   < 24 hours      → "3h ago"
 *   otherwise       → absolute via formatTimestamp()
 *
 * Moved here from CalculateTaxInner.jsx (local fmtSyncedAt) so any component
 * that needs relative-time display imports a single shared implementation.
 */
export function formatRelativeTime(isoStr) {
  if (!isoStr) return null
  try {
    const d = new Date(isoStr)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1)  return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHrs = Math.floor(diffMins / 60)
    if (diffHrs < 24)  return `${diffHrs}h ago`
    return formatTimestamp(d)
  } catch {
    return null
  }
}

export default fmt
