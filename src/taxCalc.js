// src/taxCalc.js
// Pure tax calculation helpers — no React, no DOM, no side effects.
// Safe to call from any module.
//
// Permanent rate constants live in constants.js (imported below).
// Year-specific figures (brackets, thresholds, limits) live in TAX_TABLES / AMT_TABLES below.
// Update TAX_TABLES each tax year — do not touch the rate constants.
//
// Export map:
// calcTaxReturn — top-level orchestrator; call this from TaxReturn.jsx
// calcQBI — §199A deduction; MUST be imported by AIAnalysis.jsx (F4-02: single source)
// calcAMT — Form 6251 AMT
// calcFederalTax — ordinary income brackets
// calcPreferentialTax — QDCGTW (LTCG / qualified dividends / §1250 / collectibles)
// calcNIIT — §1411 net investment income tax
// TAX_TABLES, AMT_TABLES, SALT_CAPS, getTable, getStdDed, getBrackets,
// getLTCGThresholds, getNIITThreshold, getAddlMedicareThreshold, getMarginalRate, calcFICAOnWages
// calc469iAllowance — §469(i) $25k active-participation allowance (M1: single source
//   of truth — consumed by both engine PAL branches AND the AIAnalysis strategy card)
//
//
// ── Engine change log ───────────────────────────────────────────────────────
// The historical fix log that used to live here (M-2, F6/F5, TAX-10, PASS4B-*, etc.)
// was moved to CHANGELOG.md (audit F9) so this header documents current behavior and the
// export map only. Record future engine changes in CHANGELOG.md and commit messages,
// not in source comments. Behavior-describing notes and IRC-section citations stay inline
// at the relevant code below.
// ────────────────────────────────────────────────────────────────────────────
import {
  NIIT_THRESHOLD_SINGLE,
  NIIT_THRESHOLD_MFJ,
  NIIT_THRESHOLD_MFS,
  NIIT_THRESHOLD_HOH,
  NIIT_THRESHOLD_QSS,
  ADDITIONAL_MEDICARE_TAX_THRESHOLD_SINGLE,
  ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFJ,
  ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFS,
  ADDITIONAL_MEDICARE_TAX_THRESHOLD_HOH,
  ADDITIONAL_MEDICARE_TAX_THRESHOLD_QSS,
  SE_SUBJECT_TYPES,
  QBI_DEDUCTION_RATE,
  W2_WAGE_LIMIT_RATE,
  W2_WAGE_ALT_RATE,
  UBIA_RATE,
  NIIT_RATE,
  ADDITIONAL_MEDICARE_TAX_RATE,
  SE_TAX_DEDUCTION_RATE,
  AMT_RATE_LOW,
  AMT_RATE_HIGH,
  LTCG_RATE_MID,
  LTCG_RATE_HIGH,
  FICA_SS_RATE,
  FICA_MEDICARE_RATE,
  SE_NET_EARNINGS_FACTOR,
  SCORP_REASONABLE_COMP_RATIO_THRESHOLD, SCORP_REASONABLE_COMP_MIN_TOTAL,
  UNRECAPTURED_1250_MAX_RATE,
  COLLECTIBLES_MAX_RATE,
  CURRENT_TAX_YEAR,
  CTC_PHASEOUT_THRESHOLD_MFJ,
  CTC_PHASEOUT_THRESHOLD_OTHER,
  CTC_PHASEOUT_STEP,
  CTC_PHASEOUT_REDUCTION_PER_STEP,
  C_CORP_TAX_RATE,
  DEFAULT_OFFICER_SALARY_FRACTION,
  // M1 (audit F-01/F-02, Jul 2026): the engine previously hardcoded these figures as
  // raw literals (25000 / 100000 / 0.5 / 0.80) while the named constants sat unused in
  // constants.js — a "dead constant shadowing a live literal" hazard. The literals now
  // route through the single declared source of truth. Values are statutory (NOT
  // inflation-adjusted): IRC §469(i)(2)/(3)(A) and §172(a)(2).
  PAL_SPECIAL_ALLOWANCE_BASE,
  PAL_PHASE_OUT_START,
  PAL_PHASE_OUT_RATE,
  NOL_CARRYFORWARD_CAP_RATE,
} from './constants.js'
import { normalizeEntityType, isRealEstateEntity, isSCorpEntity, isCCorpEntity, ownPct, getEntityPnlNetShare } from './utils/entityPredicates.js'
import { nf } from './utils/money.js'
// nf(): canonical money parser imported from utils/parseMoney.js (audit D-1).
// Strips thousands separators; engine inputs are stored comma-free so this is
// strictly more robust than a local copy. (nv alias removed — audit finding 3.2.)
const TAX_TABLES = {
  2024: {
    std: { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900, qss: 29200 },
    ssWageBase: 168600,
    brackets: {
      single: [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[609350,.35],[Infinity,.37]],
      mfj:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
      mfs:    [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[365600,.35],[Infinity,.37]],
      hoh:    [[16550,.10],[63100,.12],[100500,.22],[191950,.24],[243700,.32],[609350,.35],[Infinity,.37]],
      qss:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]]  // AUDIT: fixed .37 typo at the 35% cap,
    },
    ltcg:    { single:[47025,518900], mfj:[94050,583750], mfs:[47025,291850], hoh:[63000,551350], qss:[94050,583750] },
    niit:    { single:NIIT_THRESHOLD_SINGLE, mfj:NIIT_THRESHOLD_MFJ, mfs:NIIT_THRESHOLD_MFS, hoh:NIIT_THRESHOLD_HOH, qss:NIIT_THRESHOLD_QSS },
    addlMed: { single:ADDITIONAL_MEDICARE_TAX_THRESHOLD_SINGLE, mfj:ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFJ, mfs:ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFS, hoh:ADDITIONAL_MEDICARE_TAX_THRESHOLD_HOH, qss:ADDITIONAL_MEDICARE_TAX_THRESHOLD_QSS },
    ebl: { single:305000, mfj:610000, mfs:305000, hoh:305000, qss:610000 },
    ctc: { perChild: 2000 },
    retirement: {
      sepIraMax:        69000,
      solo401kDeferral: 23000,
      solo401kMax:      69000,
      catchUp401k:       7500,
      catchUp401kSuper:     0,
      iraLimit:          7000,
      catchUpIra:        1000,
    },
    hsa: { selfOnly: 4150, family: 8300 },  // Rev. Proc. 2023-23
    mileageRate: 0.67,
    amt: {
      exemption:    { single:85700,  mfj:133300, mfs:66650,  hoh:85700,  qss:133300 },
      phaseoutStart:{ single:609350, mfj:1218700,mfs:609350, hoh:609350, qss:1218700 },
      phaseoutRate: 0.25,
      bracket26_28: { single:232600, mfj:232600, mfs:116300, hoh:232600, qss:232600 },
    },
    saltCap: 10000,
    // Pre-OBBBA TCJA cap — no phase-down structure existed for 2024.
    saltPhaseDown: null,
    qbi: {
      threshold:    { single:191950, mfj:383900, hoh:191950, mfs:191950 },
      phaseIn:      { single:50000,  mfj:100000, hoh:50000,  mfs:50000 },
      minDeduction: null,
      minThreshold: null,
    },
  },
  2025: {
    std: { single: 15750, mfj: 31500, mfs: 15750, hoh: 23625, qss: 31500 },
    ssWageBase: 176100,
    brackets: {
      single: [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]],
      mfj:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
      mfs:    [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[313200,.35],[Infinity,.37]],
      hoh:    [[17000,.10],[64850,.12],[103350,.22],[197300,.24],[250500,.32],[626350,.35],[Infinity,.37]],
      qss:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
    },
    ltcg:    { single:[48350,533400], mfj:[96700,600050], mfs:[48350,300000], hoh:[64750,566700], qss:[96700,600050] },
    niit:    { single:NIIT_THRESHOLD_SINGLE, mfj:NIIT_THRESHOLD_MFJ, mfs:NIIT_THRESHOLD_MFS, hoh:NIIT_THRESHOLD_HOH, qss:NIIT_THRESHOLD_QSS },
    addlMed: { single:ADDITIONAL_MEDICARE_TAX_THRESHOLD_SINGLE, mfj:ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFJ, mfs:ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFS, hoh:ADDITIONAL_MEDICARE_TAX_THRESHOLD_HOH, qss:ADDITIONAL_MEDICARE_TAX_THRESHOLD_QSS },
    ebl: { single:313000, mfj:626000, mfs:313000, hoh:313000, qss:626000 },
    ctc: { perChild: 2200 },
    retirement: {
      sepIraMax:        70000,
      solo401kDeferral: 23500,
      solo401kMax:      70000,
      catchUp401k:       7500,
      catchUp401kSuper: 11250,
      iraLimit:          7000,
      catchUpIra:        1000,
    },
    hsa: { selfOnly: 4300, family: 8550 },  // Rev. Proc. 2024-25
    mileageRate: 0.70,
    amt: {
      exemption:    { single:88100,  mfj:137000, mfs:68650,  hoh:88100,  qss:137000 },
      phaseoutStart:{ single:626350, mfj:1252700,mfs:626350, hoh:626350, qss:1252700 },
      phaseoutRate: 0.25,
      bracket26_28: { single:239100, mfj:239100, mfs:119550, hoh:239100, qss:239100 },
    },
    saltCap: 40000,   // §164(b)(6) as amended by OBBBA §70120 (2025: $40,000 / $20,000 MFS)
    saltPhaseDown: { threshold: 500000, floor: 10000 },  // 30% of MAGI excess; MFS = half of each
    qbi: {
      threshold:    { single:197300, mfj:394600, hoh:197300, mfs:197300 },
      phaseIn:      { single:50000,  mfj:100000, hoh:50000,  mfs:50000 },
      minDeduction: null,
      minThreshold: null,
    },
  },
  // OBBBA (One Big Beautiful Bill Act, P.L. 119-21) Rev. Proc. figures — verify
  // against IRS Rev. Proc. for tax year 2026 before each filing season.
  2026: {
    std: { single: 16100, mfj: 32200, mfs: 16100, hoh: 24150, qss: 32200 },
    ssWageBase: 184500,
    // AUDIT F-1 FIX (Jul 2026): prior values were pre-official projections that missed
    // OBBBA's asymmetric adjustment (+4% bottom two brackets, ~+2.3% upper). Every
    // figure below is transcribed from Rev. Proc. 2025-32 §4.01 (brackets) and §4.03
    // (LTCG breakpoints, §1(h)). Do not "index forward" by formula — transcribe from
    // the Rev. Proc. each year.
    brackets: {
      single: [[12400,.10],[50400,.12],[105700,.22],[201775,.24],[256225,.32],[640600,.35],[Infinity,.37]],
      mfj:    [[24800,.10],[100800,.12],[211400,.22],[403550,.24],[512450,.32],[768700,.35],[Infinity,.37]],
      mfs:    [[12400,.10],[50400,.12],[105700,.22],[201775,.24],[256225,.32],[384350,.35],[Infinity,.37]],
      hoh:    [[17700,.10],[67450,.12],[105700,.22],[201750,.24],[256200,.32],[640600,.35],[Infinity,.37]],
      qss:    [[24800,.10],[100800,.12],[211400,.22],[403550,.24],[512450,.32],[768700,.35],[Infinity,.37]],
    },
    ltcg:    { single:[49450,545500], mfj:[98900,613700], mfs:[49450,306850], hoh:[66200,579600], qss:[98900,613700] },
    niit:    { single:NIIT_THRESHOLD_SINGLE, mfj:NIIT_THRESHOLD_MFJ, mfs:NIIT_THRESHOLD_MFS, hoh:NIIT_THRESHOLD_HOH, qss:NIIT_THRESHOLD_QSS },
    addlMed: { single:ADDITIONAL_MEDICARE_TAX_THRESHOLD_SINGLE, mfj:ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFJ, mfs:ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFS, hoh:ADDITIONAL_MEDICARE_TAX_THRESHOLD_HOH, qss:ADDITIONAL_MEDICARE_TAX_THRESHOLD_QSS },
    // AUDIT A4-3 FIX (Jul 2026): prior 320,000/640,000 was forward-indexation that
    // missed the OBBBA §70601 statutory RESET — 2026 thresholds went DOWN.
    // Official: Rev. Proc. 2025-32 §4.31.
    ebl: { single:256000, mfj:512000, mfs:256000, hoh:256000, qss:512000 },
    ctc: { perChild: 2200 },
    // AUDIT F-8 FIX (Jul 2026): prior values were pre-official projections. All figures
    // below transcribed from IRS Notice 2025-67 (Nov 2025).
    retirement: {
      sepIraMax:        72000,   // §415(c)(1)(A)
      solo401kDeferral: 24500,   // §402(g)(1)
      solo401kMax:      72000,   // §415(c)(1)(A)
      catchUp401k:       8000,   // §414(v)(2)(B)(i)
      catchUp401kSuper: 11250,   // §414(v)(2)(E) ages 60-63 (unchanged)
      iraLimit:          7500,   // §219(b)(5)(A)
      catchUpIra:        1100,   // §219(b)(5)(B)
    },
    // AUDIT F-8 FIX: HSA limits by year (previously hardcoded 2025 figures in the
    // AIAnalysis strategy card). 2026 per Rev. Proc. 2025-19.
    hsa: { selfOnly: 4400, family: 8750 },
    mileageRate: 0.725,
    amt: {
      exemption:    { single:90100,  mfj:140200, mfs:70100,  hoh:90100,  qss:140200 },
      phaseoutStart:{ single:500000, mfj:1000000,mfs:500000, hoh:500000, qss:1000000 },
      phaseoutRate: 0.50,
      bracket26_28: { single:244500, mfj:244500, mfs:122250, hoh:244500, qss:244500 },
    },
    saltCap: 40400,   // AUDIT N-1 (Jul 2026): 2026 = $40,400 / $20,200 MFS — OBBBA §70120, Rev. Proc. 2025-32
    saltPhaseDown: { threshold: 505000, floor: 10000 },  // phase-down 30% of MAGI over $505K ($252.5K MFS), floor $10K ($5K MFS)
    qbi: {
      threshold:    { single:201775, mfj:403500, hoh:201775, mfs:201775 },
      phaseIn:      { single:75000,  mfj:150000, hoh:75000,  mfs:75000 },
      minDeduction: 400,   // §199A(i) OBBBA minimum deduction (years beginning after 12/31/2025)
      minThreshold: 1000,  // active QBI floor that triggers the $400 minimum
    },
  },
}
// ── Derived per-year views — single source of truth is TAX_TABLES above ───────
// AMT, SALT, and QBI year figures now live inside each TAX_TABLES[year] (keys: amt,
// saltCap, qbi). The objects below are DERIVED from TAX_TABLES, so adding a new tax year
// means editing ONE object (TAX_TABLES[year]) and these views update automatically — they
// can no longer drift or be forgotten. Shapes/keys are identical to the previous standalone
// literals, so every consumer (engine internals, articles.js, AIAnalysis.jsx, tests) and the
// exported API are unchanged. QBI_MIN_* intentionally omit years where the value is null
// (matching the prior { 2026: ... }-only objects the OBBBA §199A(i) floor relies on).
const _TAX_YEARS = Object.keys(TAX_TABLES)
const _byYear = (sel) => Object.fromEntries(_TAX_YEARS.map(y => [y, sel(TAX_TABLES[y])]))
const _byYearDefined = (sel) =>
  Object.fromEntries(_TAX_YEARS.map(y => [y, sel(TAX_TABLES[y])]).filter(([, v]) => v != null))
