// src/utils/calcGuard.js
//
// Input validation before tax calculation calls.
//
// PURPOSE: prevents silent NaN / null results from reaching the user.
// A missing or non-finite input to calcTaxReturn() or resolveQbiDeduction()
// produces a NaN tax liability with no visible error. For a tax application
// this is worse than a crash — the user may rely on the blank result.
//
// USAGE:
//   import { validateCalcInputs, CalcInputError } from './utils/calcGuard'
//
//   try {
//     validateCalcInputs(inputs, 'AIAnalysis')
//     const result = calcTaxReturn(inputs)
//   } catch (e) {
//     if (e instanceof CalcInputError) {
//       setCalcError(e.message)   // surface to UI state
//       return
//     }
//     throw e   // re-throw unexpected errors
//   }
//
// Wire ErrorBoundary to catch CalcInputError for a user-visible fallback.
// See src/components/ErrorBoundary.jsx.

// ── Error class ───────────────────────────────────────────────────────────────

export class CalcInputError extends Error {
  constructor(field, value, context) {
    super(
      `Calculation input invalid in ${context}: ` +
      `"${field}" = ${JSON.stringify(value)} ` +
      `(expected a finite number)`
    )
    this.name = 'CalcInputError'
    this.field = field
    this.context = context
  }
}

// ── Required fields ───────────────────────────────────────────────────────────
//
// These are the minimum fields that must be finite numbers before any call to
// calcTaxReturn(). Extend this list if calcTaxReturn()'s required surface grows.
//
// Fields marked NUMERIC must be typeof 'number' and Number.isFinite().
// Fields marked PRESENT must be non-null / non-undefined (any truthy type).

const REQUIRED_FINITE = [
  'taxYear',       // number — e.g. 2025
]

const REQUIRED_PRESENT = [
  'filingStatus',  // string — 'single' | 'mfj' | 'mfs' | 'hoh' | 'qss'
]

// ── Validator ─────────────────────────────────────────────────────────────────

/**
 * Validates that `inputs` contains the minimum fields needed for a safe
 * call to calcTaxReturn() or resolveQbiDeduction().
 *
 * Throws CalcInputError on the first invalid field found.
 *
 * @param {object} inputs   — the inputs object to validate
 * @param {string} context  — caller label for the error message (e.g. 'AIAnalysis')
 */
export function validateCalcInputs(inputs, context = 'calcTaxReturn') {
  if (inputs === null || inputs === undefined || typeof inputs !== 'object') {
    throw new CalcInputError('inputs', inputs, context)
  }

  for (const field of REQUIRED_FINITE) {
    const val = inputs[field]
    if (val === undefined || val === null || typeof val !== 'number' || !Number.isFinite(val)) {
      throw new CalcInputError(field, val, context)
    }
  }

  for (const field of REQUIRED_PRESENT) {
    const val = inputs[field]
    if (val === undefined || val === null || val === '') {
      throw new CalcInputError(field, val, context)
    }
  }
}

// ── Convenience: safe wrapper ─────────────────────────────────────────────────
//
// Use this instead of try/catch boilerplate when you want to handle errors
// inline without an error state variable.
//
// Returns { result, error } where exactly one is non-null.
//
// Example:
//   const { result, error } = safeCalc(inputs, calcTaxReturn, 'TaxReturn')
//   if (error) { setCalcError(error.message); return }

export function safeCalc(inputs, calcFn, context = 'calcTaxReturn') {
  try {
    validateCalcInputs(inputs, context)
    const result = calcFn(inputs)
    return { result, error: null }
  } catch (e) {
    if (e instanceof CalcInputError) {
      return { result: null, error: e }
    }
    throw e   // unexpected errors still surface
  }
}
