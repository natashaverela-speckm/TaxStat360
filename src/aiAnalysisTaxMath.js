// Pure tax math extracted from AIAnalysis.jsx for characterization tests and
// shared engine routing. No React, no DOM.
//
// Audit fix: legacyQbiGuarded() and legacyQbiSimulator() have been removed from
// this production module. They were "preserved for characterization" but their
// presence on the export surface risked being called by new code. They now live
// in src/utils/aiAnalysisTaxMath.test-helpers.js for use by test files only.
// All production call sites should use resolveQbiDeduction() below.

import {
  calcQBI,
  calcFederalTax,
  calcTaxReturn,
  getStdDed,
  getNIITThreshold,
  getAddlMedicareThreshold,
  QBI_THRESHOLDS,
} from './taxCalc.js'
import { isPassthroughEntity } from './utils/entityPredicates'

// SE/FICA-savings arithmetic lives in ONE place — scorpSeTaxSavings in taxCalc.js, which
// also produces the engine's `ficaSavings`. Re-exported here under the name the strategy
// finder uses so its estimate is, by construction, identical to the filed-return figure.
export { scorpSeTaxSavings as scorpSeTaxSavingsEstimate } from './taxCalc.js'

const EMPTY_QBI = { deduction: 0, limitApplied: 'none', caps: { qbi: 0, wage: null, income: 0 } }

/**
 * Taxable income before the §199A QBI deduction.
 *
 * AI-6 FIX: the CPA Briefing always applied the standard deduction regardless of
 * whether the user had entered itemized deductions. When the user elects to itemize
 * (useItemized === true) and the itemized total exceeds the standard deduction, the
 * larger amount governs (§63(b) / §63(d)). A third parameter, opts, carries
 * these signals; legacy callers that omit it get the prior behaviour (standard
 * deduction always — no breaking change to existing call sites).
 *
 * @param {number} totalIncome
 * @param {number|string} taxYear
 * @param {string} filing - filing status key
 * @param {{ useItemized?: boolean, itemizedAmt?: number }} [opts]
 * @returns {number}
 */
export function taxableIncomeBeforeQBI(totalIncome, taxYear, filing, opts = {}) {
  const stdDed = getStdDed(taxYear, filing)
  const { useItemized = false, itemizedAmt = 0 } = opts
  const deduction = (useItemized && itemizedAmt > stdDed) ? itemizedAmt : stdDed
  return Math.max(0, totalIncome - deduction)
}

/**
 * Unified QBI resolution — single engine entry for AI Analysis.
 * Engine (calcQBI) is source of truth; passthrough + positive K-1 required.
 * Use this function. Do not use legacyQbi* variants in new code.
 */
export function resolveQbiDeduction({ k1, taxableBeforeQBI, entityType, filing, taxYear, entities, capitalGains = 0 }) {
  if (!isPassthroughEntity(entityType) || k1 <= 0 || taxableBeforeQBI <= 0) {
    return { ...EMPTY_QBI }
  }
  return calcQBI(k1, taxableBeforeQBI, capitalGains, {
    status: filing,
    taxYear,
    entityQbiData: entities || [],
  })
}

/** QBI gap for UI copy when wage/income limit binds. */
export function qbiDeductionGap(qbiResult) {
  const { deduction, caps } = qbiResult || {}
  return caps ? Math.max(0, Math.round((caps.qbi ?? 0) - (deduction ?? 0))) : 0
}

/** Form 8995 vs 8995-A selection — UI metadata only, thresholds from engine. */
export function qbiFormSelection({ taxableBeforeQBI, taxYear, filing, isCoopPatron }) {
  const thresholds = QBI_THRESHOLDS[taxYear] || QBI_THRESHOLDS[2025]
  const threshold = thresholds[filing] || thresholds.single
  const useForm8995A = taxableBeforeQBI > threshold || !!isCoopPatron
  return {
    threshold,
    useForm8995A,
    formNum: useForm8995A ? 'Form 8995-A' : 'Form 8995',
    formTitle: useForm8995A
      ? 'QBI Deduction — Detailed Computation (IRC §199A)'
      : 'QBI Deduction (IRC §199A)',
  }
}

/** NIIT schedule-map gate — uses engine threshold getter (Finding 3 pattern). */
export function niitApplies({ taxYear, filing, magi, netInvestmentIncome }) {
  const threshold = getNIITThreshold(taxYear, filing)
  return magi > threshold && netInvestmentIncome > 0
}

/** Additional Medicare schedule-map gate — uses engine threshold getter. */
export function additionalMedicareApplies({ taxYear, filing, wages }) {
  const threshold = getAddlMedicareThreshold(taxYear, filing)
  return wages > threshold
}

/**
 * What-if simulator tax math — expense/income slider scenarios.
 *
 * CALC-1 FIX: now routes through calcTaxReturn (the full engine orchestrator)
 * instead of calcFederalTax only. This adds NIIT, Additional Medicare Tax, AMT,
 * SE tax, §1366(d) basis limits, and §461(l) EBL to the simulator output —
 * so "YOU SAVE $X" reflects the complete tax picture, not income tax alone.
 *
 * The salary-adjustment scenario is the primary use case for S-Corp owners.
 *
 * @param {object} baseInput   Full calcTaxReturn input representing the current state.
 * @param {object} delta       Fields to override: { k1Total?, w2?, additionalExpenses?, etc. }
 * @returns {object}           calcTaxReturn result for the scenario.
 */
export function computeSimulatorScenario(baseInput, delta = {}) {
  return calcTaxReturn({ ...baseInput, ...delta })
}
