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
  getTable,
  calc469iAllowance,
} from './taxCalc.js'
import { isPassthroughEntity, isCCorpEntity, isSCorpEntity, isRealEstateEntity, ownPct, getEntityNetProfit } from '../utils/entityPredicates'
import { nf } from '../utils/money.js'
import {
  CURRENT_TAX_YEAR,
  FICA_SS_RATE, FICA_MEDICARE_RATE, SE_NET_EARNINGS_FACTOR,
  SEP_IRA_RATE, SOLO_401K_EMPLOYER_RATE, SEP_IRA_SOLE_PROP_EFFECTIVE_RATE,
} from './constants.js'
// M2 (audit F-05): ARCHITECTURE §5 calculation guard, enforced INSIDE the two engine
// entry points this module exposes (resolveQbiDeduction / computeSimulatorScenario) so
// every call site — current and future — is covered without per-site boilerplate.
import { validateCalcInputs } from '../utils/calcGuard'

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
  const thresholds = qbiThresholdsFor(taxYear)
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


// ─────────────────────────────────────────────────────────────────────────────
// Retirement-plan contribution math (F3/F8 extraction from AIAnalysis.jsx,
// Jul 2026). Pure functions; no React, no DOM. Unit-tested in
// aiAnalysisTaxMath-retirement.test.js.
// ─────────────────────────────────────────────────────────────────────────────

// ── A1 FIX (Jul 2026 independent audit) — sole-proprietor SEP-IRA / Solo 401(k) base ──
// The self-employed retirement-plan base is NET EARNINGS FROM SELF-EMPLOYMENT:
// net profit MINUS the §164(f) one-half-of-SE-tax deduction (IRS Pub. 560, Rate
// Worksheet). The 20% effective rate (SEP_IRA_SOLE_PROP_EFFECTIVE_RATE = 0.25 / 1.25)
// only removes the contribution-reduces-its-own-base circularity; it does NOT
// remove the half-SE-tax reduction. So the rate must be applied to
// (net profit − ½ SE tax), never to raw net profit. The previous code multiplied
// the rate by raw net profit/K-1, overstating the maximum — e.g. $30,000 instead
// of the correct $27,881 on $150,000 of net profit.
//
// When the engine's own self-employment tax is available (engineSeTax), use it so
// the figure ties exactly to the filed-return SE tax (which also accounts for any
// W-2 wages that consume the Social Security wage base). Otherwise derive SE tax
// from the year's SS wage base and the standard §1402/§3101 rates.
export function selfEmployedRetirementBase(netSEincome, year, engineSeTax) {
  const income = Math.max(0, Number(netSEincome) || 0)
  if (income === 0) return 0
  let halfSeTax
  if (Number.isFinite(engineSeTax) && engineSeTax > 0) {
    halfSeTax = engineSeTax / 2
  } else {
    const seEarnings = income * SE_NET_EARNINGS_FACTOR              // IRC §1402(a)(12) — 92.35%
    const ssWageBase = getTable(year).ssWageBase
    const seTax = Math.min(seEarnings, ssWageBase) * (FICA_SS_RATE * 2) // 12.4% OASDI
                + seEarnings * (FICA_MEDICARE_RATE * 2)                 // 2.9% Medicare
    halfSeTax = seTax / 2                                            // §164(f)
  }
  return Math.max(0, income - halfSeTax)
}

// ── Finding 1 follow-up (Jul 2026 independent audit) — SE-ELIGIBLE K-1 BASE ──
// The SEP-IRA / Solo 401(k) base for a non-S-corp owner must be NET EARNINGS FROM
// SELF-EMPLOYMENT — which EXCLUDES income that isn't SE income:
//   • S-corp / C-corp K-1 (FICA runs on W-2 officer wages instead),
//   • personally-held rental (Schedule E), and
//   • a LIMITED PARTNER's distributive share (excluded under IRC §1402(a)(13)).
// The prior code sized the base from the raw K-1 total, so a limited partner (SE
// tax = $0) was still handed a SEP recommendation — the exact cross-module
// inconsistency the audit flagged, since the Tax Tracker correctly treats that
// income as SE-exempt. This derives the SE-eligible share directly from the
// entities using the shared predicates (no engine round-trip, no new selector
// field to wire up), mirroring the engine's SE_SUBJECT_TYPES membership. It
// returns 0 for a pure limited-partner interest, so the SEP card cannot render a
// contribution on SE-exempt income. Per-entity K-1 mirrors the engine's rule
// (explicit e.k1, else owner-share of net profit via the shared helper); the
// aggregate is clamped to ≥ 0 by selfEmployedRetirementBase, so losses in one
// entity correctly offset SE income in another rather than being floored per row.
export function seEligibleK1FromEntities(entities) {
  return (Array.isArray(entities) ? entities : []).reduce((sum, e) => {
    if (!e) return sum
    if (isSCorpEntity(e.type) || isCCorpEntity(e.type) || isRealEstateEntity(e.type)) return sum
    if (e.limitedPartner && /partner|mmllc|llc/i.test(e.type || '')) return sum  // §1402(a)(13)
    const share = e.k1 !== undefined
      ? nf(e.k1)
      : Math.round(getEntityNetProfit(e) * (ownPct(e.own) / 100))
    return sum + share
  }, 0)
}

