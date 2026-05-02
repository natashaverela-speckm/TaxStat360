// src/utils/sessionState.js
// Typed reader/writer functions for all sessionStorage keys used across the
// Step 1 → Step 2 navigation boundary in TaxStat360.
//
// Rules:
//   - Every sessionStorage.setItem call in the app goes through a writer here.
//   - Every sessionStorage.getItem call in the app goes through a reader here.
//   - Readers always return a valid default if the key is missing or malformed.
//   - Never write different shapes for the same key from different call sites.
//
// Writers:
//   writeStep1State    — called by CalculateTaxInner after entity entry
//   writePersonalContext — called by Dashboard (loadRecord) and TaxReturn (auto-save)
//   writeTaxYear       — called by Dashboard
//
// Readers:
//   readStep1State     — called by TaxReturn, AIAnalysis
//   readPersonalContext — called by TaxReturn on mount
//   readTaxYear        — called by TaxReturn, EntityCompareModal

// ─── Step 1 state (entity list + totals) ──────────────────────────────────────
// Written by: CalculateTaxInner (proceed() and AI Analysis nav)
// Read by:    TaxReturn, AIAnalysis

export function writeStep1State({ entities = [], k1Total = 0, isCoopPatron = false } = {}) {
  sessionStorage.setItem('ts360_entities', JSON.stringify(entities))
  sessionStorage.setItem('ts360_k1', String(k1Total))
  sessionStorage.setItem('ts360_isCoopPatron', String(isCoopPatron))
}

export function readStep1State() {
  let entities = []
  try { entities = JSON.parse(sessionStorage.getItem('ts360_entities') || '[]') } catch {}
  const k1Total     = parseFloat(sessionStorage.getItem('ts360_k1') || '0') || 0
  const isCoopPatron = sessionStorage.getItem('ts360_isCoopPatron') === 'true'
  return { entities, k1Total, isCoopPatron }
}

// ─── Personal 1040 context (filing status, year, deductions, payments) ────────
// Written by: Dashboard (loadRecord), TaxReturn (self-save on navigate)
// Read by:    TaxReturn on mount, EntityCompareModal for personalContext

/**
 * @param {{
 *   filingStatus?: string,
 *   taxYear?: number,
 *   dependents?: number,
 *   w2Income?: number,
 *   useItemized?: boolean,
 *   itemizedAmt?: number,
 *   estPaid?: number,
 * }} ctx
 */
export function writePersonalContext({
  filingStatus = 'single',
  taxYear      = 2025,
  dependents   = 0,
  w2Income     = 0,
  useItemized  = false,
  itemizedAmt  = 0,
  estPaid      = 0,
} = {}) {
  sessionStorage.setItem('ts360_f1040', JSON.stringify({
    filingStatus, taxYear, dependents, w2Income, useItemized, itemizedAmt, estPaid,
  }))
}

/** @returns {{ filingStatus: string, taxYear: number, dependents: number, w2Income: number, useItemized: boolean, itemizedAmt: number, estPaid: number }} */
export function readPersonalContext() {
  const defaults = {
    filingStatus: 'single',
    taxYear:      2025,
    dependents:   0,
    w2Income:     0,
    useItemized:  false,
    itemizedAmt:  0,
    estPaid:      0,
  }
  try {
    const raw = sessionStorage.getItem('ts360_f1040')
    if (!raw) return defaults
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

// ─── Tax year (standalone, because Dashboard writes it separately) ─────────────
export function writeTaxYear(year) {
  sessionStorage.setItem('ts360_taxyear', String(parseInt(year) || 2025))
}

export function readTaxYear() {
  return parseInt(sessionStorage.getItem('ts360_taxyear') || '2025') || 2025
}
