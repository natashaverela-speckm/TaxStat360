// Pure tax math extracted from AIAnalysis.jsx for characterization tests and
// shared engine routing. No React, no DOM.

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

/** Taxable income before §199A — same formula used across AI Analysis tabs. */
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
 * @param {string} filing  - filing status key
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
 * Legacy guarded QBI path (Risk Scan rough tax, Optimization, CPA briefing).
 * Preserved for characterization — requires passthrough entity and k1 > 0.
 */
export function legacyQbiGuarded({ k1, taxableBeforeQBI, entityType, filing, taxYear, entities }) {
  if (isPassthroughEntity(entityType) && k1 > 0) {
    return calcQBI(k1, taxableBeforeQBI, 0, {
      status: filing,
      taxYear,
      entityQbiData: entities || [],
    })
  }
  return { ...EMPTY_QBI }
}

/**
 * Legacy simulator QBI path — passthrough guard only (no k1 > 0 check).
 * Preserved for characterization baseline.
 */
export function legacyQbiSimulator({ k1, taxableBeforeQBI, entityType, filing, taxYear, entities }) {
  if (isPassthroughEntity(entityType)) {
    return calcQBI(k1, taxableBeforeQBI, 0, {
      status: filing,
      taxYear,
      entityQbiData: entities || [],
    })
  }
  return { deduction: 0 }
}

/**
 * Unified QBI resolution — single engine entry for AI Analysis after refactor.
 * Engine (calcQBI) is source of truth; passthrough + positive K-1 required.
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
 * Under the old calcFederalTax-only path, changing salary by $10K showed only
 * the income-tax bracket effect (~$2,200) while omitting the SE/FICA effect
 * (~$1,530), materially understating the benefit. Now both components show.
 *
 * Return contract extended:
 *   fedTax    — income tax only (backward-compat: SimulatorModal uses this)
 *   totalTax  — full tax including SE, NIIT, AMT, Additional Medicare (NEW)
 *   seTax     — self-employment tax component (NEW)
 *   niitAmount — NIIT component (NEW)
 *   amt        — AMT component (NEW)
 *
 * CALC-2 NOTE: when the caller passes useItemized + itemizedAmt in personalContext,
 * the engine applies the itemized deduction correctly. The legacy callers that omit
 * these fields continue to get the standard deduction (no breaking change).
 */
export function computeSimulatorScenario({
  base,
  delta = {},
  entityType,
  ownerPctVal,
  filing,
  taxYear,
  entities,
  personalContext = {},
}) {
  const rev = base.grossRevenue + (delta.grossRevenue || 0)
  const cogs = base.cogs
  const opex = base.operatingExpenses + (delta.operatingExpenses || 0)
  const sal = base.officerSalary + (delta.officerSalary || 0)
  const dep = base.depreciation + (delta.depreciation || 0)
  const adv = base.advertising + (delta.advertising || 0)
  const other = base.otherDeductions + (delta.otherDeductions || 0)
  const w2 = base.w2Income + (delta.w2Income || 0) + (delta.officerSalary || 0)
  const grossProfit = rev - cogs
  const totalBizExp = opex + sal + dep + adv + other
  const netBizIncome = grossProfit - totalBizExp
  const k1 = isPassthroughEntity(entityType) ? Math.max(0, netBizIncome) * ownerPctVal : 0

  // Build a synthetic entity for the scenario so calcTaxReturn can apply basis
  // limits, §469 gating, QBI, and FICA correctly.
  const scenarioEntity = k1 !== 0 ? [{
    type: entityType,
    k1,
    own: Math.round(ownerPctVal * 100),
    ...(entities && entities[0] ? {
      stockBasis: entities[0].stockBasis,
      debtBasis:  entities[0].debtBasis,
      isREP:      entities[0].isREP,
      rentalAggregationElection: entities[0].rentalAggregationElection,
    } : {}),
  }] : []

  const result = calcTaxReturn({
    taxYear,
    status: filing,
    w2,
    k1Total: k1,
    entities: scenarioEntity,
    ...(personalContext.useItemized ? {
      useItemized: true,
      itemizedAmt: personalContext.itemizedAmt || 0,
      saltAmount:  personalContext.saltAmount  || 0,
    } : {}),
    dependents:  personalContext.dependents  || 0,
    intInc:      personalContext.intInc      || 0,
    divInc:      personalContext.divInc      || 0,
    qualDiv:     personalContext.qualDiv     || 0,
    ltGain:      personalContext.ltGain      || 0,
    unrecap1250: personalContext.unrecap1250 || 0,
  })

  return {
    // Inputs (for display)
    rev, opex, sal, dep, adv, other, netBizIncome, k1, w2,
    // Results — extended set
    agi:       result.agi,
    taxableInc: result.taxableAfterQBI,
    qbi:       result.qbi,
    // Backward-compat: SimulatorModal uses fedTax for its diff
    fedTax:    result.fedTax,
    // New full-picture totals
    totalTax:   result.totalTax,
    seTax:      result.seTax      ?? 0,
    niitAmount: result.niitAmount ?? 0,
    amt:        result.amt        ?? 0,
    additionalMedicare: result.additionalMedicare ?? 0,
  }
}
