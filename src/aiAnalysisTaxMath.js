// Pure tax math extracted from AIAnalysis.jsx for characterization tests and
// shared engine routing. No React, no DOM.

import {
  calcQBI,
  calcFederalTax,
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
 * Computes through shared taxCalc.js primitives only.
 */
export function computeSimulatorScenario({
  base,
  delta = {},
  entityType,
  ownerPctVal,
  filing,
  taxYear,
  entities,
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
  let k1 = 0
  if (isPassthroughEntity(entityType)) {
    k1 = Math.max(0, netBizIncome) * ownerPctVal
  }
  const totalPersonalIncome = k1 + w2
  const stdDed = getStdDed(taxYear, filing)
  const taxableBeforeQBI = taxableIncomeBeforeQBI(totalPersonalIncome, taxYear, filing)
  const { deduction: qbi } = resolveQbiDeduction({
    k1,
    taxableBeforeQBI,
    entityType,
    filing,
    taxYear,
    entities,
  })
  const agi = Math.max(0, totalPersonalIncome - qbi)
  const taxableInc = Math.max(0, agi - stdDed)
  const fedTax = calcFederalTax(taxableInc, taxYear, filing)
  return {
    rev,
    opex,
    sal,
    dep,
    adv,
    other,
    netBizIncome,
    k1,
    qbi,
    w2,
    agi,
    taxableInc,
    fedTax,
  }
}
