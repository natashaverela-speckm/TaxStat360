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
  calcCCorpCorporateLayer,
  getStdDed,
  getNIITThreshold,
  getAddlMedicareThreshold,
  QBI_THRESHOLDS,
} from './taxCalc.js'
import { isPassthroughEntity, isCCorpEntity } from './utils/entityPredicates'
import { nf } from './utils/money.js'
import { CURRENT_TAX_YEAR } from './constants.js'
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
// SIM-1 REPAIR (Batch 7, Jul 2026). History: the simulator passed the engine a
// packed object it could not read, so every preset showed "$0 savings" with NaN
// rows; Batch 1's guard turned that into an honest "unavailable" notice. This is
// the functional repair, built on the SAME scenario→engine translation the
// Dashboard Tracker uses (single-business entity + officer W-2 + k1 share), so
// the simulator and the Tracker cannot disagree about the same scenario.
//
// ctx:   { base, entityType, ownerPctVal (0–1), filing, taxYear }
// delta: INCREMENTS on base's simulator-vocabulary P&L fields.
//
// Modeling notes (documented, deliberate):
// • All P&L deltas (incl. the SEP preset's otherDeductions) net into business
//   income before the owner share — a planning approximation, consistent with
//   the modal's on-screen P&L waterfall.
// • C-Corp scenarios mirror Dashboard's corporate layer: 21% on profit after
//   officer comp, after-tax profit distributed as qualified dividends.
// F-SIM FIX (audit re-review, Jul 2026): map a saved/live record to the What-If
// Simulator base. `w2Income` here is PERSONAL W-2 ONLY — computeSimulatorScenario
// adds the officer salary itself (w2 = w2Own + sal). The component previously built
// this base with getTotalW2(rec), which sums personal W-2 PLUS every entity's officer
// salary, so the salary was counted twice — the simulator's projected tax came out
// ~one bracket high and disagreed with Step 2. Extracted here (pure) so the contract
// is unit-tested in whatif-simulator.test.js.
export function buildSimulatorBase(rec) {
  const b = (rec && rec.biz) || {}
  const f = (rec && rec.f1040) || {}
  const pnl = b.pnl || {}
  return {
    grossRevenue:      nf(b.grossRevenue) || 0,
    cogs:              nf(b.cogs) || 0,
    operatingExpenses: Math.max(0, nf(b.operatingExpenses) - nf(b.officerSalary) - nf(b.depreciation) - (nf(pnl.advertising) || 0) - (nf(pnl.otherDeductions) || 0)),
    officerSalary:     nf(b.officerSalary) || 0,
    depreciation:      nf(b.depreciation) || 0,
    advertising:       nf(pnl.advertising) || 0,
    otherDeductions:   nf(pnl.otherDeductions) || 0,
    w2Income:          nf(f.w2Income) || 0,   // personal W-2 only — see note above
    estPaid:           nf(f.estPaid) || 0,
  }
}

export function computeSimulatorScenario(ctx = {}, delta = {}) {
  const base = ctx.base || {}
  const v = (k) => nf(base[k]) + nf(delta[k])
  const rev   = v('grossRevenue')
  const cogs  = nf(base.cogs)
  const opex  = v('operatingExpenses')
  const sal   = v('officerSalary')
  const dep   = v('depreciation')
  const adv   = v('advertising')
  const other = v('otherDeductions')
  const w2Own = v('w2Income')
  const netBizIncome = rev - cogs - opex - sal - dep - adv - other
  const ownerPctVal  = Number.isFinite(ctx.ownerPctVal) ? ctx.ownerPctVal : 1
  const taxYear      = parseInt(ctx.taxYear) || CURRENT_TAX_YEAR
  const status       = ctx.filing || 'single'
  const isCC         = isCCorpEntity(ctx.entityType)
  const k1           = isCC ? 0 : Math.round(netBizIncome * ownerPctVal)

  // Mirrors Dashboard.calcDashboard's baseInput shape (zeros for fields the
  // simulator does not model) — one translation, two surfaces.
  const engineInput = {
    taxYear, status, dependents: 0,
    k1Total: k1, rentalNet: 0, stGain: 0, ltGain: 0,
    intInc: 0, qualDiv: 0, f4797Inc: 0, taxableSS: 0,
    selfEmpHealthIns: 0, hsaDeduction: 0, studentLoanInt: 0,
    selfEmpRetirement: 0, nolCarryforward: 0, priorYearQBILoss: 0,
    saltAmount: 0, hasISO: false, isoBargainElement: 0,
    isREP: false, unrecap1250: 0, collectiblesGain: 0,
    w2Withheld: 0, estPaid: nf(base.estPaid), ytdFactor: 1,
    useItemized: false, itemizedAmt: 0, priorPassiveLossCarryforward: 0,
    w2: w2Own + sal,
    // Finding 1 follow-up (Jul 2026 audit): carry the limited-partner attestation
    // into the reconstructed entity. Without it, normalizeEntityType defaults a
    // Partnership/LLC to the ACTIVE (SE-subject) variant, so the simulator charged
    // SE tax on a limited partner's K-1 (§1402(a)(13)) — diverging from the Tax
    // Tracker, SE-savings panel, and SEP-IRA card, which all treat it as SE-exempt.
    entities: isCC ? [] : [{ type: ctx.entityType, k1, own: 100, officerW2: sal, limitedPartner: !!ctx.limitedPartner }],
  }
  validateCalcInputs(engineInput, 'WhatIfSimulator')

  if (isCC) {
    const layer = calcCCorpCorporateLayer({ netProfit: netBizIncome + sal, officerSalary: sal, taxYear })
    const r = calcTaxReturn({ ...engineInput, divInc: layer.dividends, qualDiv: layer.dividends })
    const totalTax = r.totalTax + layer.corpTax
    return {
      rev, opex, sal, dep, adv, other, netBizIncome, k1: 0,
      w2: engineInput.w2, qbi: 0, agi: r.agi, seTax: 0,
      taxableInc: r.taxableAfterQBI, fedTax: r.fedTax + layer.corpTax,
      totalTax, quarterly: r.quarterlyRecommended,
    }
  }

  const r = calcTaxReturn(engineInput)
  return {
    rev, opex, sal, dep, adv, other, netBizIncome, k1,
    w2: engineInput.w2, qbi: r.qbi, agi: r.agi, seTax: r.seTax,
    taxableInc: r.taxableAfterQBI, fedTax: r.fedTax,
    totalTax: r.totalTax, quarterly: r.quarterlyRecommended,
  }
}