const AMT_TABLES         = _byYear(t => t.amt)
const SALT_CAPS          = _byYear(t => t.saltCap)
const SALT_PHASE_DOWN    = _byYear(t => t.saltPhaseDown)

/** AUDIT N-1 FIX (Jul 2026): §164(b)(6)/(b)(7) as amended by OBBBA §70120.
 *  Returns the SALT cap for the year/status after the MAGI-based phase-down:
 *  cap reduced by 30% of MAGI over the threshold, never below the floor.
 *  MFS uses half of the cap, threshold, and floor. Pre-2025 years have no
 *  phase-down (saltPhaseDown: null). MAGI here = AGI (the §164(b)(7) addbacks
 *  — §911/931/933 exclusions — are not modeled by this app). */
function getSaltCap(taxYear, status, magi) {
  const half = status === 'mfs' ? 0.5 : 1
  const base = (SALT_CAPS[taxYear] ?? SALT_CAPS[CURRENT_TAX_YEAR]) * half
  const pd   = SALT_PHASE_DOWN[taxYear] !== undefined ? SALT_PHASE_DOWN[taxYear] : SALT_PHASE_DOWN[CURRENT_TAX_YEAR]
  if (!pd) return base
  const threshold = pd.threshold * half
  const floor     = pd.floor * half
  const reduced   = base - 0.30 * Math.max(0, (magi || 0) - threshold)
  return Math.max(floor, Math.min(base, reduced))
}
/** §469(i) special $25,000 allowance — rental real estate losses of an active
 *  participant may offset nonpassive income up to this allowance, phased out
 *  50¢ per $1 of MAGI over $100,000 (fully eliminated at $150,000 —
 *  §469(i)(3)(A)). Married filing separately: $0 by default (§469(i)(5)(B);
 *  the half-allowance for spouses living apart all year is not modeled — the
 *  conservative $0 default matches the engine's prior behavior). Dollar
 *  amounts are statutory and NOT inflation-adjusted.
 *
 *  M1 (audit F-01, Jul 2026): SINGLE SOURCE OF TRUTH for this formula. It
 *  previously lived in three places (two engine branches + an inline copy in
 *  the AIAnalysis strategy card) that could — and for MFS filers, did —
 *  diverge. Both engine branches and the strategy card now call this helper.
 *  The MAGI argument is the caller's pre-rental-AGI proxy, consistent with the
 *  engine's simplified §469(i)(3)(F) model. */
function calc469iAllowance(magi, status, isActiveParticipant = true) {
  if (status === 'mfs' || !isActiveParticipant) return 0
  return Math.max(
    0,
    PAL_SPECIAL_ALLOWANCE_BASE -
      Math.max(0, ((magi || 0) - PAL_PHASE_OUT_START) * PAL_PHASE_OUT_RATE)
  )
}
const QBI_THRESHOLDS     = _byYear(t => t.qbi.threshold)
const QBI_PHASE_IN_RANGE = _byYear(t => t.qbi.phaseIn)
const QBI_MIN_DEDUCTION  = _byYearDefined(t => t.qbi.minDeduction)
const QBI_MIN_THRESHOLD  = _byYearDefined(t => t.qbi.minThreshold)

// ── §179 business-income limitation (M3, audit F-03) ─────────────────────────
//
// §179(b)(3)(A): the §179 deduction is limited to aggregate taxable income from
// the active conduct of trades or businesses; the disallowed excess carries
// forward (§179(b)(3)(B)). This app's proxy for that aggregate: non-passive K-1
// income (pre-§179, with separately-stated charitable added back) + W-2 wages +
// officer compensation — the same proxy the AIAnalysis strategy layer has used
// since the QBI-179 fix; this function is a VERBATIM extraction of that inline
// block (previously AIAnalysis.jsx ~159–166), moved here per ARCHITECTURE §1.
// The only difference is null-hardening (e?.box11_12 where the inline read
// e.box11_12), which changes behavior solely in would-have-crashed cases.
//
// NOT MODELED (documented in KNOWN_LIMITATIONS.md): the §179(b)(1)/(b)(2)
// dollar limitation and investment phase-out. This function implements only
// the business-income limitation.
//
// Charitable note (audit F-13): box12_13 (separately-stated charitable) is a
// Schedule A item — it is added back into k1ActiveIncome for the income-limit
// proxy and subtracted again in k1Capped, so it never reduces K-1 ordinary
// income. Net effect: k1Capped = k1NonPassive + sec179Disallowed (a disallowed
// §179 amount does not reduce this year's income; it carries forward).
function calc179Limitation({ k1NonPassive = 0, entities = [], w2Income = 0 } = {}) {
  const list = Array.isArray(entities) ? entities : []
  const totalSec179          = list.reduce((s, e) => s + nf(e?.box11_12), 0)
  const totalBox12_13        = list.reduce((s, e) => s + nf(e?.box12_13), 0)
  const k1ActiveIncome       = k1NonPassive + totalSec179 + totalBox12_13
  const totalOfficerSalary   = list.reduce((s, e) => s + nf(e?.pnl?.officerSalary), 0)
  const activeBusinessIncome = Math.max(0, k1ActiveIncome + (nf(w2Income) || 0) + totalOfficerSalary)
  const sec179Allowed        = Math.min(totalSec179, activeBusinessIncome)
  const sec179Disallowed     = Math.max(0, totalSec179 - activeBusinessIncome)
  const k1Capped             = k1ActiveIncome - sec179Allowed - totalBox12_13
  return {
    totalSec179, totalBox12_13, k1ActiveIncome, totalOfficerSalary,
    activeBusinessIncome, sec179Allowed, sec179Disallowed, k1Capped,
  }
}

// ── S-Corp reasonable-compensation rule core (D-10, dead-code audit Jul 2026) ──
//
// The NUMERIC rule behind the reasonable-comp alert — previously implemented
// twice (here, and re-typed in Dashboard.jsx's scenario card), which had already
// let the two surfaces drift in message wording. This core is now the single
// source for the numbers; each surface keeps its own message/shape (the wording
// divergence is documented as OBS-7 in KNOWN_LIMITATIONS.md, owner decision).
//
// Heuristic, not law: the IRS applies a facts-and-circumstances test under
// Treas. Reg. §1.162-7 (see Watson v. Commissioner, 668 F.3d 1008 (8th Cir.
// 2012)); the ratio threshold is a practitioner benchmark, and the $20k floor
// is a noise gate so trivial scenarios don't alert.
function calcReasonableCompCore(officerSalary, k1Distributions) {
  const sal = Math.max(0, officerSalary)
  const k1  = Math.max(0, k1Distributions)
  const totalComp = sal + k1
  if (totalComp < SCORP_REASONABLE_COMP_MIN_TOTAL) {
    return { applicable: false, triggered: false, ratio: 1, ratioPct: 100 }
  }
  const ratio = totalComp > 0 ? sal / totalComp : 1
  return {
    applicable: true,
    triggered: ratio < SCORP_REASONABLE_COMP_RATIO_THRESHOLD,
    ratio,
    ratioPct: Math.round(ratio * 100),
  }
}

// ── Flow-through K-1 aggregation (M3, audit F-04) ─────────────────────────────
//
// The single rule for the k1Total that persistStep1 writes to session state and
// the engine consumes: for every non-C-Corp entity, the owner's rounded share
// of P&L net, NET of separately-stated §179 (box11_12). Charitable (box12_13)
// is deliberately NOT netted — it is a Schedule A item, not a reduction of K-1
// ordinary income (audit F-13; IRC §179 separately-stated treatment per
// §1366(a)(1)(A) / §702(a)). Previously three verbatim copies inside
// CalculateTaxInner.jsx; a divergence here would have changed the filed k1Total.
// Null entities are skipped (one of the three copies already did this; for the
// other two this is hardening of a would-have-crashed case only).
function sumK1FlowThrough(entities) {
  return (Array.isArray(entities) ? entities : []).reduce((s, e) => {
    if (!e || isCCorpEntity(e.type)) return s
    return s + getEntityPnlNetShare(e) - nf(e.box11_12)
  }, 0)
}
function getTable(year) { return TAX_TABLES[year] || TAX_TABLES[CURRENT_TAX_YEAR] }
/** §63(c) Standard deduction by filing status. Inflation-adjusted annually — IRC §1(f)(3).
 *  Values live in TAX_TABLES[year].std; includes OBBBA adjustments for 2026. */
function getStdDed(year, fs) { const t = getTable(year).std; return t[fs] || t.single }
function getBrackets(year, fs) { const t = getTable(year).brackets; return t[fs] || t.single }
/** §1(h) LTCG/QD bracket thresholds by filing status. Inflation-adjusted — IRC §1(f)(3). */
function getLTCGThresholds(year, fs) { const t = getTable(year).ltcg; return t[fs] || t.single }
/** §1411(b) NIIT MAGI threshold by filing status. NOT inflation-adjusted (statutory). */
function getNIITThreshold(year, fs) { const t = getTable(year).niit; return t[fs] || 200000 }
/** §3101(b)(2) Additional Medicare Tax threshold by filing status. NOT inflation-adjusted. */
function getAddlMedicareThreshold(year, fs) { const t = getTable(year).addlMed; return t[fs] || 200000 }
function getMarginalRate(taxable, year, fs) {
  let rate = 0.10, prev = 0
  for (const [cap, r] of getBrackets(year, fs)) {
    if (taxable > prev) rate = r
    prev = cap
  }
  return rate
}
// §1(a)-(e) IRC — ordinary income tax (progressive brackets).
// Bracket tables live in TAX_TABLES[year].brackets; update there, not here.
function calcFederalTax(ordinaryIncome, year, fs) {
  if (ordinaryIncome <= 0) return 0
  let tax = 0, prev = 0
  for (const [cap, rate] of getBrackets(year, fs)) {
    if (ordinaryIncome <= prev) break
    tax += (Math.min(ordinaryIncome, cap) - prev) * rate
    prev = cap
  }
  return Math.round(tax)
}
// §1(h) IRC — preferential rates: LTCG / qualified dividends / §1250 / collectibles.
// 0% §1(h)(1)(B) · 15% §1(h)(1)(C) · 20% §1(h)(1)(D) · §1250 max 25% §1(h)(6) · collectibles max 28% §1(h)(4).
function calcPreferentialTax(ordinaryIncome, prefItems, year, fs) {
  // AUDIT F-5 FIX (Jul 2026). Prior version stacked the §1250/collectibles slices at
  // the ORDINARY floor and charged incremental ordinary-bracket tax capped at 25%/28%,
  // which (a) let low ordinary brackets (10/12/22%) tax unrecaptured §1250 gain and
  // (b) simultaneously removed the slice from the 15% bucket — understating tax
  // (observed ≈$3,310 per $50,000 on audit facts). The Schedule D Tax Worksheet taxes
  // the 25%-rate gain (§1(h)(1)(E)/(h)(6)) and 28%-rate gain (§1(h)(4)) at flat
  // 25%/28% AFTER the 0/15/20 adjusted-net-capital-gain stack, with a final backstop:
  // total preferential tax may never exceed all-ordinary treatment of the same income
  // (protects low-bracket taxpayers, mirroring the worksheet's "smaller of" lines).
  //
  // SEMANTICS (unchanged, now clamped + documented): unrecap1250 and collectibles are
  // SLICES of the long-term gain already included in `ltcg` — they re-rate a portion
  // of it, they do not add income. The UI label must say so (see TaxReturn.jsx).
  const { ltcg = 0, qualDiv = 0, unrecap1250 = 0, collectibles = 0 } = prefItems
  const [threshold0, threshold15] = getLTCGThresholds(year, fs)
  const ordFloor = Math.max(0, ordinaryIncome)
  const _ltcgPos = Math.max(0, ltcg)
  const _u1250   = Math.min(Math.max(0, unrecap1250), _ltcgPos)
  const _coll    = Math.min(Math.max(0, collectibles), _ltcgPos - _u1250)
  const adjNCG   = (_ltcgPos - _u1250 - _coll) + Math.max(0, qualDiv)  // 0/15/20 bucket
  const totalPrefAll = adjNCG + _u1250 + _coll
  if (totalPrefAll <= 0) return 0
  let tax = 0
  if (adjNCG > 0) {
    const zeroRoom    = Math.max(0, threshold0  - ordFloor)
    const atZero      = Math.min(adjNCG, zeroRoom)
    const fifteenRoom = Math.max(0, threshold15 - Math.max(ordFloor, threshold0))
    const atFifteen   = Math.min(adjNCG - atZero, fifteenRoom)
    const atTwenty    = adjNCG - atZero - atFifteen
    tax += atFifteen * LTCG_RATE_MID
    tax += atTwenty  * LTCG_RATE_HIGH
  }
  tax += _u1250 * UNRECAPTURED_1250_MAX_RATE   // flat 25%, §1(h)(1)(E)
  tax += _coll  * COLLECTIBLES_MAX_RATE        // flat 28%, §1(h)(4)
  // Worksheet backstop: never worse than all-ordinary treatment of the pref stack.
  const allOrdinary = calcFederalTax(ordFloor + totalPrefAll, year, fs) - calcFederalTax(ordFloor, year, fs)
  return Math.round(Math.min(tax, allOrdinary))
}
/** §1411 Net Investment Income Tax. Rate: 3.8% on the lesser of NII or (MAGI − threshold).
 *  Thresholds: $250K MFJ / $125K MFS / $200K single & HOH — statutory, not inflation-adjusted.
 *  No withholding mechanism; flows through Form 8960 and estimated payments. */
