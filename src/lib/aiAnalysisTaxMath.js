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
  calcEmployerFICA,   // AUDIT H1 (Sep 2026)
  getStdDed,
  getNIITThreshold,
  getAddlMedicareThreshold,
  QBI_THRESHOLDS,
  getTable,
  calc469iAllowance,
} from './taxCalc.js'
import { isPassthroughEntity, isCCorpEntity, isSCorpEntity, isRealEstateEntity, getEntityK1Share, ccorpOwnerShare, isLimitedPartnerEligibleType } from '../utils/entityPredicates'
import { nf } from '../utils/money.js'
import { resolveW2OwnForSE } from '../utils/w2OwnForSE.js'   // FIFTH READ F-3
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
 * §199A QBI deduction; Treas. Reg. §1.199A-3(b)(1)(vi), (b)(2)(i); Form 8995 instructions. For non-SE pass-throughs
 * (S-Corp) the QBI basis is net of the separately-stated §179 deduction per
 * Treas. Reg. §1.199A-3(b)(1)(vi), (b)(2)(i); Form 8995 instructions — handled upstream by the caller passing
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
    w2OwnForSE:        nf(f.w2OwnForSE) || 0, // R-2 (14 Sep 2026): MFJ Schedule SE attribution
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
  const ownerPctVal  = Number.isFinite(ctx.ownerPctVal) ? ctx.ownerPctVal : 1
  const taxYear      = parseInt(ctx.taxYear) || CURRENT_TAX_YEAR
  const status       = ctx.filing || 'single'
  const isCC         = isCCorpEntity(ctx.entityType)

  // AUDIT H1 (Sep 2026): the simulator mirrored the Tax Tracker's P&L — and mirrored
  // its bug. Employer-side FICA on officer salary (IRC §3111) is a deductible expense
  // of the S-Corp and was subtracted nowhere, so a "what if I change my salary"
  // scenario understated the true cost of every extra dollar of salary. The C-Corp
  // branch below is unaffected: calcCCorpCorporateLayer already deducts employerFICA
  // at the corporate layer, and adding it here as well would double-count.
  const employerPayrollTax = (!isCC && isSCorpEntity(ctx.entityType)) ? calcEmployerFICA(sal, taxYear) : 0

  const netBizIncome = rev - cogs - opex - sal - employerPayrollTax - dep - adv - other
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
    // FOURTH READ R-2, third pass (14 Sep 2026): carry the MFJ attribution so the simulator
    // agrees with Step 2. On Step 2 the attribution is entered against w2Total = personal W-2
    // + officer W-2, so the record's `w2OwnForSE` ALREADY contains whatever officer salary the
    // owner attributed to themself — adding `sal` again double-counted it (second-pass review
    // finding 1). Only a CHANGE in salary moves the owner's own W-2, one-for-one, because the
    // officer salary is the owner's by definition. The engine clamps the result to `w2`.
    // FIFTH READ F-3 (15 Sep 2026): when nothing was attributed on Step 2, Step 2 now
    // attributes the owner's own officer salary by default — mirror that here with the
    // SIMULATED salary (the officer salary is the owner's by definition), so the simulator
    // and the Tracker keep agreeing. A typed attribution still moves one-for-one with the
    // salary change, as before.
    w2OwnForSE: status === 'mfj' && nf(base.w2OwnForSE) > 0
      ? Math.max(0, nf(base.w2OwnForSE) + (sal - nf(base.officerSalary)))
      : resolveW2OwnForSE({ status, entered: 0, officerW2: (isCC || isSCorpEntity(ctx.entityType)) ? sal : 0 }),
    // Finding 1 follow-up (Jul 2026 audit): carry the limited-partner attestation
    // into the reconstructed entity. Without it, normalizeEntityType defaults a
    // Partnership/LLC to the ACTIVE (SE-subject) variant, so the simulator charged
    // SE tax on a limited partner's K-1 (§1402(a)(13)) — diverging from the Tax
    // Tracker, SE-savings panel, and SEP-IRA card, which all treat it as SE-exempt.
    entities: isCC ? [] : [{ type: ctx.entityType, k1, own: 100, officerW2: sal, limitedPartner: !!ctx.limitedPartner, passiveShareholder: !!ctx.passiveShareholder }],
  }
  validateCalcInputs(engineInput, 'WhatIfSimulator')

  if (isCC) {
    const layer = calcCCorpCorporateLayer({ netProfit: netBizIncome + sal, officerSalary: sal, taxYear })  // employerPayrollTax is 0 on this branch by construction
    // C-CORP AUDIT (11 Sep 2026): the pass-through branch scales k1 by ownerPctVal; this
    // branch folded 100% of the dividends and corporate tax in. Owner's share only now.
    const mine = ccorpOwnerShare(layer, ownerPctVal * 100)
    const r = calcTaxReturn({ ...engineInput, divInc: mine.dividends, qualDiv: mine.dividends })
    const totalTax = r.totalTax + mine.corpTax
    return {
      rev, opex, sal, dep, adv, other, netBizIncome, k1: 0, employerPayrollTax,
      w2: engineInput.w2, qbi: 0, agi: r.agi, seTax: 0,
      taxableInc: r.taxableAfterQBI, fedTax: r.fedTax + mine.corpTax,
      totalTax, quarterly: r.quarterlyRecommended,
    }
  }

  const r = calcTaxReturn(engineInput)
  return {
    rev, opex, sal, dep, adv, other, netBizIncome, k1, employerPayrollTax,
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
/**
 * AUDIT H5 (Sep 2026): types for which a §1402(a)(13) limited-partner election can
 * even exist. Partnerships and multi-member LLCs only — never a sole proprietor or
 * single-member LLC, whose net earnings are SE income by definition, and never a
 * corporation. Written as an explicit sole-prop exclusion because the canonical label
 * for a sole prop ends in "Single-Member LLC", which any bare /llc/ test will match.
 */
// FIFTH READ (15 Sep 2026): definition moved to utils/entityPredicates.js (shared with
// taxCalc.js and the UI). Re-exported here so existing imports keep working.
export { isLimitedPartnerEligibleType }

export function seEligibleK1FromEntities(entities) {
  return (Array.isArray(entities) ? entities : []).reduce((sum, e) => {
    if (!e) return sum
    if (isSCorpEntity(e.type) || isCCorpEntity(e.type) || isRealEstateEntity(e.type)) return sum
    // AUDIT H5 (Sep 2026): this was /partner|mmllc|llc/i — and the bare `llc`
    // alternative also matches the CANONICAL sole-proprietor label,
    // 'Sole Proprietor / Single-Member LLC'. A sole prop carrying a stray
    // limitedPartner flag therefore had its entire Schedule C profit dropped from
    // the retirement base, silently. §1402(a)(13) is a PARTNERSHIP provision; it has
    // no application to a sole proprietor, whose net earnings are always SE income.
    if (e.limitedPartner && isLimitedPartnerEligibleType(e.type)) return sum  // §1402(a)(13)
    // FINDING-2 FIX (independent audit, Aug 2026): use the shared getEntityK1Share()
    // resolver so a k1DirectMode entity's already-allocated Box 1 isn't re-scaled by
    // Ownership % a second time here — this SEP-IRA/Solo-401(k) base calc was a
    // fourth, previously-missed copy of the same buggy inline formula.
    const share = getEntityK1Share(e)
    return sum + share
  }, 0)
}

/** True when any entity is a limited-partner interest whose K-1 is SE-exempt
 *  under §1402(a)(13). Used to explain WHY no SEP room exists instead of
 *  silently dropping the card. */
export function hasLimitedPartnerInterest(entities) {
  return (Array.isArray(entities) ? entities : []).some(e =>
    e && e.limitedPartner && isLimitedPartnerEligibleType(e.type) && !isSCorpEntity(e.type))
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
  // AUDIT H5 (Sep 2026): this branched EITHER/OR on isSCorpOwner, and the caller set
  // isSCorpOwner true if ANY entity was an S-Corp. An owner with an S-Corp AND a
  // Schedule C therefore had 100% of the Schedule C's self-employment earnings dropped
  // from the base — silently. In the audit's own scenario a $300,000 sole proprietor
  // was told the allowable contribution was $0, roughly $56,000 of deduction and about
  // $19,600 of tax, reported as nothing.
  //
  // Both bases are real and they coexist: the S-Corp side is 25% of W-2 officer
  // compensation (IRC §415(c)(3) compensation), the self-employed side is the effective
  // 20% of net earnings after the ½-SE-tax reduction. Compute each, then sum.
  const sCorpBase = isSCorpOwner ? Math.max(0, nf(totalOfficerSalary)) : 0
  const seBase    = selfEmployedRetirementBase(seEligibleK1, year, seTax)

  const sCorpEmployer = Math.round(sCorpBase * SEP_IRA_RATE)
  const seEmployer    = Math.round(seBase * SEP_IRA_SOLE_PROP_EFFECTIVE_RATE)

  const sepIraMax = getTable(year).retirement.sepIraMax
  // §415(c) is applied ONCE here rather than per source. Separate plans for genuinely
  // unrelated employers can allow more, but §414(b)/(c)/(m) controlled-group and
  // affiliated-service-group aggregation frequently collapses them back to one limit —
  // a facts-and-circumstances question this tool cannot resolve. Capping at a single
  // limit is the conservative direction, and hasBothBases below tells the UI to say so.
  const maxSEP = Math.min(sepIraMax, sCorpEmployer + seEmployer)

  const solo401kDeferral = getTable(year).retirement.solo401kDeferral
  const solo401kMax = getTable(year)?.retirement?.solo401kMax ?? sepIraMax
  const maxSolo401kEmployer = Math.round(sCorpBase * SOLO_401K_EMPLOYER_RATE)
                            + Math.round(seBase * SEP_IRA_SOLE_PROP_EFFECTIVE_RATE)
  const maxSolo401k = Math.min(solo401kMax, maxSolo401kEmployer + solo401kDeferral)

  // sepBase/sepRate are retained for callers that display them. With a single source the
  // rate is the exact statutory constant; only a genuinely mixed base yields a blend, and
  // deriving it from rounded dollar amounts there is fine because it is display-only.
  const sepBase = sCorpBase + seBase
  const sepRate = seBase <= 0 ? SEP_IRA_RATE
    : sCorpBase <= 0 ? SEP_IRA_SOLE_PROP_EFFECTIVE_RATE
    : (sCorpEmployer + seEmployer) / sepBase
  const hasBothBases = sCorpBase > 0 && seBase > 0

  return {
    sepBase, sepRate, sepIraMax, maxSEP, solo401kDeferral, solo401kMax,
    maxSolo401kEmployer, maxSolo401k,
    sCorpBase, seBase, sCorpEmployer, seEmployer, hasBothBases,
  }
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

// ─── RECORD-LEVEL REVENUE ────────────────────────────────────────────────────
// AUDIT (Sep 2026). This lived in AIAnalysis.jsx and read:
//
//   const fromBiz = nf(rec?.biz?.grossRevenue)
//   if (fromBiz > 0) return fromBiz
//   ...otherwise sum the entities
//
// The bug is that rec.biz is not a total. AIAnalysis.getRecord() builds it from
// the ONE "primary" entity it selects for the simulator — preferring a non-rental
// entity that has gross revenue. So on any multi-entity record the helper returned
// a single entity's revenue while every caller treated it as the record's.
//
// The damage was suppressed guidance rather than a wrong number on screen, which
// is why it survived: the §179 equipment card is gated on revenue > 30,000, so an
// owner running three entities at 15,000 each — 45,000 in total, comfortably over
// the gate — was simply never told about a deduction they qualified for. The
// completeness meter, the "missing gross receipts" prompt, the depreciation
// finding in the Risk Scan and the CPA-export checklist all read the same helper,
// so one entity's figure stood in for the whole record across Step 3.
//
// Now: when a record has entities, the entities ARE the record — sum all of them.
// rec.biz remains the fallback for a legacy single-business record saved before
// the entities array existed, and for a record whose entities carry no revenue.
//
// @param {object} rec  a saved or live record
// @returns {number} total gross receipts across the record
export function recEntityRevenue(rec) {
  const ents = Array.isArray(rec?.entities) ? rec.entities : []
  const fromEntities = ents.reduce((s, e) => s + nf(e?.pnl?.grossRevenue), 0)
  if (fromEntities > 0) return fromEntities
  return nf(rec?.biz?.grossRevenue)
}

// FRESH-EYES F-10 (11 Sep 2026): the aggregate above fixed one defect and created its
// mirror. recEntityRevenue sums EVERY entity — rental LLCs and C-Corps included — and the
// §179 equipment prompt and the "no depreciation recorded" finding were gated on it. So
// a filer whose receipts were mostly gross rents now cleared a $30,000 gate and was
// prompted toward an election that §179(d)(1) conditions on property used in the ACTIVE
// conduct of a trade or business — which ordinary §212 rental activity does not supply.
// A C-Corp's revenue is likewise not the individual's: its §179 election is the
// corporation's, on Form 1120, and never reaches the owner's return. The old bug
// suppressed guidance; this one could surface it wrongly, toward a deduction the
// taxpayer cannot take.
//
// This helper counts only the entities whose §179 and depreciation flow to the owner's
// 1040 — sole props, partnerships, S-Corps. recEntityRevenue stays as the record-wide
// total for the completeness meter and the "missing gross receipts" prompt, where the
// whole record is the right denominator.
//
// @param {object} rec  a saved or live record
// @returns {number} gross receipts across pass-through operating entities only
export function recOperatingRevenue(rec) {
  const ents = Array.isArray(rec?.entities) ? rec.entities : []
  const isRental = (t) => /real.?estate|schedule.?e|rental/i.test(t || '')
  const isCCorp  = (t) => /c.?corp/i.test(t || '')
  const fromEntities = ents.reduce((s, e) => {
    if (!e || isRental(e.type) || isCCorp(e.type)) return s
    return s + nf(e?.pnl?.grossRevenue)
  }, 0)
  if (ents.length > 0) return fromEntities
  // Legacy single-business record: rec.biz is the one entity, typed by biz.entityType.
  const t = rec?.biz?.entityType
  if (isRental(t) || isCCorp(t)) return 0
  return nf(rec?.biz?.grossRevenue)
}
