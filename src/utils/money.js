// src/utils/money.js
//
// Single money utility for TaxStat360.
// Replaces: utils/parseMoney.js + utils/formatMoney.js (merged June 2026).
//
// ── PARSING ────────────────────────────────────────────────────────────────
//   parseMoney(v)          — string/number → integer dollars (strips $, commas)
//   nf(v, fallback?)       — string/number → raw float (used by tax engine)
//   formatMoneyForInput(n) — number → controlled-input string (no $ symbol)
//
// ── DISPLAY FORMATTING ─────────────────────────────────────────────────────
//   fmt(n)                 — number → "$1,234" (accounting negatives: "($1,234)")
//   formatMoney(n)         — alias of fmt(); retained for callers that used
//                            the old parseMoney.js export by this name
//   pct(n)                 — 0.22 → "22.0%"
//   effectiveRate(tax, inc)— ratio → "12.3" (no % sign — callers append it)
//   fmtCompact(v)          — "$1.2M" / "$34K" / "$123" compact labels
//   formatTimestamp(date?) — Date → "Mar 5, 2026, 4:30 PM"
//   formatRelativeTime(iso)— ISO string → "5m ago" / "3h ago" / absolute
//
// Do not write ad-hoc Number() / parseFloat() / toLocaleString() calls in the
// codebase. Every monetary parse and every display format goes through here.

// ── Internal regex constants ────────────────────────────────────────────────
const NUMERIC_CLEAN_RE  = /[$,\s]/g;
const PAREN_NEGATIVE_RE = /^\((.+)\)$/;

// ── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse a user-entered money string to an integer dollar amount.
 * Handles "$1,234", "1234.56", "(1,234)" (accounting negatives), and
 * raw numbers. Returns 0 for any unparseable input.
 *
 * @param {string|number} v
 * @returns {number} Integer dollars (fractional cents discarded via Math.round)
 */
export function parseMoney(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0
  let s = String(v).trim().replace(NUMERIC_CLEAN_RE, '')
  let negative = false
  if (PAREN_NEGATIVE_RE.test(s)) {
    negative = true
    s = s.replace(PAREN_NEGATIVE_RE, '$1')
  }
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  }
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return 0
  const out = negative ? -Math.round(n) : Math.round(n)
  return out === 0 ? 0 : out
}

/**
 * Normalize any value to a plain float for use by the tax engine.
 * Strips currency symbols and commas; returns `fallback` (default 0) for
 * any input that cannot be parsed to a finite number.
 *
 * @param {string|number|null|undefined} v
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function nf(v, fallback = 0) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : fallback
}

/**
 * Format a number as a controlled-input string (no $ symbol, no commas).
 * Used by MoneyInput so the raw numeric string round-trips cleanly through
 * parseMoney() without triggering comma-stripping on every keystroke.
 *
 * @param {number} n
 * @returns {string}
 */
export function formatMoneyForInput(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return ''
  return String(Math.round(Number(n)))
}

// ── Display formatting ───────────────────────────────────────────────────────

/**
 * Format a number as a US currency string.
 * Negative values use parenthetical accounting notation: ($1,234).
 * Null / undefined / NaN → '$0'.
 *
 * @param {number|null|undefined} n
 * @returns {string}  e.g. "$1,234" or "($567)"
 */
export function fmt(n) {
  if (n === null || n === undefined) return '$0'
  const rounded = Math.round(parseFloat(n))
  if (!Number.isFinite(rounded)) return '$0'
  const abs = Math.abs(rounded)
  const str = '$' + abs.toLocaleString('en-US')
  return rounded < 0 ? '(' + str + ')' : str
}

/**
 * Alias of fmt() — retained for any call site that previously imported
 * `formatMoney` from the old parseMoney.js module. Prefer fmt() in new code.
 *
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function formatMoney(n) {
  return fmt(n)
}

/**
 * Percentage formatter.
 * @param {number} n  e.g. 0.22
 * @returns {string}  e.g. "22.0%"
 */
export function pct(n) {
  return (parseFloat(n) || 0).toFixed(1) + '%'
}

/**
 * Effective tax rate as a one-decimal string WITHOUT a percent sign.
 * Callers append "%" via their own label or pct().
 * Returns "0.0" when income is zero or not finite to avoid division by zero.
 *
 * @param {number} tax
 * @param {number} income
 * @returns {string}  e.g. "12.3"
 */
export function effectiveRate(tax, income) {
  if (!income || !Number.isFinite(income) || !Number.isFinite(tax)) return '0.0'
  return ((tax / income) * 100).toFixed(1)
}

/**
 * Compact currency label for chart axes and summary badges.
 *   ≥ $1 000 000  → "$1.2M"
 *   ≥ $1 000      → "$34K"
 *   otherwise     → full fmt()
 *
 * @param {number} v
 * @returns {string}
 */
export function fmtCompact(v) {
  const n = parseFloat(v) || 0
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (Math.abs(n) >= 1_000)     return '$' + Math.round(n / 1_000) + 'K'
  return fmt(n)
}

/**
 * Timestamp label for saved returns ("Mar 5, 2026, 4:30 PM").
 * Centralized so all save sites produce identical label strings.
 *
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function formatTimestamp(date = new Date()) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Format an ISO timestamp as a relative-time string for sync labels and
 * activity feeds. Returns null when isoStr is falsy.
 *
 *   < 1 minute  → "Just now"
 *   < 60 min    → "5m ago"
 *   < 24 hours  → "3h ago"
 *   otherwise   → absolute via formatTimestamp()
 *
 * @param {string|null|undefined} isoStr
 * @returns {string|null}
 */
export function formatRelativeTime(isoStr) {
  if (!isoStr) return null
  try {
    const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
    if (diff < 60)         return 'Just now'
    if (diff < 3600)       return Math.floor(diff / 60) + 'm ago'
    if (diff < 86400)      return Math.floor(diff / 3600) + 'h ago'
    return formatTimestamp(new Date(isoStr))
  } catch {
    // M5 (audit F-10): invalid timestamp → caller renders nothing rather than "NaN ago".
    return null
  }
}

/** PHASE 3.3 (UX F15): the effective-rate DISPLAY label, single-sourced so
 *  every surface words a loss year identically. A rate divided by non-positive
 *  AGI is not "0%" and not "—" — it is not meaningful, and the honest label
 *  says why. Returns a STRING ready to render. */
export function effRateLabel(totalTax, agi) {
  const a = nf(agi)
  if (a <= 0) return 'n/a (loss year)'
  return pct(effectiveRate(nf(totalTax), a))
}