function calcNIIT(nii, agi, year, fs) {
  const threshold = getNIITThreshold(year, fs)
  if (agi <= threshold || nii <= 0) return 0
  const excessAGI = agi - threshold
  return Math.round(Math.min(nii, excessAGI) * NIIT_RATE)
}
/** §55 Alternative Minimum Tax (Form 6251). Two-rate: 26% up to bracket26_28, 28% above.
 *  Exemption and phase-out are inflation-adjusted annually — see TAX_TABLES[year].amt.
 *  §199A QBI deduction is NOT added back to AMTI per §199A(f)(2). */
function calcAMT({ taxableIncome, saltAmount, isoBargainElement, ltGain, qualDiv, regularTax, status, taxYear, useItemized, itemized, stdDed }) {
  // NOTE: the §199A QBI deduction is intentionally NOT added back to AMTI — it is allowed
  // for AMT (§199A(f)(2)), so the same amount used for regular tax flows into AMTI unchanged.
  // (Callers may still pass a `qbi` field; it is intentionally not read here. Do not "fix"
  // this by adding qbi back.)
  const amtTable    = AMT_TABLES[taxYear] || AMT_TABLES[2025]
  const baseSaltCap = SALT_CAPS[taxYear] || SALT_CAPS[2025]
  const saltCap     = status === 'mfs' ? baseSaltCap / 2 : baseSaltCap
  const isItemizing  = useItemized && itemized > stdDed
  const saltAddback  = isItemizing ? Math.min(Math.max(0, saltAmount), saltCap) : 0
  const isoAddback   = Math.max(0, isoBargainElement || 0)
  const stdDedAddback = isItemizing ? 0 : Math.max(0, stdDed || 0)
  const amti         = Math.max(0, taxableIncome) + stdDedAddback + saltAddback + isoAddback
  const _phaseoutStart = amtTable.phaseoutStart[status] ?? amtTable.phaseoutStart.single
  const _exemptionAmt  = amtTable.exemption[status]     ?? amtTable.exemption.single
  const phaseoutOver = Math.max(0, amti - _phaseoutStart)
  const exemption    = Math.max(0, _exemptionAmt - phaseoutOver * amtTable.phaseoutRate)
  const amtTaxable   = Math.max(0, amti - exemption)
  if (amtTaxable === 0) return 0
  const preferential = Math.max(0, ltGain) + Math.max(0, qualDiv)
  const ordinaryAMTI = Math.max(0, amtTaxable - preferential)
  const threshold   = amtTable.bracket26_28[status] ?? amtTable.bracket26_28.single
  const ordinaryAMT = ordinaryAMTI <= threshold
    ? ordinaryAMTI * AMT_RATE_LOW
    : threshold * AMT_RATE_LOW + (ordinaryAMTI - threshold) * AMT_RATE_HIGH
  const preferentialAMT = calcPreferentialTax(
    ordinaryAMTI,
    { ltcg: Math.max(0, ltGain), qualDiv: Math.max(0, qualDiv) },
    taxYear, status
  )
  const tentativeMinimumTax = Math.round(ordinaryAMT + preferentialAMT)
  return Math.max(0, tentativeMinimumTax - Math.max(0, regularTax))
}
// QBI_THRESHOLDS, QBI_PHASE_IN_RANGE, QBI_MIN_DEDUCTION, QBI_MIN_THRESHOLD are derived
// from TAX_TABLES above (each year's .qbi sub-object). Do not redefine them here.
function _applyMinQBI(result, activeQbiForFloor, taxYear, taxableBeforeQBI = Infinity) {
  const floor     = QBI_MIN_DEDUCTION[taxYear]
  const threshold = QBI_MIN_THRESHOLD[taxYear]
  if (floor == null || threshold == null) return result
  if (activeQbiForFloor < threshold) return result
  if (taxableBeforeQBI <= 0) return result
  const effectiveFloor = Math.min(floor, taxableBeforeQBI)
  if (result.deduction >= effectiveFloor) return { ...result, caps: { ...result.caps, min400: floor } }
  return { deduction: effectiveFloor, limitApplied: 'min400', caps: { ...result.caps, min400: floor } }
}
/** §199A Qualified Business Income deduction. 20% of QBI, subject to W-2/UBIA wage limits
 *  above the taxable-income threshold, an overall taxable-income cap, and SSTB phase-out.
 *  §199A(i) OBBBA minimum deduction ($400 floor) applies for tax years beginning after 12/31/2025.
 *  Treas. Reg. §1.199A-1 through §1.199A-6. Single call site: import via aiAnalysisTaxMath.js. */
function calcQBI(qbiIncome, taxableBeforeQBI, capitalGains, opts = {}) {
  const result = _calcQBI(qbiIncome, taxableBeforeQBI, capitalGains, opts)
  const netCapGain = Math.max(0, capitalGains || 0)
  const ceiling    = Math.max(0, taxableBeforeQBI - netCapGain) * QBI_DEDUCTION_RATE
  if (result.deduction > ceiling) {
    return { ...result, deduction: Math.round(ceiling), limitApplied: 'income' }
  }
  return result
}
function _calcQBI(qbiIncome, taxableBeforeQBI, capitalGains, opts = {}) {
  const {
    status = 'single',
    taxYear = 2025,
    entityQbiData = [],
    activeQbi,
    hasMultiEntityTypes = false,
    strictWageCap = false,
  } = opts
  const thresholds = QBI_THRESHOLDS[taxYear] || QBI_THRESHOLDS[2025]
  const threshold  = thresholds[status] || thresholds.single
  const aggregationApplied = hasMultiEntityTypes && taxableBeforeQBI > threshold
  const aggregationDisclosure = aggregationApplied
    ? 'Your QBI deduction assumes you have elected to aggregate your business entities ' +
      'under Reg. §1.199A-4 (combined W-2 wages applied across all entities). ' +
      'This election must be formally made on Form 8995-A, Schedule B and applied ' +
      'consistently each year. Without aggregation, your deduction may be lower. ' +
      'Consult your CPA before relying on this figure.'
    : null
  const withMeta = (result) => ({ ...result, aggregationApplied, aggregationDisclosure })
  if (qbiIncome <= 0 || taxableBeforeQBI <= 0) {
    return _applyMinQBI(
      withMeta({ deduction: 0, limitApplied: 'none', caps: { qbi: 0, wage: null, income: 0 } }),
      activeQbi !== undefined ? activeQbi : qbiIncome,
      taxYear,
      taxableBeforeQBI
    )
  }
  const netCapGain       = Math.max(0, capitalGains)
  const incomeLimitation = Math.max(0, taxableBeforeQBI - netCapGain) * QBI_DEDUCTION_RATE
  const qbiComponent     = qbiIncome * QBI_DEDUCTION_RATE
  if (taxableBeforeQBI <= threshold) {
    const ded          = Math.min(qbiComponent, incomeLimitation)
    const limitApplied = qbiComponent <= incomeLimitation ? 'qbi' : 'income'
    return _applyMinQBI(
      withMeta({
        deduction: Math.round(ded) || 0,
        limitApplied,
        caps: { qbi: Math.round(qbiComponent), wage: null, income: Math.round(incomeLimitation) },
      }),
      activeQbi !== undefined ? activeQbi : qbiIncome,
      taxYear,
      taxableBeforeQBI
    )
  }
  const phaseInForYear      = QBI_PHASE_IN_RANGE[taxYear] || QBI_PHASE_IN_RANGE[2025]
  const phaseInRange        = phaseInForYear[status] || phaseInForYear.single
  const excessOverThreshold = taxableBeforeQBI - threshold
  const phasePercent        = Math.min(1, excessOverThreshold / phaseInRange)
  const sstbApplicablePct   = Math.max(0, 1 - phasePercent)
  const sstbEntityQBI = entityQbiData.reduce((s, e) => {
    if (!e.box17V_sstb) return s
    const k1Income = nf(e.k1) || Math.round(nf(e.pnl?.netProfit ?? e.netProfit) * (ownPct(e.own) / 100))
    return s + Math.max(0, k1Income)
  }, 0)
  const adjQBI             = Math.max(0, qbiIncome - sstbEntityQBI * (1 - sstbApplicablePct))
  const scaledQbiComponent = adjQBI * QBI_DEDUCTION_RATE
  const activeQbiForFloor  = activeQbi !== undefined ? activeQbi : adjQBI
  const totalWages = entityQbiData.reduce((s, e) => {
    const w = parseFloat(e.box17V_wages) || parseFloat(e.officerW2) || parseFloat(e.pnl?.officerSalary) || 0
    return s + (e.box17V_sstb ? w * sstbApplicablePct : w)
  }, 0)
  const totalUBIA = entityQbiData.reduce((s, e) => {
    const u = parseFloat(e.box17V_ubia) || 0
    return s + (e.box17V_sstb ? u * sstbApplicablePct : u)
  }, 0)
  if (totalWages === 0 && totalUBIA === 0) {
    // M-2 FIX (comparison-only, opt-in): with no W-2 wages and no UBIA, the real
    // §199A(b)(2) wage/UBIA limit above the threshold is $0. The default below instead
    // grants the full 20% when no wage data was supplied (a convenience for incomplete
    // input). strictWageCap opts out of that convenience and applies the actual $0 cap.
    // Only the entity-structure comparison sets this flag; filed-return callers never do,
    // so their results are unchanged. (For 2026 the statutory $400 minimum still applies
    // via _applyMinQBI, which is correct.)
    if (strictWageCap) {
      return _applyMinQBI(
        withMeta({
          deduction: 0,
          limitApplied: 'wage',
          caps: { qbi: Math.round(scaledQbiComponent), wage: 0, income: Math.round(incomeLimitation) },
        }),
        activeQbiForFloor,
        taxYear,
        taxableBeforeQBI
      )
    }
    const ded          = Math.min(scaledQbiComponent, incomeLimitation)
    const limitApplied = scaledQbiComponent <= incomeLimitation ? 'qbi' : 'income'
    return _applyMinQBI(
      withMeta({
        deduction: Math.round(ded) || 0,
        limitApplied,
        caps: { qbi: Math.round(scaledQbiComponent), wage: null, income: Math.round(incomeLimitation) },
      }),
      activeQbiForFloor,
      taxYear,
      taxableBeforeQBI
    )
  }
  const wageLimit = Math.max(
    totalWages * W2_WAGE_LIMIT_RATE,
    totalWages * W2_WAGE_ALT_RATE + totalUBIA * UBIA_RATE
  )
  let limitedAmount, wageBindingActive
  if (excessOverThreshold >= phaseInRange) {
    limitedAmount     = Math.min(scaledQbiComponent, wageLimit)
    wageBindingActive = wageLimit < scaledQbiComponent
  } else {
    const reduction   = Math.max(0, scaledQbiComponent - wageLimit) * phasePercent
    limitedAmount     = scaledQbiComponent - reduction
    wageBindingActive = reduction > 0
  }
  const ded = Math.min(limitedAmount, incomeLimitation)
  let limitApplied
  if      (incomeLimitation < limitedAmount) limitApplied = 'income'
  else if (wageBindingActive)                limitApplied = 'wage'
  else                                       limitApplied = 'qbi'
  return _applyMinQBI(
    withMeta({
      deduction: Math.round(ded) || 0,
      limitApplied,
      caps: { qbi: Math.round(scaledQbiComponent), wage: Math.round(wageLimit), income: Math.round(incomeLimitation) },
    }),
    activeQbiForFloor,
    taxYear,
    taxableBeforeQBI
  )
}
// AUDIT A4-2 FIX (Jul 2026): YTD mode promises “enter YTD figures and we’ll project
// your full-year liability” — deduction FLOWS must annualize like income flows.
// Previously itemized/SALT/medical/charitable stayed at their YTD amounts, so
// projected deductions were understated (and the SALT cap / 0.5% floor / §170(p)
// tests ran against half-sized numbers). DELIBERATELY NOT SCALED (documented
// decisions): estPaid/estQ1-4 (actual payments to date, §6654 compares them to the
// annualized liability); isoBargainElement (a discrete exercise event, not a ratable
// flow); prior-year figures and all carryforwards/balances.
const _YTD_SCALE_FIELDS = [
  'w2', 'k1Total', 'rentalNet',
  'stGain', 'ltGain', 'intInc', 'divInc', 'qualDiv',
  'f4797Inc', 'taxableSS', 'iraIncome',
  'selfEmpHealthIns', 'hsaDeduction', 'studentLoanInt', 'selfEmpRetirement',
  'itemizedAmt', 'saltAmount', 'medicalExpenses', 'charitableContr',   // A4-2
]
// AUDIT A4-1 FIX (Jul 2026): `distributions` is a FLOW — YTD distributions must
// annualize or the projected §1368 excess-distribution gain evaporates (audit-4
// probe: half-year inputs produced gain $0 instead of $25,000). Balance-sheet
// fields (stockBasis, debtBasis, beginningAAA, accumulatedEP, box17V_ubia,
// qbiLossCarryforward) remain correctly UNscaled — they are point-in-time amounts.
const _YTD_SCALE_ENTITY_FIELDS = ['k1', 'netProfit', 'box11_12', 'box12_13', 'box17V_wages', 'officerW2', 'distributions']
function _scaleNumeric(v, yf) {
  if (v === undefined || v === null || v === '') return v
  const n = parseFloat(v)
  return Number.isFinite(n) ? n * yf : v
}
function _annualizeIfYTD(input) {
  const yf = (input && typeof input.ytdFactor === 'number' && Number.isFinite(input.ytdFactor) && input.ytdFactor > 0)
    ? input.ytdFactor
    : 1
  if (yf === 1) return input
  const out = { ...input }
  for (const k of _YTD_SCALE_FIELDS) {
    out[k] = _scaleNumeric(out[k], yf)
  }
  if (Array.isArray(out.entities)) {
    out.entities = out.entities.map(e => {
      if (!e) return e
      const ne = { ...e }
      for (const k of _YTD_SCALE_ENTITY_FIELDS) {
        if (k in ne) ne[k] = _scaleNumeric(ne[k], yf)
      }
      if (ne.pnl && typeof ne.pnl === 'object') {
        const np = { ...ne.pnl }
        np.netProfit    = _scaleNumeric(np.netProfit, yf)
        np.officerSalary = _scaleNumeric(np.officerSalary, yf)
        ne.pnl = np
      }
      return ne
    })
  }
  out.ytdFactor = 1
  return out
}
/**
 * S-Corp SE/FICA savings versus operating the same business as a sole proprietorship.
 *
 * Single source of truth for this arithmetic: calcTaxReturn uses it to produce the
 * `ficaSavings` field shown on the filed-return panel, and the AI strategy finder
 * (aiAnalysisTaxMath.scorpSeTaxSavingsEstimate) re-exports it so its estimate is, by
 * construction, identical to the filed-return figure.
 *
 * A sole proprietor owes SE tax on the business's net earnings; an S-Corp shareholder
 * owes FICA only on their W-2 wages, so the K-1 ordinary income (already net of officer
 * salary) escapes. The savings is that escaped income taxed at SE/FICA, with the IRC
 * §1402(a)(12) 92.35% net-earnings factor applied and the 12.4% Social Security portion
 * limited to the wage-base room remaining after the taxpayer's FICA-subject wages
 * (Medicare's 2.9% is uncapped).
 *
 * @param {object} p
 * @param {number} p.k1Income           K-1 ordinary income (already net of officer salary)
 * @param {number} [p.ficaSubjectWages] Total FICA-subject W-2 wages (personal + officer salary)
 * @param {number} [p.ssWageBase]       Social Security wage base for the year
 * @returns {number} estimated SE/FICA tax saved (rounded)
 */
