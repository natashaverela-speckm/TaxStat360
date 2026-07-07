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
  calcTaxReturn,
  getStdDed,
  getNIITThreshold,
  getAddlMedicareThreshold,
  QBI_THRESHOLDS,
} from './taxCalc.js'
import { isPassthroughEntity } from './utils/entityPredicates'
// M2 (audit F-05): ARCHITECTURE §5 calculation guard, enforced INSIDE the two engine
// entry points this module exposes (resolveQbiDeduction / computeSimulatorScenario) so
// every call site — current and future — is covered without per-site boilerplate.
import { validateCalcInputs } from './utils/calcGuard'

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
 *
 * §199A QBI deduction; Treas. Reg. §1.199A-3(b)(1)(ii)(A). For non-SE pass-throughs
 * (S-Corp) the QBI basis is net of the separately-stated §179 deduction per
 * Treas. Reg. §1.199A-3(b)(1)(ii)(A) — handled upstream by the caller passing
 * the net k1 value. Single production call site enforced by F-04 invariant. */
export function resolveQbiDeduction({ k1, taxableBeforeQBI, entityType, filing, taxYear, entities, capitalGains = 0 }) {
  if (!isPassthroughEntity(entityType) || k1 <= 0 || taxableBeforeQBI <= 0) {
    return { ...EMPTY_QBI }
  }
  // M2 (audit F-05): validate after the early-return gate (a non-passthrough or
  // zero-QBI call never touches the engine, so it needs no year/status) and before
  // calcQBI. This function's argument name is `filing`; the guard's contract accepts
  // only filingStatus/status, so translate explicitly rather than widening the guard.
  validateCalcInputs({ taxYear, filingStatus: filing }, 'resolveQbiDeduction')
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

/**
 * §1411 NIIT applicability gate. Returns true when filer is subject to the 3.8%
 * Net Investment Income Tax. Threshold: $250K MFJ / $125K MFS / $200K other —
 * statutory, not inflation-adjusted (IRC §1411(b)). No withholding; Form 8960. */
export function niitApplies({ taxYear, filing, magi, netInvestmentIncome }) {
  const threshold = getNIITThreshold(taxYear, filing)
  return magi > threshold && netInvestmentIncome > 0
}

/**
 * §3101(b)(2) Additional Medicare Tax applicability gate. Returns true when W-2
 * wages exceed the filing-status threshold ($200K single / $250K MFJ — statutory,
 * not inflation-adjusted). Employee-only; no employer match on this 0.9% surtax. */
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
  const merged = { ...baseInput, ...delta }
  // M2 (audit F-05): ARCHITECTURE §5 guard. KNOWN DEFECT SURFACED (audit Batch-1 note
  // SIM-1): the SimulatorModal in AIAnalysis.jsx currently calls this function with a
  // packed object ({ base, filing, taxYear, delta }) that carries NO engine-vocabulary
  // fields — no `status`, no income fields, and the delta nested where the engine
  // never reads it. The engine therefore returned totalTax = 0 for BOTH baseline and
  // scenario ("YOU SAVE $0" for every preset) and the modal's per-line fields
  // (rev/k1/qbi/fedTax) rendered NaN. This guard now rejects that call shape with a
  // CalcInputError, which the modal catches into an honest "unavailable" notice.
  // The functional repair (rebuilding the scenario math on engine vocabulary) is
  // deliberately a separate, test-anchored batch — it changes customer-visible
  // dollar figures and must not ride along inside a structural cleanup.
  validateCalcInputs(merged, 'WhatIfSimulator')
  return calcTaxReturn(merged)
}
