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
import { FICA_SS_RATE, FICA_MEDICARE_RATE } from './constants.js'
import { isPassthroughEntity } from './utils/entityPredicates'

/**
 * Rough SE-tax savings of operating as an S-Corp vs. a sole proprietorship.
 *
 * `k1Income` is the S-Corp shareholder's K-1 ordinary income. Across every entry
 * path in this app pnl.netProfit is stored AFTER officer salary (manual P&L folds
 * officer salary into totalExpenses; synced P&L is persisted after salary — see
 * EntityCompareModal / TaxReturn / Dashboard), so this figure is already the income
 * that escapes SE/FICA. It must NOT have officer salary subtracted again: a sole
 * proprietor would owe SE tax on this whole amount, an S-Corp shareholder owes none
 * (they pay FICA only on their W-2 wages). The savings is therefore rate × k1Income.
 *
 * This is a rough 15.3% estimate for the strategy finder; the engine's `ficaSavings`
 * is the precise figure (it applies the 92.35% §1402(a)(12) net-earnings factor and
 * the Social Security wage-base cap).
 */
export function scorpSeTaxSavingsEstimate(k1Income) {
  const base = Math.max(0, Number(k1Income) || 0)
  return Math.round(base * (FICA_SS_RATE + FICA_MEDICARE_RATE) * 2)
}

const EMPTY_QBI = { deduction: 0, limitApplied: 'none', caps: { qbi: 0, wage: null, income: 0 } }

/** Taxable income before §199A — same formula used across AI Analysis tabs. */
export function taxableIncomeBeforeQBI(totalIncome, taxYear, filing) {
  return Math.max(0, totalIncome - getStdDed(taxYear, filing))
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