function scorpSeTaxSavings({ k1Income, ficaSubjectWages = 0, ssWageBase = 0 } = {}) {
  const k1 = Math.max(0, Number(k1Income) || 0)
  if (k1 === 0) return 0
  const seEarnings   = k1 * SE_NET_EARNINGS_FACTOR
  const wageBaseRoom = Math.max(0, (Number(ssWageBase) || 0) - Math.max(0, Number(ficaSubjectWages) || 0))
  const ssTaxable    = Math.min(seEarnings, wageBaseRoom)
  return Math.round(
    ssTaxable  * (FICA_SS_RATE      * 2) +
    seEarnings * (FICA_MEDICARE_RATE * 2)
  )
}
// ── ENG-1 DOC: calcTaxReturn k1Total / entity.k1 dual-requirement ───────────────
// calcTaxReturn derives K-1 income from TWO sources that MUST both be set:
//
//   1. entities[] array — each entity's `e.k1` field (or computed from e.pnl)
//      drives: §1366(d) basis limits, §469 rental routing, QBI entityQbiData,
//              SE tax identification, C-Corp exclusion.
//
//   2. k1Total (top-level number) — drives: AGI calculation, QBI basis (via
//      k1FallbackForQBI when entities.length === 0), §461(l) EBL threshold,
//      scheduleEK1Income allocation.
//
// CRITICAL: Setting entity.k1 alone does NOT update AGI. Setting k1Total alone
// does NOT trigger basis limits or REP gating. BOTH must be set for a complete
// calculation. TaxReturn.jsx passes both via entitiesForCalc + sessionK1.
// External callers (tests, scenarioCompare) must also set both.
// ─────────────────────────────────────────────────────────────────────────────────
function calcTaxReturn(input) {
  input = _annualizeIfYTD(input)
  const {
    // AUDIT HARDENING (found during F-4 verification): `status` previously had no
    // default. Every consumer except calcAMT falls back to 'single' internally, so an
    // omitted/nonstandard filing-status key silently produced amt = NaN → totalTax =
    // NaN. Default here + calcAMT-level fallbacks below make the engine total-safe.
    taxYear, status = 'single', dependents,
    entities: _rawEntities = [],
    w2 = 0, k1Total = 0, rentalNet = 0,
    stGain = 0, ltGain = 0, intInc = 0, divInc = 0, qualDiv = 0,
    f4797Inc = 0, taxableSS = 0, iraIncome = 0,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward, priorYearQBILoss,
    useItemized, itemizedAmt, saltAmount, medicalExpenses,
    charitableContr,                       // N-9: charitable component of itemizedAmt
    estQ1, estQ2, estQ3, estQ4,            // 2210-lite: per-installment payments (optional)
    hasISO, isoBargainElement,
    isREP,
    isActiveParticipant = true,
    // F6 (§469 per-property material participation + §1.469-9(g) aggregation):
    // Both are TRI-STATE / opt-in. `rentalAggregationElection` defaults false but the
    // per-property regime only engages when the caller affirmatively supplies the
    // election, a Step-2 material-participation answer, or a per-entity
    // materiallyParticipates flag (see perPropertyRegimeActive below). Legacy callers
    // that supply none of these keep the prior "REP ⇒ all nonpassive" behavior.
    rentalAggregationElection = false,
    // C-12 (Finding 2 — §469(c)(7)(B) quantitative gate): the aggregation election only
    // makes the rental portfolio nonpassive when the two-part hours test is actually met
    // (> 750 real-property hours AND those hours > 50% of total personal-service hours).
    // When BOTH hour figures are supplied and the test FAILS, the election is treated as
    // NOT operative — the loss stays passive/suspended — unless the caller affirmatively
    // sets repAggregationOverride to acknowledge an at-risk position. If the hours are not
    // supplied at all, behavior is unchanged (the election controls), so legacy callers and
    // existing tests are unaffected. IRC §469(c)(7)(B); Treas. Reg. §1.469-9.
    repHoursRE,
    repHoursTotal,
    repAggregationOverride = false,
    step2RentalMaterialParticipation,
    unrecap1250, collectiblesGain,
    // §461(l): net business §1231/capital gain entered for the EBL business-gain offset.
    // Decoupled from f4797Inc so a §1231 gain can be entered for RATE purposes via
    // ltGain + unrecap1250 (preserving the 25% §1250 slice) while still telling the EBL
    // calc how much of the capital gain is business gain. Default 0 → no effect; existing
    // callers (f4797Inc-only) are unchanged. Whether to enter the NET §1231 (gain netted
    // with same-year §1231 losses) or only a gross business gain is a facts determination
    // the caller makes — the engine represents the position rather than choosing it.
    bizCapGain1231 = 0,
    // F5 (§1231(c) 5-year lookback): nonrecaptured net §1231 losses from the prior
    // five years. A net §1231 GAIN this year is recharacterized as ORDINARY income to
    // the extent of these prior losses (§1231(c)(1)); only the excess keeps long-term
    // capital-gain treatment. Default 0 → no recharacterization, so existing callers
    // are unaffected. The caller supplies the prior-5-year figure (Form 4797 line 8 /
    // the taxpayer's own §1231 loss history); the engine applies the recharacterization.
    nonrecapturedNet1231Loss = 0,
    w2Withheld, estPaid,
    ytdFactor = 1,
    priorYearTax,
    priorYearAGI,
    priorPassiveLossCarryforward = 0,
    priorSuspendedLoss = 0,
    // M-2 FIX: comparison-only opt-in flag, forwarded to calcQBI. Defaults false, so
    // every filed-return caller is unaffected.
    strictWageCap = false,
    // C-10 FIX (§1366(d)/§704(d) conservative default): opt-in flag. When true, a
    // limitable entity (S-Corp / partnership) that shows a LOSS but has NO stock/debt
    // basis entered is treated as having $0 basis — the full loss is suspended and
    // carried forward (§1366(d)(2)) instead of deducting against other income. Defaults
    // false so existing engine unit tests (which model losses without basis as fully
    // allowed) are unaffected; the live app (TaxReturn, CalculateTaxInner) passes true.
    assumeZeroBasisOnLoss = false,
  } = input
  const entities = _rawEntities.map(e => (e ? { ...e, type: normalizeEntityType(e.type) } : e))
  const ytdScale = (val) => Math.round(nf(val) * ytdFactor)
  const priorQBILossCO = Math.abs(nf(priorYearQBILoss))
  const perEntityQBILossCO = entities.reduce((sum, e) => {
    if (!e) return sum
    return sum + Math.abs(nf(e.qbiLossCarryforward))
  }, 0)
  const effectiveQBILossCO = perEntityQBILossCO > 0 ? perEntityQBILossCO : priorQBILossCO
  const entityBasisResults = []
  const entitiesLimited = entities.map(e => {
    if (!e) return e
    const own = ownPct(e.own) / 100
    const k1Gross = e.k1 !== undefined
      ? parseFloat(e.k1) || 0
      : Math.round((parseFloat(e.pnl?.netProfit) || 0) * own)
    const isLimitable = /s.?corp|partner/i.test(e.type || '')
    const isSCorpE    = /s.?corp/i.test(e.type || '')

    // ── Form 7203 basis-INCREASE items, applied FIRST (§1367(a)(1)) ──────────────
    // C-11 FIX (Finding 3): the basis section now accepts current-year capital
    // contributions (Form 7203, Line 2) and current-year income / tax-exempt items
    // that restore basis (Lines 3a–3m), not just the beginning stock basis (Line 1).
    // A return funded by current-year contributions (the audit case) previously had
    // none of that basis recognized. Both default to 0 and are optional.
    const contrib     = Math.max(0, parseFloat(e.capitalContributions) || 0)
    const basisIncome = Math.max(0, parseFloat(e.basisIncomeItems)      || 0)

    const stockEntered = (
      (e.stockBasis !== undefined && e.stockBasis !== null &&
       e.stockBasis !== '' && e.stockBasis !== 0) ||
      String(e.stockBasis) === '0'
    )
    // Entering contributions or basis-increase income alone is also a basis entry: a
    // shareholder who funds the year with current-year contributions and leaves the
    // beginning-basis box blank should still have that basis recognized (Finding 3).
    const hasBasisInput = stockEntered || contrib > 0 || basisIncome > 0

    const sb   = Math.max(0, parseFloat(e.stockBasis) || 0)
    const db   = Math.max(0, parseFloat(e.debtBasis)  || 0)
    const dist = isSCorpE ? Math.max(0, parseFloat(e.distributions) || 0) : 0

    // §1367(a)(1): income RAISES stock basis. A current-year LOSS is a §1366 item
    // applied LAST and never reduces the basis available to absorb distributions.
    const stockBasisForDist = sb + contrib + basisIncome + Math.max(0, k1Gross)

    // AUDIT F-9 FULL FIX (Jul 2026): §1368(c) three-tier ordering when the S-corp has
    // accumulated E&P from C-corporation years. Tier 1: distributions come first from
    // AAA and receive §1368(b) treatment (basis recovery, then capital gain). Tier 2:
    // the next dollars are DIVIDENDS to the extent of accumulated E&P (§1368(c)(2)) —
    // they never reduce stock basis. Tier 3: any remainder returns to §1368(b)
    // treatment. AAA adjustment ordering per Reg. §1.1368-2(a)(5): increased by
    // current-year income BEFORE distributions; current-year LOSSES come after.
    // With no E&P entered (the default), behavior is identical to before.
    const ep     = isSCorpE ? Math.max(0, parseFloat(e.accumulatedEP) || 0) : 0
    const begAAA = isSCorpE ? Math.max(0, parseFloat(e.beginningAAA)  || 0) : 0
    let distFromAAA = dist, epDividend = 0, distTier3 = 0
    if (ep > 0 && dist > 0) {
      const aaaForDist = begAAA + Math.max(0, k1Gross)
      distFromAAA = Math.min(dist, aaaForDist)
      epDividend  = Math.min(dist - distFromAAA, ep)
      distTier3   = dist - distFromAAA - epDividend
    }
    const distForBasis = ep > 0 ? (distFromAAA + distTier3) : dist

    // ── §1368 BEFORE §1366 (Finding 1 — basis waterfall ordering) ────────────────
    // Distributions reduce stock basis (Reg. §1.1368-1(e)) BEFORE losses. Only the true
    // excess over the pre-loss basis is §1368(b)(2) long-term capital gain; the loss is
    // then limited to whatever stock basis remains, plus debt basis.
    const distExcessGain = (isSCorpE && hasBasisInput) ? Math.max(0, distForBasis - stockBasisForDist) : 0  // F-9: dividends excluded
    const stockAfterDist = Math.max(0, stockBasisForDist - distForBasis)  // F-9: dividends never reduce basis

    // C-10 FIX: when assumeZeroBasisOnLoss is set, a limitable entity with a LOSS is
    // run through the §1366(d) limit even with no basis figure entered — basis is
    // conservatively assumed to be $0 and the full loss is suspended until the
    // shareholder enters their Form 7203 basis. Without the flag (engine default), a
    // loss with no basis input still passes through in full, preserving prior behavior.
    const applyLimit = isLimitable && k1Gross < 0 && (hasBasisInput || assumeZeroBasisOnLoss)
    if (!applyLimit) {
      // Income entity (or a loss with no basis figure and no conservative flag): no
      // §1366(d) limitation. Still surface basis for the §1368 distribution computation
      // when the shareholder has entered any basis figure.
      entityBasisResults.push({
        name: e.name || e.id || 'Entity', type: e.type,
        k1Gross, k1Allowed: k1Gross, suspended: 0,
        epDividend, distFromAAA, accumulatedEP: ep,   // F-9: §1368(c) tiers
        ...(hasBasisInput ? {
          stockBasis: sb, debtBasis: db, totalBasis: stockAfterDist + db,
          capitalContributions: contrib, basisIncomeItems: basisIncome,
          stockBasisForDist, stockBasisAfterDist: stockAfterDist,
          distributions: dist, distExcessGain,
          basisAssumedZero: false,
        } : {}),
      })
      return e
    }
    // basisAssumedZero distinguishes "you have insufficient entered basis" from
    // "you entered no basis at all and we conservatively assumed $0" so the UI can
    // tailor the message (enter Form 7203 basis to release the loss).
    const basisAssumedZero = !hasBasisInput
    const grossLoss        = Math.abs(k1Gross)
    // §1366(d): the loss is limited to the stock basis remaining AFTER distributions
    // (§1368 already took its share above), plus debt basis.
    const basisForLoss     = stockAfterDist + db
    const allowedLoss      = Math.min(grossLoss, basisForLoss)
    const suspended        = grossLoss - allowedLoss
    const k1Allowed        = allowedLoss > 0 ? -allowedLoss : 0
    entityBasisResults.push({
      name: e.name || e.id || 'Entity', type: e.type,
      k1Gross, k1Allowed, suspended,
      epDividend, distFromAAA, accumulatedEP: ep,     // F-9: §1368(c) tiers
      stockBasis: sb, debtBasis: db, totalBasis: basisForLoss,
      capitalContributions: contrib, basisIncomeItems: basisIncome,
      stockBasisForDist, stockBasisAfterDist: stockAfterDist,
      distributions: dist, distExcessGain,
      basisAssumedZero,
    })
    return suspended > 0 ? { ...e, k1: k1Allowed } : e
  })
  const totalSuspendedLoss = entityBasisResults.reduce((s, r) => s + (r.suspended || 0), 0)
  // F-9: §1368(c)(2) dividends from accumulated E&P are dividend income on the 1040 —
  // qualified (§1(h)(11): domestic corporation; holding period assumed met) and NII
  // (§1411(c)(1)(A)(i) — dividends are investment income regardless of participation).
  const sCorpEPDividends = entityBasisResults.reduce((s, r) => s + (r.epDividend || 0), 0)
  const _divIncEff  = nf(divInc)  + sCorpEPDividends
  const _qualDivEff = nf(qualDiv) + sCorpEPDividends
  let priorSuspendedLossApplied = 0
  const _priorSuspended = Math.max(0, nf(priorSuspendedLoss))
  if (_priorSuspended > 0) {
    for (const br of entityBasisResults) {
      if (br.stockBasis === undefined) continue
      if (!/s.?corp|partner/i.test(br.type || '')) continue
      const basisAfterAlloc = br.suspended > 0
        ? Math.max(0, (br.totalBasis || br.stockBasis) - Math.abs(br.k1Allowed))
        : Math.max(0, br.stockBasis + Math.max(0, br.k1Allowed))
      const releasable = Math.min(_priorSuspended, basisAfterAlloc)
      priorSuspendedLossApplied += releasable
      break
    }
  }
  const priorSuspendedLossRemaining = Math.max(0, _priorSuspended - priorSuspendedLossApplied)
  const entityRentalResults = []
  let step1RentalNet    = 0
  let step1RentalREP    = false
  let step1RentalActive = false
  entities.forEach(e => {
    if (!e || !isRealEstateEntity(e.type)) return
    const own = ownPct(e.own) / 100
    const k1Gross = e.k1 !== undefined
      ? parseFloat(e.k1) || 0
      : Math.round((parseFloat(e.pnl?.netProfit ?? e.netProfit) || 0) * own)
    // AUDIT F-13 FIX: K-1 charitable (box12_13) is a Schedule A itemized deduction —
    // it never reduces ordinary pass-through income. Only §179 (box11_12) nets here.
    const net = k1Gross - nf(e.box11_12)
    step1RentalNet += net
    if (e.isREP) step1RentalREP = true
    if (e.isActiveParticipant) step1RentalActive = true
    entityRentalResults.push({
      name: e.name || e.id || 'Rental Property',
      type: e.type,
      net: Math.round(net),
      isREP: !!e.isREP,
      isActiveParticipant: !!e.isActiveParticipant,
    })
  })
  const adjustedK1Total = k1Total + totalSuspendedLoss - priorSuspendedLossApplied - step1RentalNet
  let distributionCapGain = 0
  const entityDistributionResults = []
  entities.forEach((e, idx) => {
    if (!e || !/s.?corp/i.test(e.type || '')) {
      entityDistributionResults.push(null)
      return
    }
    const dist = Math.max(0, parseFloat(e.distributions) || 0)
    if (dist === 0) {
      entityDistributionResults.push({
        name: e.name || e.id || 'Entity',
        distributions: 0,
        excessCapGain: 0,
      })
      return
    }
    const basisResult   = entityBasisResults[idx]
    // C-10 FIX: a basis we only *assumed* to be $0 (no figure entered) must not silently
    // convert distributions into capital gain. Keep the prior "basis not entered" note for
    // the distribution path; only an actually-entered basis drives §1368(b)(2) capital gain.
    const hasBasisEntry = basisResult && basisResult.stockBasis !== undefined && !basisResult.basisAssumedZero
    if (!hasBasisEntry) {
      entityDistributionResults.push({
        name: e.name || e.id || 'Entity',
        distributions: dist,
        excessCapGain: null,
        note: 'Stock basis not entered — cannot determine if distributions are taxable. ' +
              'Distributions in excess of your stock basis are long-term capital gain ' +
              '(IRC §1368(b)(2)). Enter your stock basis to compute this automatically.',
      })
      return
    }
    // §1368 ordering (Finding 1): the §1368(b)(2) capital gain is the distribution in
    // excess of the PRE-LOSS stock basis (beginning basis + current-year contributions
    // and income, §1367(a)(1)) — computed in the basis map above BEFORE the §1366 loss
    // reduced basis. Reading it back here keeps distributions ahead of losses in the
    // waterfall instead of measuring the excess against a loss-depleted basis.
    const basisBeforeDist = basisResult.stockBasisForDist
    const excess          = basisResult.distExcessGain
    const taxFreeReturn   = dist - excess
    distributionCapGain += excess
    entityDistributionResults.push({
      name:            e.name || e.id || 'Entity',
      distributions:   dist,
      basisBeforeDist: Math.round(basisBeforeDist),
      taxFreeReturn:   Math.round(taxFreeReturn),
      excessCapGain:   Math.round(excess),
    })
  })
  // AUDIT F-10 FIX: §1368(b)(2) gain takes the STOCK's holding period (§1222) — it is
  // not automatically long-term. Entities flagged stockHeldShortTerm (held ≤ 1 year,
  // common after a new S-election) route their excess-distribution gain to the
  // short-term (ordinary-rate) bucket. Default remains long-term.
  let distributionCapGainST = 0
  entities.forEach((e, idx) => {
    if (!e || !e.stockHeldShortTerm) return
    const r = entityDistributionResults[idx]
    if (r && r.excessCapGain > 0) distributionCapGainST += r.excessCapGain
  })
  const distributionCapGainLT = Math.max(0, distributionCapGain - distributionCapGainST)
  const _stGainExtra = distributionCapGainST
  const _ltGain = nf(ltGain) + distributionCapGainLT
  const _stGain = nf(stGain) + _stGainExtra
  const combinedRentalNet          = nf(rentalNet) + step1RentalNet
  const effectiveIsREP             = !!isREP || step1RentalREP
  // §469(i) active-participation applies to whatever rental pool exists. Rentals now
  // come from Step-1 Real Estate entities (the Step-2 lump is retired), so gate on the
  // combined rental net rather than the (legacy) Step-2 lump. A per-entity active flag,
  // if a caller still supplies one, also counts.
  const effectiveIsActiveParticipant =
    (combinedRentalNet !== 0 ? isActiveParticipant : false) || step1RentalActive
  const priorPAL = Math.max(0, nf(priorPassiveLossCarryforward))
  const palCarryforwardApplied   = (combinedRentalNet > 0 && priorPAL > 0) ? Math.min(priorPAL, combinedRentalNet) : 0
  const palCarryforwardRemaining = Math.max(0, priorPAL - palCarryforwardApplied)
  const rentalNetAfterCF         = combinedRentalNet - palCarryforwardApplied
  // ── C-12 (Finding 2): §469(c)(7)(B) quantitative gate on the aggregation election ──
  // The election only makes the portfolio nonpassive if the two-part hours test is met:
  //   (1) more than 750 hours in real-property trades/businesses, AND
  //   (2) those hours exceed 50% of total personal-service hours for the year.
  // When BOTH hour figures are supplied and the test fails, the election is treated as
  // not operative (loss stays passive/suspended) unless repAggregationOverride === true,
  // which records a deliberate, at-risk election. Hours omitted ⇒ unchanged behavior.
  const _repReHrs  = parseFloat(repHoursRE)
  const _repTotHrs = parseFloat(repHoursTotal)
  const repHoursProvided   = Number.isFinite(_repReHrs) && Number.isFinite(_repTotHrs) && _repTotHrs > 0
  const repHoursTestPasses = repHoursProvided ? (_repReHrs > 750 && _repReHrs > _repTotHrs / 2) : null
  const repHoursTestFailed = repHoursProvided && repHoursTestPasses === false
  const repAggregationGatedOut = repHoursTestFailed && repAggregationOverride !== true
  // ── F6: §469 rental treatment — §1.469-9(g) aggregation election ───────────
  // Default for ALL rentals is PASSIVE (§469(a)); a net loss is limited to the
  // §469(i) $25k active-participation allowance and otherwise suspended on Form 8582.
  //
  // A real estate professional (§469(c)(7)) makes the entire rental portfolio
  // NONPASSIVE by AFFIRMATIVELY making the §1.469-9(g) aggregation election — i.e.
  // by aggregating participation (hours) across all properties so the combined
  // activity meets material participation. Absent that election a REP's rentals stay
  // PASSIVE: REP status alone is never enough, and is never assumed (DECISION 2). A
  // returning REP who has not yet made the election therefore sees losses suspended
  // until they do — the safe direction (nonpassive is the position that needs support).
  //
  // perPropertyRegimeActive routes a REP through the election-governed branch so the
  // election actually controls the outcome; without it a REP would fall to the legacy
  // "REP ⇒ all nonpassive" path and the election would be a no-op. The engine still
  // honors an explicit per-entity materiallyParticipates flag or a Step-2 answer if a
  // caller supplies one (forward-compatible), but the UI's single control is the
  // aggregation election. Non-REP callers with no flags keep the prior legacy path.
  const perPropertyRegimeActive =
    effectiveIsREP ||
    rentalAggregationElection === true ||
    step2RentalMaterialParticipation !== undefined ||
    entities.some(e => e && isRealEstateEntity(e.type) && e.materiallyParticipates !== undefined)
  let palAdjustedRental    = rentalNetAfterCF
  let palSuspendedRental   = 0
  let nonpassiveRentalNet  = 0
  let passiveRentalNet     = 0
  let rentalForEBL         = 0
  let rentalForNII         = 0
  let rentalQbiContribution = 0
  if (!perPropertyRegimeActive) {
    // ── LEGACY branch (unchanged) ─────────────────────────────────────────────
    if (!effectiveIsREP && rentalNetAfterCF < 0) {
      const preRentalAGI = w2 + adjustedK1Total + f4797Inc + _stGain + _ltGain + intInc + _divIncEff + iraIncome
        - Math.min(ytdScale(studentLoanInt), 2500)
        - ytdScale(hsaDeduction)
        - ytdScale(selfEmpRetirement)
        - ytdScale(selfEmpHealthIns)
      // M1 (audit F-01): formula centralized in calc469iAllowance() — identical output
      // (MFS and non-active-participant both resolved to $0 under the prior inline form).
      const specialAllowance = calc469iAllowance(preRentalAGI, status, effectiveIsActiveParticipant)
      palAdjustedRental  = Math.max(rentalNetAfterCF, -specialAllowance)
      palSuspendedRental = Math.round(palAdjustedRental - rentalNetAfterCF)
    }
    // Interface vars equivalent to prior inline expressions:
    nonpassiveRentalNet   = effectiveIsREP ? combinedRentalNet : 0
    passiveRentalNet      = effectiveIsREP ? 0 : combinedRentalNet
    rentalForEBL          = effectiveIsREP ? combinedRentalNet : 0
    rentalForNII          = effectiveIsREP ? 0 : Math.max(0, combinedRentalNet)
    rentalQbiContribution = effectiveIsREP ? palAdjustedRental : Math.max(0, palAdjustedRental)
  } else {
    // ── NEW per-property branch ────────────────────────────────────────────────
    // §1.469-9(g): a REP may elect to treat ALL interests in rental real estate as a
    // single activity — making the whole portfolio nonpassive in one step. The election
    // is a deliberate attestation (never a quiet default) and is only operative for a
    // qualifying REP (§469(c)(7)).
    // C-12 (Finding 2): a failed §469(c)(7)(B) hours test (without an explicit override)
    // makes the election inoperative — the portfolio is NOT treated as nonpassive here and
    // falls to the per-property/§469(i) handling below, so the loss is suspended rather
    // than auto-freed against other income.
    const aggregateNonpassive = effectiveIsREP && rentalAggregationElection === true && !repAggregationGatedOut
    if (aggregateNonpassive) {
      nonpassiveRentalNet = combinedRentalNet
      passiveRentalNet    = 0
    } else {
      // No election: each rental is independently classified. A property is nonpassive
      // only when the taxpayer is a REP AND materiallyParticipates === true. Under
      // §469(c)(2) a rental is per se passive regardless of participation unless the
      // taxpayer qualifies as a REP (§469(c)(7)); a non-REP rental therefore stays
      // passive even when materiallyParticipates is true (its only relief is the
      // §469(i) $25k active-participation allowance applied to the passive portion).
      // undefined (unanswered) and false both fall to passive; isREP alone never
      // promotes an unanswered property.
      let np = 0, pv = 0
      entities.forEach(e => {
        if (!e || !isRealEstateEntity(e.type)) return
        const own = ownPct(e.own) / 100
        const k1Gross = e.k1 !== undefined
          ? parseFloat(e.k1) || 0
          : Math.round((parseFloat(e.pnl?.netProfit ?? e.netProfit) || 0) * own)
        const net = k1Gross - nf(e.box11_12)  // F-13: charitable (box12_13) excluded
        if (effectiveIsREP && e.materiallyParticipates === true) np += net
        else pv += net
      })
      const step2Net = nf(rentalNet)
      if (step2Net !== 0) {
        if (effectiveIsREP && step2RentalMaterialParticipation === true) np += step2Net
        else pv += step2Net
      }
      nonpassiveRentalNet = np
      passiveRentalNet    = pv
    }
    // Passive portion runs through the §469(i) $25k active-participation allowance when
    // it is a net loss; nonpassive portion flows in full. (priorPAL carryforward is left
    // as computed against the combined pool — no per-property regime test exercises it.)
    let passiveAllowed = passiveRentalNet
    if (passiveRentalNet < 0) {
      const preRentalAGI = w2 + adjustedK1Total + nonpassiveRentalNet + f4797Inc + _stGain + _ltGain + intInc + _divIncEff + iraIncome
        - Math.min(ytdScale(studentLoanInt), 2500)
        - ytdScale(hsaDeduction)
        - ytdScale(selfEmpRetirement)
        - ytdScale(selfEmpHealthIns)
      // M1 (audit F-01): same centralization as the single-pool branch above.
      const specialAllowance = calc469iAllowance(preRentalAGI, status, effectiveIsActiveParticipant)
      passiveAllowed     = Math.max(passiveRentalNet, -specialAllowance)
      palSuspendedRental = Math.round(passiveAllowed - passiveRentalNet)
    }
    palAdjustedRental     = nonpassiveRentalNet + passiveAllowed
    rentalForEBL          = nonpassiveRentalNet
    rentalForNII          = Math.max(0, passiveAllowed)
    rentalQbiContribution = nonpassiveRentalNet + Math.max(0, passiveAllowed)
  }
  const eblThreshold = (getTable(taxYear).ebl?.[status]) ?? (['mfj','qss'].includes(status) ? 512000 : 256000)  // A4-3: fallback = official 2026
  // Business capital gain for §461(l): f4797Inc (ordinary/§1231 entered as business income)
  // PLUS any §1231 gain entered separately for rate purposes (bizCapGain1231). The latter is
  // NOT added to gross income here — its income effect is already carried by ltGain/unrecap1250
  // — it only informs how much of the capital gain offsets business losses in the EBL netting.
  const extra1231BizGain      = Math.max(0, nf(bizCapGain1231))
  const eblBizCapGain         = Math.max(0, nf(f4797Inc)) + extra1231BizGain
  const eblOverallCapGainNI   = _stGain + _ltGain + nf(f4797Inc)
                              
  const eblAllowedBizCapGain  = Math.max(0, Math.min(eblBizCapGain, eblOverallCapGainNI))
  const eblBizCapGainExcluded = eblBizCapGain - eblAllowedBizCapGain
  const eblBiz       = adjustedK1Total + (nf(f4797Inc) + extra1231BizGain - eblBizCapGainExcluded) + rentalForEBL
  const eblNetLoss   = Math.max(0, -eblBiz)
  const ebl          = Math.max(0, eblNetLoss - eblThreshold)
  const unrec1250    = Math.max(0, nf(unrecap1250))
  const collectibles = Math.max(0, nf(collectiblesGain))
  // ─── KNOWN LIMITATION (SE-179) — see KNOWN_LIMITATIONS.md ─────────────────────
  // seNetIncome uses GROSS net profit and intentionally does NOT subtract the
  // separately-stated §179 (box11_12) for SE-subject pass-throughs (Sole Proprietor
  // / SMLLC, active Partnership/LLC). Two consequences:
  //   1. SE tax (FICA) below is computed on the pre-§179 amount, so it is OVERSTATED
  //      for a filer whose K-1 separately states §179 (most relevant to an active
  //      partner with Box 12 §179).
  //   2. The QBI basis derived from this value (seK1AfterAdjustments → qbiBasis) is
  //      likewise gross — the same asymmetry fixed for non-SE entities in `nonSEk1`
  //      above — though the 20%-of-taxable-income QBI cap masks it in many cases.
  // AGI is NOT affected: it flows from the input k1Total (adjustedK1Total), which
  // persistStep1 already nets §179 into for every entity type.
  //
  // This is deliberately left as-is rather than mirroring the nonSEk1 QBI-179 fix,
  // because netting §179 here changes SE TAX (what the taxpayer owes), and a correct
  // fix must (a) net ONLY box11_12 — never box12_13, since pass-through charitable
  // does not reduce SE earnings; (b) respect the §179(b)(3) business-income
  // limitation; and (c) treat a sole proprietor (§179 already inside Schedule C net
  // profit → box11_12 should be blank) differently from a partnership (§179
  // separately stated). Pending an explicit tax-treatment decision; do not "fix" by
  // copying the nonSEk1 pattern.
  // ─────────────────────────────────────────────────────────────────────────────
  const seNetIncome = entitiesLimited.reduce((sum, e) => {
    if (!e || !SE_SUBJECT_TYPES.includes(e.type)) return sum
    const k1 = nf(e.k1) || Math.round(nf(e.pnl?.netProfit ?? e.netProfit) * (ownPct(e.own) / 100))
    return sum + Math.max(0, k1)
  }, 0)
  const ssWageBase = getTable(taxYear).ssWageBase
  const seEarningsSubject = seNetIncome * SE_NET_EARNINGS_FACTOR
  const ssPortion         = Math.min(seEarningsSubject, ssWageBase) * (FICA_SS_RATE * 2)
  const medicarePortion   = seEarningsSubject * (FICA_MEDICARE_RATE * 2)
  const seTax             = Math.round(ssPortion + medicarePortion)
  const halfSE            = Math.round(seTax * SE_TAX_DEDUCTION_RATE)
  const totalW2ForFICA = Math.max(0, nf(w2))
  const empSS          = Math.min(totalW2ForFICA, ssWageBase) * FICA_SS_RATE
  const empMedicare    = totalW2ForFICA * FICA_MEDICARE_RATE
  const employeeFICA   = Math.round(empSS + empMedicare)
  const nonSEDistributions = entitiesLimited.reduce((sum, e) => {
    if (!e || SE_SUBJECT_TYPES.includes(e.type)) return sum
    if (isRealEstateEntity(e.type)) return sum
    return sum + (nf(e.k1) || Math.round(nf(e.pnl?.netProfit ?? e.netProfit) * (ownPct(e.own) / 100)))
  }, 0)
  const k1Distributions  = Math.max(0, entitiesLimited.length > 0 ? nonSEDistributions : nf(adjustedK1Total))
  const ssWageBaseRoom   = Math.max(0, ssWageBase - totalW2ForFICA)
  // Single source of truth (shared with the AI strategy finder) — see scorpSeTaxSavings.
  const ficaSavings = scorpSeTaxSavings({
    k1Income: k1Distributions,
    ficaSubjectWages: totalW2ForFICA,
    ssWageBase,
  })
  // AUDIT F-7 FIX: §162(l)(5)(A) — the self-employed health insurance deduction is
  // limited to earned income from the trade or business under which the plan is
  // established: S-corp shareholders → their W-2 officer wages from the S-corp
  // (Notice 2008-1); Schedule C / SE pass-throughs → net SE earnings less ½ SE tax
  // and SE retirement contributions (Pub. 535 worksheet). Previously uncapped
  // (audit observed a $70,000 deduction allowed against $60,000 of wages).
  // NOTE: the §469(i) MAGI pre-estimates above still subtract the raw entry; the
  // cap cannot be computed before seTax exists. Direction of that residual is
  // conservative (lower allowance) and only bites when the entry exceeds the cap.
  const sehiEntered          = ytdScale(selfEmpHealthIns)
  const _scorpOfficerW2ForSEHI = entities.reduce((s, e) => {
    if (!e || !isSCorpEntity(e.type)) return s
    return s + (parseFloat(e.box17V_wages) || parseFloat(e.officerW2) || parseFloat(e.pnl?.officerSalary) || 0)
  }, 0)
  const _seEarnedForSEHI     = Math.max(0, seNetIncome - halfSE - ytdScale(selfEmpRetirement))
  const sehiLimit            = _scorpOfficerW2ForSEHI + _seEarnedForSEHI
  const selfEmpHealthDed     = Math.min(sehiEntered, sehiLimit)
  const sehiClamped          = sehiEntered > selfEmpHealthDed
  const hsaDed               = ytdScale(hsaDeduction)
  const studentLoanDed       = Math.min(ytdScale(studentLoanInt), 2500)
  const selfEmpRetirementDed = ytdScale(selfEmpRetirement)
  const adjustments = halfSE + selfEmpHealthDed + hsaDed + studentLoanDed + selfEmpRetirementDed
  // AUDIT F-13: surface total K-1 charitable so the UI can direct it to Schedule A.
  // Deliberately NOT auto-added to itemizedAmt (the user may already have included
  // it there); income is simply no longer reduced by it.
  const k1CharitableTotal = entities.reduce((sum, e) => sum + (e ? Math.max(0, nf(e.box12_13)) : 0), 0)
  const stdDed    = getStdDed(taxYear, status)
  const grossIncomeBeforeNOL = w2 + adjustedK1Total + palAdjustedRental + _stGain + _ltGain
    + intInc + _divIncEff + f4797Inc + taxableSS + iraIncome + ebl
  const floorAGI          = grossIncomeBeforeNOL - adjustments
  const rawMedical        = Math.max(0, nf(medicalExpenses))
  const deductibleMedical = rawMedical > 0 ? Math.max(0, rawMedical - 0.075 * Math.max(0, floorAGI)) : 0
  // AUDIT N-1 FIX (Jul 2026): the SALT cap previously existed in the tables but was
  // consumed ONLY by calcAMT's addback — the regular-tax itemized total flowed uncapped
  // (audit observed a $60,000 SALT deduction). Cap here per §164(b)(6)/(b)(7):
  // saltAmount is the SALT component INCLUDED in itemizedAmt (both the sub-field sum
  // and the override-total path pass it), so only the disallowed excess is backed out.
  // MAGI proxy: pre-NOL AGI (grossIncomeBeforeNOL − adjustments). The NOL deduction is
  // part of statutory AGI, but the NOL allowance below depends on the deduction chosen
  // here; using the pre-NOL figure breaks the circularity and errs conservatively
  // (higher MAGI → smaller cap) only for NOL filers inside the phase-down band.
  const saltEntered    = Math.max(0, nf(saltAmount))
  const magiForSalt    = Math.max(0, grossIncomeBeforeNOL - adjustments)
  const saltCapApplied = getSaltCap(taxYear, status, magiForSalt)
  const saltAllowed    = Math.min(saltEntered, saltCapApplied)
  const saltDisallowed = Math.min(saltEntered - saltAllowed, Math.max(0, nf(itemizedAmt)))
  // AUDIT N-9 FIX (Jul 2026): OBBBA 0.5%-of-AGI floor on itemized charitable
  // contributions, tax years beginning after 12/31/2025. Only contributions above
  // 0.5% of the contribution base (≈ AGI; same pre-NOL proxy as the SALT phase-down,
  // documented above) are deductible. Disallowed amounts carry forward up to 5 years
  // (single-year engine: surfaced to the UI, not tracked across years).
  const charEntered        = Math.max(0, nf(charitableContr))
  const charFloor          = taxYear >= 2026 ? Math.round(0.005 * magiForSalt) : 0
  const charFloorDisallowed = Math.min(charEntered, charFloor,
    Math.max(0, nf(itemizedAmt) - saltDisallowed))
  const itemized          = Math.max(0, nf(itemizedAmt) - saltDisallowed - charFloorDisallowed) + deductibleMedical
  const effectivelyItemizing = useItemized && itemized > stdDed
  const deduction         = effectivelyItemizing ? itemized : stdDed
  // AUDIT N-9b (Jul 2026): §170(p) — permanent charitable deduction for NON-itemizers,
  // tax years beginning after 12/31/2025: up to $1,000 ($2,000 MFJ/QSS). Taken in
  // addition to the standard deduction; unavailable when itemizing.
  const nonItemizerCharitable = (taxYear >= 2026 && !effectivelyItemizing)
    ? Math.min(charEntered, (status === 'mfj' || status === 'qss') ? 2000 : 1000)
    : 0
  const taxableBeforeNOL = Math.max(0, grossIncomeBeforeNOL - adjustments - deduction - nonItemizerCharitable)
  const priorNOL         = Math.max(0, nf(nolCarryforward))
  // M1 (audit F-02): §172(a)(2) 80%-of-taxable-income cap — literal replaced by the
  // named constant that previously sat unused in constants.js.
  const nolAllowed       = Math.min(priorNOL, Math.floor(taxableBeforeNOL * NOL_CARRYFORWARD_CAP_RATE))
  const nolSurplus       = priorNOL - nolAllowed
  const grossIncome      = grossIncomeBeforeNOL - nolAllowed
  const agi              = grossIncome - adjustments
  const taxableBeforeQBI = taxableBeforeNOL - nolAllowed
  const _sstbThresholds   = QBI_THRESHOLDS[taxYear] || QBI_THRESHOLDS[2025]
  const _sstbPhaseIn      = QBI_PHASE_IN_RANGE[taxYear] || QBI_PHASE_IN_RANGE[2025]
  const qbiThreshold      = _sstbThresholds[status] || _sstbThresholds.single
  const qbiPhaseRange     = _sstbPhaseIn[status]    || _sstbPhaseIn.single
  const sstbApplicablePct = taxableBeforeQBI <= qbiThreshold
    ? 1
    : Math.max(0, 1 - Math.min(1, (taxableBeforeQBI - qbiThreshold) / qbiPhaseRange))
  const nonSEk1 = entitiesLimited.reduce((sum, e) => {
    if (!e || SE_SUBJECT_TYPES.includes(e?.type)) return sum
    if (isRealEstateEntity(e?.type)) return sum
    // QBI-179 FIX: net the separately-stated §179 (box11_12) and box12/13 out of the
    // QBI basis, mirroring the ordinary K-1 net used everywhere else (the rental net
    // in the §469 blocks above and persistStep1's k1Total = net − box11_12 − box12_13).
    // Previously this used gross netProfit×ownership, so a pass-through that took §179
    // had its §199A deduction computed on the pre-§179 amount — overstating the 20%
    // deduction and disagreeing with AGI (which already nets §179 via k1Total) and with
    // the AI Analysis tab (which reads the §179-netted k1Income). §179 reduces QBI per
    // Treas. Reg. §1.199A-3(b)(1)(ii)(A).
    // F3 (§199A × §1366(d)): honor an explicitly-set k1 — including 0 from a fully
    // basis-suspended loss — instead of the || fallback, which treated k1===0 as
    // "missing" and fell back to gross netProfit, leaking a basis-suspended loss into
    // QBI. A §1366(d)-suspended loss is excluded from QBI until the year it is allowed
    // (Treas. Reg. §1.199A-3(b)(1)(iv)); in the release year enter it as a prior-year
    // QBI loss so it reduces QBI then.
    const k1Gross = e.k1 !== undefined ? nf(e.k1) : Math.round(nf(e.pnl?.netProfit ?? e.netProfit) * (ownPct(e.own) / 100))
    // AUDIT F-13 FIX: charitable contributions do NOT reduce QBI (Form 8995
    // instructions, 2021-present); only the separately-stated §179 nets out
    // (Treas. Reg. §1.199A-3(b)(1)(ii)(A)).
    const k1      = k1Gross - nf(e.box11_12)
    const scale   = e.box17V_sstb ? sstbApplicablePct : 1
    return sum + k1 * scale
  }, 0)
  const seK1AfterAdjustments = Math.max(0, seNetIncome - halfSE - selfEmpHealthDed)
  const k1FallbackForQBI = entitiesLimited.length === 0 ? adjustedK1Total : 0
  // rentalQbiContribution is computed in the §469 rental block above (legacy or
  // per-property branch) — do not redeclare here.
  const qbiBasis = nonSEk1 + seK1AfterAdjustments + rentalQbiContribution - effectiveQBILossCO + k1FallbackForQBI
  const f4797NetGain = Math.max(0, nf(f4797Inc))
  // F5 (§1231(c) lookback): recharacterize the net §1231 gain as ORDINARY up to the
  // prior-5-year nonrecaptured §1231 losses (§1231(c)(1)); only the remainder keeps
  // long-term capital-gain treatment. The recharacterized slice stays in gross/ordinary
  // income (it is already in grossIncomeBeforeNOL via f4797Inc) and is simply withheld
  // from the preferential-rate buckets below. NII is unaffected — §1231(c) changes the
  // RATE, not whether the gain is investment income.
  const _nonrecap1231Loss     = Math.max(0, nf(nonrecapturedNet1231Loss))
  const ordinary1231Recapture = Math.min(f4797NetGain, _nonrecap1231Loss)
  const f4797PrefGain         = Math.max(0, f4797NetGain - ordinary1231Recapture)
  const prefIncome = _ltGain + _qualDivEff + f4797PrefGain  // F-9 hotfix: include §1368(c)(2) E&P dividends
  const hasMultiEntityTypes = entities.length > 1
    && entities.some(e => e && SE_SUBJECT_TYPES.includes(e.type))
    && entities.some(e => e && !SE_SUBJECT_TYPES.includes(e.type))
  const _qbiResult = calcQBI(qbiBasis, taxableBeforeQBI, prefIncome, {
    status, taxYear, entityQbiData: entitiesLimited, hasMultiEntityTypes, strictWageCap,
  })
  const qbi                      = _qbiResult.deduction
  const qbiLimitApplied          = _qbiResult.limitApplied
  const qbiCaps                  = _qbiResult.caps
  const qbiAggregationApplied    = _qbiResult.aggregationApplied
  const qbiAggregationDisclosure = _qbiResult.aggregationDisclosure
  const qbiCarryforward          = qbiBasis < 0 ? Math.abs(qbiBasis) : 0
  // F-9 HOTFIX (post-deploy regression, Jul 2026): totalPrefIncome carves preferential
  // income out of the ordinary base. It was still built from the RAW qualDiv input, so
  // §1368(c)(2) E&P dividends were taxed at ordinary rates AND again at 15% by
  // calcPreferentialTax — double-taxing the dividend. Must use _qualDivEff, matching
  // every other consumer (_qualDivClamped, nii, grossIncome, calcAMT).
  const totalPrefIncome       = Math.max(0, _ltGain) + Math.max(0, _qualDivEff) + f4797PrefGain
  const taxableAfterQBI       = Math.max(0, taxableBeforeQBI - qbi)
  // AUDIT N-8 FIX (Jul 2026): new IRC §68 (OBBBA §70111) — for tax years beginning
  // after 12/31/2025, itemized deductions are reduced by 2/37 of the LESSER of
  // (1) itemized deductions otherwise allowable (after all other floors/caps — the
  // SALT cap and 0.5% charitable floor above already applied), or (2) taxable income
  // increased by those itemized deductions, over the start of the 37% bracket.
  // The limitation explicitly does NOT apply to the §199A computation; and at any
  // income where it can bind (above the 37% threshold), the QBI phase-in is complete,
  // so applying the reduction as a post-QBI taxable-income addback is exact (the only
  // theoretical divergence is the rarely-binding 20%-of-TI overall QBI cap, which the
  // addback would only LOOSEN). AMT: §68 is disregarded for AMTI (historic
  // §56(b)(1)(F) treatment), so calcAMT below receives the pre-limitation figure.
  let itemizedLimitReduction = 0
  if (taxYear >= 2026 && effectivelyItemizing) {
    const _bks = getBrackets(taxYear, status)
    const thresh37 = _bks[_bks.length - 2][0]   // top of the 35% bracket = 37% start
    const _prong2  = Math.max(0, taxableAfterQBI + itemized - thresh37)
    if (_prong2 > 0) itemizedLimitReduction = Math.round((2 / 37) * Math.min(itemized, _prong2))
  }
  const taxableIncome         = taxableAfterQBI + itemizedLimitReduction
  const ordinaryTaxableIncome = Math.max(0, taxableAfterQBI + itemizedLimitReduction - totalPrefIncome)
  let _prefRoom = taxableAfterQBI + itemizedLimitReduction
  const _ltcgClamped         = Math.min(Math.max(0, _ltGain) + f4797PrefGain, _prefRoom); _prefRoom -= _ltcgClamped
  const _qualDivClamped      = Math.min(Math.max(0, _qualDivEff), _prefRoom); _prefRoom -= _qualDivClamped
  const _unrecap1250Clamped  = Math.min(unrec1250,              _ltcgClamped)
  const _collectiblesClamped = Math.min(collectibles,          Math.max(0, _ltcgClamped - _unrecap1250Clamped))
  const ordFedTax = calcFederalTax(ordinaryTaxableIncome, taxYear, status)
  const prefTax   = calcPreferentialTax(ordinaryTaxableIncome, {
    ltcg:         _ltcgClamped,
    qualDiv:      _qualDivClamped,
    unrecap1250:  _unrecap1250Clamped,
    collectibles: _collectiblesClamped,
  }, taxYear, status)
  const fedTax = ordFedTax + prefTax
  const brackets = getBrackets(taxYear, status)
  let marginalRate = 0
  if (ordinaryTaxableIncome > 0) {
    let prev = 0
    for (const [cap, rate] of brackets) { if (ordinaryTaxableIncome > prev) marginalRate = rate; prev = cap }
  } else if (totalPrefIncome > 0) {
    const [t0, t15] = getLTCGThresholds(taxYear, status)
    marginalRate = totalPrefIncome > t15 ? LTCG_RATE_HIGH : totalPrefIncome > t0 ? LTCG_RATE_MID : 0
  }
  const addlMedThreshold   = getAddlMedicareThreshold(taxYear, status)
  // Cents-safe: e.g. 87,500 × 0.9% = 787.50 must round to 788, but binary float makes
  // 87500 * 0.009 = 787.4999999999999, which Math.round would drop to 787. Round at the
  // cent level first to neutralize the representation error, then to whole dollars.
  const additionalMedicare = Math.round(
    Math.round(Math.max(0, w2 + seEarningsSubject - addlMedThreshold) * ADDITIONAL_MEDICARE_TAX_RATE * 100) / 100
  )
  const rentalNII  = rentalForNII
  const nii        = Math.max(0, intInc + _divIncEff + Math.max(0, _ltGain + _stGain + f4797NetGain) + rentalNII)
  const niitAmount = calcNIIT(nii, agi, taxYear, status)
  const numDependents        = parseInt(dependents) || 0
  const ctcPerChild          = getTable(taxYear).ctc?.perChild || 2000
  const ctcPhaseoutThreshold = (status === 'mfj' || status === 'qss') ? CTC_PHASEOUT_THRESHOLD_MFJ : CTC_PHASEOUT_THRESHOLD_OTHER
  const ctcExcess            = Math.max(0, agi - ctcPhaseoutThreshold)
  const ctcReduction         = Math.ceil(ctcExcess / CTC_PHASEOUT_STEP) * CTC_PHASEOUT_REDUCTION_PER_STEP
  const ctcRaw               = Math.max(0, numDependents * ctcPerChild - ctcReduction)
  const childCredit          = Math.min(ctcRaw, Math.max(0, fedTax + additionalMedicare + niitAmount))
  const amt = calcAMT({
    taxableIncome, qbi, saltAmount: saltAllowed,  // AUDIT N-1: addback = SALT actually deducted (post-cap)
    isoBargainElement: hasISO ? nf(isoBargainElement) : 0,
    ltGain: _ltGain + f4797PrefGain, qualDiv: _qualDivEff, regularTax: fedTax, status, taxYear,
    useItemized, itemized, stdDed,
  })
  const totalTax      = Math.max(0, fedTax + seTax + additionalMedicare + niitAmount + amt - childCredit)
  // Ratio of total tax to *earned* income (W-2 + positive pass-through). Named
  // distinctly from the canonical effectiveRate() display util (which divides by AGI)
  // to avoid the name collision flagged in audit D-5.
  const taxToEarnedRatio = grossIncome > 0 ? (totalTax / Math.max(1, w2 + Math.max(0, adjustedK1Total))) : 0
  const withheld      = nf(w2Withheld)
  const estimated     = nf(estPaid)
  const totalPayments = withheld + estimated
  const balance       = totalTax - totalPayments
  const priorYearTaxAmt     = Math.max(0, nf(priorYearTax))
  const priorYearAGIAmt     = Math.max(0, nf(priorYearAGI))
  const agiBoundary         = status === 'mfs' ? 75000 : 150000
  const priorYearMultiplier = priorYearAGIAmt > agiBoundary ? 1.10 : 1.00
  const safeHarborCurrentYear = Math.round(totalTax * 0.90)
  const safeHarborPriorYear   = priorYearTaxAmt > 0
    ? Math.round(priorYearTaxAmt * priorYearMultiplier)
    : null
  const safeHarborMinimum = safeHarborPriorYear !== null
    ? Math.min(safeHarborCurrentYear, safeHarborPriorYear)
    : safeHarborCurrentYear
  const safeHarborBalance   = Math.max(0, safeHarborMinimum - totalPayments)
  // AUDIT (2210-lite, Jul 2026): per-installment required amounts under §6654(d)(1)(A)
  // — each installment is 25% of the required annual payment. Withholding is deemed
  // paid evenly across installments (§6654(g)(1)). If per-quarter estimated payments
  // (estQ1..estQ4) are supplied, actual timing is used; otherwise the single
  // “estimated payments made” total is treated as evenly paid and the schedule is
  // marked approximate. Penalty DOLLARS are deliberately not computed — the §6621
  // underpayment rate floats quarterly; the schedule surfaces per-installment
  // shortfalls for Form 2210. The §6654(d)(2) annualized-income method (seasonal
  // income) remains a documented follow-up — it requires period-by-period income.
  const _reqAnnual = safeHarborMinimum !== null ? safeHarborMinimum : safeHarborCurrentYear
  const _perQProvided = [estQ1, estQ2, estQ3, estQ4].some(q => q !== undefined && q !== null && nf(q) > 0)
  const _estQ = _perQProvided
    ? [nf(estQ1), nf(estQ2), nf(estQ3), nf(estQ4)]
    : [estimated / 4, estimated / 4, estimated / 4, estimated / 4]
  const installmentSchedule = [0, 1, 2, 3].map(i => {
    const requiredCum = Math.round(_reqAnnual * 0.25 * (i + 1))
    const paidCum     = Math.round(withheld * 0.25 * (i + 1) + _estQ.slice(0, i + 1).reduce((a, b) => a + b, 0))
    return {
      quarter: i + 1,
      requiredCumulative: requiredCum,
      paidCumulative: paidCum,
      shortfall: Math.max(0, requiredCum - paidCum),
      approximate: !_perQProvided,
    }
  })
  const safeHarborQuarterly = safeHarborBalance > 0 ? Math.round(safeHarborBalance / 4) : 0
  const quarterlyRecommended = Math.max(
    balance > 0 ? Math.round(balance / 4) : 0,
    safeHarborQuarterly
  )
  const scheduleEK1Income = nonSEk1
  const scheduleCSEIncome = seNetIncome
  const entityIncomeBreakdown = entities.map(e => {
    if (!e) return null
    const isSEType = SE_SUBJECT_TYPES.includes(e.type)
    const isRE     = isRealEstateEntity(e.type)
    const own      = ownPct(e.own) / 100
    const income   = parseFloat(e.k1 ?? 0) || Math.round((parseFloat(e.pnl?.netProfit) || 0) * own)
    return {
      name:         e.name || e.id || 'Unnamed Entity',
      type:         e.type,
      income:       Math.round(income),
      ownership:    ownPct(e.own),
      isSEType,
      scheduleForm: isSEType ? 'Schedule C' : isRE ? 'Schedule E (Rental)' : 'Schedule E, Part II',
      taxForm:      isSEType ? '1040 Sch C'
        : isRE ? 'Schedule E (Rental)'
        : (isSCorpEntity(e.type) || isCCorpEntity(e.type))
        ? 'K-1 (Form 1120-S)'
        : 'K-1 (Form 1065)',
    }
  }).filter(Boolean)
  const reasonableCompAlert = (() => {
    const scorp = entities.find(e => e && isSCorpEntity(e.type))
    if (!scorp) return { triggered: false, ratio: 100, message: '' }
    const sal = Math.max(0, parseFloat(scorp.pnl?.officerSalary ?? scorp.officerW2 ?? 0) || 0)
    // (D-10: the old `if (sal < 0)` early-return here was unreachable — sal is
    // clamped by Math.max(0, …) on the line above. Removed as dead code.)
    const k1Val = Math.max(0,
      parseFloat(scorp.k1 ?? 0) ||
      Math.round((parseFloat(scorp.pnl?.netProfit || 0)) * (ownPct(scorp.own) / 100))
    )
    const core = calcReasonableCompCore(sal, k1Val)
    if (!core.applicable) return { triggered: false, ratio: 100, message: '' }
    return {
      triggered: core.triggered,
      ratio: core.ratioPct,
      message: core.triggered
        ? `This is an informational flag, not a determination. Reasonable compensation is governed by the value of the services the shareholder-employee actually performs (Treas. Reg. §1.162-7), which the IRS evaluates under a facts-and-circumstances test — there is no published safe-harbor percentage. Here, the officer salary ($${Math.round(sal).toLocaleString()}) is ${core.ratioPct}% of total S-Corp compensation. A salary-to-total-compensation band of roughly 35–45% is a rough benchmark some practitioners cite (drawing on case law such as Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012)); it is not a fixed ratio or a legal threshold. Treat a figure below it as a prompt to document how the salary reflects the services rendered, not as evidence the salary is wrong.`
        : '',
    }
  })()
  return {
    calculatedAt: Date.now(),
    grossIncome, agi,
    seNetIncome, seEarningsSubject, seTax, halfSE,
    employeeFICA, totalW2ForFICA,
    ficaSavings, ssWageBase, ssWageBaseRoom, k1Distributions,
    selfEmpHealthDed, hsaDed, studentLoanDed, selfEmpRetirementDed, adjustments,
    // AUDIT FIX result fields (Jul 2026):
    sehiEntered, sehiLimit, sehiClamped,                    // F-7  §162(l)(5)(A) cap
    k1CharitableTotal,                                      // F-13 route to Schedule A
    distributionCapGainST, distributionCapGainLT,           // F-10 §1368 gain character
    niitIncludesSCorpStockGain: distributionCapGain > 0,    // F-15 §1411(c)(4) flag
    stdDed, itemized, deduction, deductibleMedical,
    saltEntered, saltAllowed, saltCapApplied, saltDisallowed,  // AUDIT N-1 §164(b) cap
    sCorpEPDividends,                                          // F-9 §1368(c)(2) dividends
    charEntered, charFloorDisallowed, nonItemizerCharitable,   // N-9 / N-9b
    itemizedLimitReduction,                                    // N-8 new §68 2/37

    unrec1250, collectibles,
    nonSEk1, seK1AfterAdjustments, qbiBasis, taxableBeforeQBI, prefIncome,
    qbi, qbiLimitApplied, qbiCaps,
    qbiAggregationApplied,
    qbiAggregationDisclosure,
    totalPrefIncome, taxableAfterQBI, ordinaryTaxableIncome, taxableIncome,
    ordFedTax, prefTax, fedTax,
    marginalRate,
    addlMedThreshold,
    additionalMedicare,
    rentalNII, nii,
    niit: {
      applies:     niitAmount > 0,
      amount:      niitAmount,
      explanation: niitAmount > 0
        ? `3.8% on the lesser of net investment income ($${nii.toLocaleString()}) or excess MAGI above the $${getNIITThreshold(taxYear, status).toLocaleString()} threshold (IRC §1411)`
        : '',
    },
    niitAmount,
    numDependents, childCredit, ctcRaw, ctcReduction, ctcPerChild,
    amt,
    totalTax, taxToEarnedRatio,
    withheld, estimated, totalPayments, balance, quarterlyRecommended,
    installmentSchedule,                     // 2210-lite §6654(d)(1)(A)/(g)(1)
    priorYearMultiplier,
    safeHarborCurrentYear,
    safeHarborPriorYear,
    safeHarborMinimum,
    safeHarborBalance,
    safeHarborQuarterly,
    priorQBILossCO,
    effectiveQBILossCO,
    perEntityQBILossCO,
    qbiCarryforward,
    nolAllowed,
    nolSurplus,
    ebl,
    eblThreshold,
    eblBizCapGainExcluded,
    ordinary1231Recapture,
    palSuspendedRental,
    palCarryforwardApplied,
    palCarryforwardRemaining,
    rentalNetCombined:        combinedRentalNet,
    rentalAllowed:            palAdjustedRental,
    rentalAggregationElectionApplied: rentalAggregationElection,
    repHoursTestProvided:     repHoursProvided,
    repHoursTestPasses,
    repHoursTestFailed,
    repAggregationGatedOut,
    rentalNonpassiveNet:      nonpassiveRentalNet,
    rentalPassiveNet:         passiveRentalNet,
    rentalIsREP:              effectiveIsREP,
    rentalIsActiveParticipant: effectiveIsActiveParticipant,
    step1RentalNet,
    entityRentalResults,
    scheduleEK1Income,
    scheduleCSEIncome,
    entityIncomeBreakdown,
    reasonableCompAlert,
    federalOnly: true,
    entityBasisResults,
    totalSuspendedLoss,
    distributionCapGain,
    entityDistributionResults,
    ltGainEffective: _ltGain,
    priorSuspendedLossApplied,
    priorSuspendedLossRemaining,
  }
}

