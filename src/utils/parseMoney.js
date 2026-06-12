// src/utils/parseMoney.js
//
// Canonical money parser & formatter for TaxStat360.
// Every monetary input/output flows through these two functions.
// Do not write ad-hoc Number() or parseFloat() calls in the codebase.

const NUMERIC_CLEAN_RE = /[$,\s]/g;
const PAREN_NEGATIVE_RE = /^\(.*\)$/;

/**
 * Parse a user-entered money string into a finite Number.
 *
 * Accepts:
 *   "100,000"       -> 100000
 *   "$1,234.56"     -> 1234.56
 *   "(500)"         -> -500          (accounting-style negative)
 *   "  -42 "        -> -42
 *   "1234"          -> 1234
 *   1234            -> 1234          (passthrough for already-numeric)
 *   ""              -> 0
 *   null/undefined  -> 0
 *   "abc"           -> 0             (non-parseable -> 0, never NaN)
 *
 * Why 0 for invalid input instead of throwing or returning NaN:
 *   - The downstream tax engine must never see NaN (poisons every calc).
 *   - Empty/invalid inputs are extremely common while users are still typing.
 *   - The MoneyInput component shows a validation hint for non-empty invalid input.
 *
 * @param {string|number|null|undefined} input
 * @returns {number} A finite Number; never NaN, Infinity, or -Infinity.
 */
export function parseMoney(input) {
  if (input == null) return 0;
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : 0;
  }

  let s = String(input).trim();
  if (s === '') return 0;

  // Detect parens-as-negative BEFORE stripping characters
  const isParenNegative = PAREN_NEGATIVE_RE.test(s);
  if (isParenNegative) s = s.slice(1, -1);

  // Strip currency symbols, thousand separators, whitespace
  s = s.replace(NUMERIC_CLEAN_RE, '');

  if (s === '' || s === '-' || s === '.') return 0;

  const num = Number(s);
  if (!Number.isFinite(num)) return 0;

  const signed = isParenNegative ? -num : num;
  return signed || 0;  // normalize -0 to 0
}

/**
 * Lightweight numeric coercion for ALREADY-STORED model values (numbers or
 * comma-formatted strings) used throughout the tax computations. Strips commas,
 * parses, and returns a finite number (invalid/empty → fallback, default 0).
 *
 * Distinct from parseMoney(): parseMoney() parses raw USER INPUT (handling $,
 * parentheses-negatives, and whitespace) and is preferred for input fields;
 * nf() is the lighter coercion used when reading stored values inside calcs.
 * Consolidates the two previously-duplicated nf() definitions (audit C-2).
 *
 * @param {string|number|null|undefined} v
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function nf(v, fallback = 0) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Format a Number for DISPLAY in summaries and read-only views.
 * Returns a USD-formatted string with negatives shown as -$X (not parens).
 *
 *   1234.56  -> "$1,234.56"
 *   -1234    -> "-$1,234.00"
 *   0        -> "$0.00"
 *
 * For input field display, prefer formatMoneyForInput (no $ sign).
 *
 * @param {number} num
 * @param {{ cents?: boolean }} [opts]  cents: include .XX (default true)
 * @returns {string}
 */
export function formatMoney(num, opts = {}) {
  const cents = opts.cents !== false;
  if (!Number.isFinite(num)) num = 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(num);
}

/**
 * Format a Number for display INSIDE a money input field on blur.
 * No currency symbol, thousand separators, no decimals if whole number.
 *
 *   1234     -> "1,234"
 *   1234.5   -> "1,234.50"
 *   -1234    -> "-1,234"
 *   0        -> ""           (empty so the placeholder shows through)
 *
 * @param {number} num
 * @returns {string}
 */
export function formatMoneyForInput(num) {
  if (!Number.isFinite(num) || num === 0) return '';
  const hasCents = Math.abs(num % 1) > 0.005;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num);
}