/** True when any entity is a limited-partner interest whose K-1 is SE-exempt
 *  under §1402(a)(13). Used to explain WHY no SEP room exists instead of
 *  silently dropping the card. */
export function hasLimitedPartnerInterest(entities) {
  return (Array.isArray(entities) ? entities : []).some(e =>
    e && e.limitedPartner && /partner|mmllc|llc/i.test(e.type || '') && !isSCorpEntity(e.type))
}

/**
 * SEP-IRA / Solo-401(k) contribution room for a pass-through owner.
 *
 * Returns every figure the AIAnalysis retirement cards render, computed from the
 * centralized year table (§415(c) limits are never hardcoded). Behaviorally
 * identical to the block previously inlined in AIAnalysis.jsx.
 *
 * @param {object}  p
 * @param {boolean} p.isSCorpOwner        S-corp owner → base is W-2 officer salary
 * @param {number}  p.totalOfficerSalary  W-2 officer compensation (S-corp base)
 * @param {number}  p.seEligibleK1        SE-eligible K-1 (non-S-corp base input)
 * @param {number}  p.seTax               engine SE tax if known (ties to filed return)
 * @param {number}  p.year                tax year (selects §415(c) limits)
 */
export function computeRetirementContributionRoom({ isSCorpOwner, totalOfficerSalary, seEligibleK1, seTax, year }) {
  const sepBase = isSCorpOwner
    ? totalOfficerSalary
    : selfEmployedRetirementBase(seEligibleK1, year, seTax)
  const sepRate = isSCorpOwner ? SEP_IRA_RATE : SEP_IRA_SOLE_PROP_EFFECTIVE_RATE
  const sepIraMax = getTable(year).retirement.sepIraMax
  const maxSEP = Math.min(sepIraMax, Math.round(sepBase * sepRate))
  const solo401kDeferral = getTable(year).retirement.solo401kDeferral
  const solo401kMax = getTable(year)?.retirement?.solo401kMax ?? sepIraMax
  const maxSolo401kEmployer = Math.round(sepBase * (isSCorpOwner ? SOLO_401K_EMPLOYER_RATE : SEP_IRA_SOLE_PROP_EFFECTIVE_RATE))
  const maxSolo401k = Math.min(solo401kMax, maxSolo401kEmployer + solo401kDeferral)
  return { sepBase, sepRate, sepIraMax, maxSEP, solo401kDeferral, solo401kMax, maxSolo401kEmployer, maxSolo401k }
}


// ─────────────────────────────────────────────────────────────────────────────
// PAL / QBI strategy-card math (F3/F8 extraction from AIAnalysis.jsx, Jul 2026).
// Pure functions; no React, no DOM. Unit-tested in aiAnalysisTaxMath-pal-qbi.test.js.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §469(i) $25,000 active-participation rental-loss allowance and the portion
 * usable against this year's net rental loss.
 *
 * Delegates the allowance itself to calc469iAllowance() in taxCalc.js — the SAME
 * code path the engine uses on the filed return (so MFS correctly yields $0 per
 * §469(i)(5)(B), and the $100K–$150K MAGI phase-out matches). `usable` clamps the
 * allowance to the actual loss. Behaviorally identical to the block previously
 * inlined in AIAnalysis.jsx.
 *
 * @param {object} p
 * @param {number} p.agi        MAGI proxy (pre-rental AGI), per the engine model
 * @param {string} p.filing     filing status ('single'|'mfj'|'mfs'|'hoh'|'qss')
 * @param {number} p.reNetShare net rental share (negative = loss); |value| is clamped
 * @returns {{ allowance: number, usable: number }}
 */
export function computePassiveLossAllowance({ agi, filing, reNetShare }) {
  const allowance = calc469iAllowance(agi, filing)
  const usable = Math.min(allowance, Math.abs(reNetShare))
  return { allowance, usable }
}

/**
 * §199A QBI wage/UBIA phase-in thresholds for a year, with a SAFE fallback.
 *
 * Replaces the inline `QBI_THRESHOLDS[year] || QBI_THRESHOLDS[2025]` in
 * AIAnalysis.jsx — a hardcoded fallback year that would silently show a stale
 * year's thresholds once a new tax year was added. Falls back to CURRENT_TAX_YEAR
 * instead, so the fallback can never drift behind the latest supported year.
 *
 * @param {number} year
 * @returns {{ single: number, mfj: number, mfs?: number, hoh?: number, qss?: number }}
 */
export function qbiThresholdsFor(year) {
  return QBI_THRESHOLDS[year] || QBI_THRESHOLDS[CURRENT_TAX_YEAR]
}