/**
 * FICA employment tax on a W-2 salary — both employer and employee sides.
 * Shared arithmetic used by scorpSeTaxSavings and scenarioCompare.js. IRC §3101/§3111.
 * @param {number} salary   W-2 wages subject to FICA.
 * @param {number} taxYear  Used to look up the year-specific SS wage base.
 * @returns {number}        Rounded total FICA (employee + employer combined).
 */
function calcFICAOnWages(salary, taxYear) {
  const ssWageBase = getTable(taxYear).ssWageBase
  const ssBoth  = Math.min(salary, ssWageBase) * FICA_SS_RATE * 2    // §3101(a) + §3111(a)
  const medBoth = salary * FICA_MEDICARE_RATE * 2                     // §3101(b) + §3111(b)
  return Math.round(ssBoth + medBoth)
}

// ── C-Corporation corporate layer (shared single source of truth) ────────────────────
// The entity-level computation, used by BOTH the standalone estimate (calcCCorpReturn)
// and the multi-entity Tax Tracker, where a C-Corp composes with other entities. Returns
// only the corporate-side figures; the caller folds `dividends` into qualified dividends,
// routes `officerSalary` to W-2, and adds `corpTax` to the personal total.
//   • officer salary + employer-side payroll tax are deductible to the corporation;
//   • corpTax = 21% (IRC §11, post-TCJA) of (netProfit − salary − employerFICA);
//   • dividends = the after-tax profit (assumes FULL annual distribution).
//
// @param {object}  input
// @param {number}  input.netProfit       Corporate net business profit BEFORE officer salary.
// @param {number} [input.officerSalary]  W-2 officer salary; default DEFAULT_OFFICER_SALARY_FRACTION × netProfit, capped at netProfit.
// @param {number} [input.taxYear]        Tax year (selects the SS wage base).
// @returns {{ officerSalary, employerFICA, profitBeforeTax, corpTax, dividends }}
function calcCCorpCorporateLayer({ netProfit, officerSalary, taxYear } = {}) {
  const ssWageBase = getTable(taxYear).ssWageBase
  const np         = Math.max(0, Math.round(nf(netProfit)))

  // Default salary mirrors the comparison engine; always capped at available profit.
  const defaultSalary = Math.round(np * DEFAULT_OFFICER_SALARY_FRACTION)
  const salary = Math.max(0, Math.min(np, Math.round(officerSalary != null ? officerSalary : defaultSalary)))

  // Employer-side payroll tax (deductible to the corporation): 6.2% SS up to the wage
  // base + 1.45% Medicare (no cap).
  const employerFICA = Math.round(
    Math.min(salary, ssWageBase) * FICA_SS_RATE + salary * FICA_MEDICARE_RATE
  )
  const profitBeforeTax = Math.max(0, np - salary - employerFICA)
  const corpTax         = Math.round(profitBeforeTax * C_CORP_TAX_RATE)
  const dividends       = Math.max(0, profitBeforeTax - corpTax)

  return { officerSalary: salary, employerFICA, profitBeforeTax, corpTax, dividends }
}

