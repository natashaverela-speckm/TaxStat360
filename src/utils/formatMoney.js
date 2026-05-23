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

/** Compact dollar: 1234567 → "$1.2M", 12345 → "$12K", 1234 → "$1,234" */
export function fmtCompact(n) {
  const v = Math.round(parseFloat(n) || 0)
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (Math.abs(v) >= 1_000)     return '$' + Math.round(v / 1_000) + 'K'
  return fmt(v)
}

export default fmt