// ── C-Corporation estimate (standalone; single owner-employee) ───────────────────────
// Wraps the corporate layer with the shareholder's personal return so the full double-
// taxation picture is captured: salary as W-2 wages, after-tax profit as qualified
// dividends, then the 21% corporate tax and employment tax added on top. C-Corp
// distributions are NOT QBI (IRC §199A), so the personal return runs with no pass-through
// entity. Used by the Dashboard / comparison surfaces.
//
// PLANNING SIMPLIFICATION — NOT a substitute for a prepared Form 1120. Assumes full
// annual distribution (no retained-earnings strategy), a flat 21% with no graduated/AMT/
// accumulated-earnings/personal-holding-company layers, a single owner-employee, and
// federal tax only. Have a tax professional validate before relying on these figures.
//
// @param {object}  input
// @param {number}  input.netProfit         Corporate net business profit BEFORE officer salary.
// @param {number} [input.officerSalary]    W-2 officer salary (see calcCCorpCorporateLayer).
// @param {object} [input.personalContext]  Other calcTaxReturn inputs (filingStatus, taxYear, existing w2/divInc, …) EXCEPT entities/k1Total.
// @returns {{ officerSalary, employerFICA, profitBeforeTax, corpTax, dividends, employmentTax, personal, totalTax }}
function calcCCorpReturn({ netProfit, officerSalary, personalContext = {} } = {}) {
  const taxYear    = personalContext.taxYear
  const ssWageBase = getTable(taxYear).ssWageBase
  const layer = calcCCorpCorporateLayer({ netProfit, officerSalary, taxYear })
  const { officerSalary: salary, corpTax, dividends } = layer

  // Personal return: salary as W-2 wages, after-tax profit as qualified dividends. No
  // pass-through entity (C-Corp income does not flow through), so entities/k1Total empty.
  const personal = calcTaxReturn({
    ...personalContext,
    entities: [],
    k1Total:  0,
    w2:       nf(personalContext.w2)      + salary,
    qualDiv:  nf(personalContext.qualDiv) + dividends,
    divInc:   nf(personalContext.divInc)  + dividends,
  })

  // Total employment tax the owner-employee bears (both employer + employee halves, 15.3%).
  const employmentTax = Math.round(
    Math.min(salary, ssWageBase) * FICA_SS_RATE * 2 + salary * FICA_MEDICARE_RATE * 2
  )

  return {
    ...layer,
    employmentTax,
    personal,
    totalTax: personal.totalTax + employmentTax + corpTax,
  }
}
export {
  TAX_TABLES,
  AMT_TABLES,
  SALT_CAPS,
  getSaltCap,
  getTable,
  getStdDed,
  getBrackets,
  getLTCGThresholds,
  getNIITThreshold,
  getAddlMedicareThreshold,
  getMarginalRate,
  calcFederalTax,
  calcPreferentialTax,
  calcNIIT,
  calcAMT,
  calcQBI,
  calcCCorpReturn,
  calcCCorpCorporateLayer,
  QBI_THRESHOLDS,
  QBI_PHASE_IN_RANGE,
  QBI_MIN_DEDUCTION,
  calcFICAOnWages,
  calcTaxReturn,
  scorpSeTaxSavings,
  // M1 (audit F-01): single source of truth for the §469(i) $25k active-participation
  // allowance — consumed by both engine PAL branches and the AIAnalysis strategy card.
  calc469iAllowance,
  // M3 (audit F-03/F-04): §179(b)(3) business-income limitation (single source —
  // consumed by the AIAnalysis strategy layer) and the flow-through k1Total
  // aggregation rule (consumed by CalculateTaxInner's three persist paths).
  calc179Limitation,
  sumK1FlowThrough,
  // D-10 (dead-code audit): reasonable-comp numeric rule — consumed by the engine
  // alert above and Dashboard's scenario card.
  calcReasonableCompCore,
}
