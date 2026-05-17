// src/taxCalc.js
// Pure tax calculation helpers — no React, no DOM, no side effects.
// Safe to call from any module.
//
// Permanent rate constants live in constants.js (imported below).
// Year-specific figures (brackets, thresholds, limits) live in TAX_TABLES / AMT_TABLES below.
// Update TAX_TABLES each tax year — do not touch the rate constants.
//
// Export map:
//   calcTaxReturn  — top-level orchestrator; call this from TaxReturn.jsx
//   calcQBI        — §199A deduction; MUST be imported by AIAnalysis.jsx (F4-02: single source)
//   calcAMT        — Form 6251 AMT
//   calcFederalTax — ordinary income brackets
//   calcPreferentialTax — QDCGTW (LTCG / qualified dividends / §1250 / collectibles)
//   calcNIIT       — §1411 net investment income tax
//   TAX_TABLES, AMT_TABLES, SALT_CAPS, getTable, getStdDed, getBrackets,
//   getLTCGThresholds, getNIITThreshold, getAddlMedicareThreshold, getMarginalRate, nv
//
// ── Audit-fix change log ────────────────────────────────────────────────────
// F-C02 (QBI aggregation disclosure):
//   calcQBI now accepts opts.hasMultiEntityTypes and returns:
//     aggregationApplied  — true when W-2 wages across different entity types are
//                           combined above the §199A threshold (Reg. §1.199A-4 election
//                           is assumed; not automatic). Drives UI disclosure in
//                           TaxReturn.jsx and AIAnalysis.jsx.
//     aggregationDisclosure — human-readable disclosure string; null when not applicable.
//   calcTaxReturn computes hasMultiEntityTypes and passes it to calcQBI.
//   NOTE: This file does not prevent aggregation — it surfaces the assumption
//   so the UI can inform the user. Actual un-aggregated path available when
//   hasMultiEntityTypes=false.
//
// F-C05 (stale AI Analysis data):
//   calcTaxReturn return object now includes calculatedAt (Date.now()) so
//   AIAnalysis.jsx can compare against its savedRecord.savedAt and show a
//   "⚠ Analysis based on last saved record" banner when they diverge.
//
// F-H03 (income display split — Schedule C vs Schedule E):
//   calcTaxReturn return now includes:
//     scheduleEK1Income — S-Corp / partnership K-1 income routing to Schedule E, Part II
//     scheduleCSEIncome — Sole-proprietor / SMLLC income routing to Schedule C
//     entityIncomeBreakdown — per-entity array with name, type, income, scheduleForm
//   These values are already computed internally; the addition only exposes them
//   for TaxReturn.jsx's income waterfall and IRS Filing Map in AIAnalysis.jsx.
//   No calculation changes — display fix applies to TaxReturn.jsx (File 02).
//
// F-H06 (Additional Medicare Tax display):
//   additionalMedicare is already calculated correctly (IRC §3101(b)(2)).
//   The $0 shown in the test case is mathematically correct:
//     W-2 ($70,000) + SE earnings subject ($110,820) = $180,820 < $200,000 threshold.
//   No calc change needed. Display fix: TaxReturn.jsx must show this as a
//   separate labeled line ("Additional Medicare Tax (0.9%) — Form 8959") distinct
//   from amt (Form 6251 AMT) so users aren't confused when both are $0.
//
// AUDIT FIX (fix/tax-engine-accuracy):
//   TAX-01: reasonableCompAlert added to calcTaxReturn return. Fires when the first
//     S-Corp entity in the list has officer salary below SCORP_REASONABLE_COMP_RATIO_THRESHOLD
//     (40%) of total S-Corp compensation (salary + K-1). Threshold and citations centralized
//     in constants.js. Dashboard.jsx previously computed this with a fallback IIFE; it now
//     receives the authoritative value from calcTaxReturn and falls back only when
//     calcTaxReturn result is unavailable (??).
//   TAX-04 (niit return format): calcTaxReturn previously returned niit as a plain number.
//     Dashboard.jsx uses niit.applies / niit.amount (object access). The nullish coalescing
//     operator (??) in Dashboard.calcDashboard never fired because a number is not null/
//     undefined — the NIIT line never rendered regardless of income level. Fixed by:
//       • Internal calculation variable renamed to niitAmount (number).
//       • Return key niit now returns { applies, amount, explanation } object.
//       • Backward-compat alias niitAmount also returned for TaxReturn.jsx until
//         that file is updated to use result.niit.amount or result.niitAmount.
//   TAX-06: federalOnly: true added to return. Declares that all calculations in this
//     file are federal income tax only — no state tax is computed. UI components
//     (Dashboard, TaxReturn) must surface this to the user.
// ────────────────────────────────────────────────────────────────────────────

import {
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
  // TAX-01: S-Corp reasonable compensation threshold — centralized in constants.js.
  // 40% heuristic per IRS enforcement patterns; not a statutory floor.
  // Citations: Rev. Rul. 74-44; Watson v. Comm'r, 668 F.3d 1008 (8th Cir. 2012);
  //            Spicer Accounting, Inc. v. United States, 918 F.2d 90 (9th Cir. 1990).
  SCORP_REASONABLE_COMP_RATIO_THRESHOLD,
} from './constants.js'

// ── IRS Tax Tables 2024-2026 ──────────────────────────────────────────────────
// Sources: Rev. Proc. 2023-34 (2024) | Rev. Proc. 2024-40 + OBBBA Rev. Proc. 2025-32 (2025) | Rev. Proc. 2025-32 (2026)
// Numeric value coercer — safely casts form-state inputs (empty strings, undefined, numbers) to finite number, defaulting to 0.
const nv = (v) => parseFloat(v) || 0

const TAX_TABLES = {
  2024: {
    std:        { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900, qss: 29200 },
    ssWageBase: 168600,
    brackets: {
      single: [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[609350,.35],[Infinity,.37]],
      mfj:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
      mfs:    [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[365600,.35],[Infinity,.37]],
      hoh:    [[16550,.10],[63100,.12],[100500,.22],[191950,.24],[243700,.32],[609350,.35],[Infinity,.37]],
      qss:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.37],[Infinity,.37]],
    },
    ltcg:    { single:[47025,518900], mfj:[94050,583750], mfs:[47025,291850], hoh:[63000,551350], qss:[94050,583750] },
    niit:    { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    addlMed: { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    // §461(l) excess business loss thresholds — Rev. Proc. 2023-34 §3.13 (2024)
    ebl:     { single:305000, mfj:610000, mfs:305000, hoh:305000, qss:610000 },
    // §24 Child Tax Credit — IRC §24(a): $2,000/child (TCJA P.L. 115-97); not inflation-adjusted for 2024.
    // Phase-out per §24(b)(1): $50 per $1,000 (or fraction) above $200K single / $400K MFJ.
    // Thresholds are NOT inflation-adjusted. See calcTaxReturn for full phase-out logic.
    ctc:     { perChild: 2000 },
  },
  2025: {
    // Standard deduction per Rev. Proc. 2024-40 as amended by OBBBA P.L. 119-21 §70101
    std:        { single: 15750, mfj: 31500, mfs: 15750, hoh: 23625, qss: 31500 },
    ssWageBase: 176100,
    brackets: {
      single: [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]],
      mfj:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
      mfs:    [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[313200,.35],[Infinity,.37]],
      hoh:    [[17000,.10],[64850,.12],[103350,.22],[197300,.24],[250500,.32],[626350,.35],[Infinity,.37]],
      qss:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
    },
    ltcg:    { single:[48350,533400], mfj:[96700,600050], mfs:[48350,300000], hoh:[64750,566700], qss:[96700,600050] },
    niit:    { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    addlMed: { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    // §461(l) excess business loss thresholds — Rev. Proc. 2024-40 §3.14 (2025)
    ebl:     { single:313000, mfj:626000, mfs:313000, hoh:313000, qss:626000 },
    // §24 Child Tax Credit — OBBBA P.L. 119-21 §70301 raised per-child credit to $2,200 for 2025.
    // Phase-out thresholds unchanged: $200K single / $400K MFJ — NOT inflation-adjusted per OBBBA.
    ctc:     { perChild: 2200 },
  },
  2026: {
    std:        { single: 16100, mfj: 32200, mfs: 16100, hoh: 24150, qss: 32200 },
    ssWageBase: 184500,
    brackets: {
      single: [[12400,.10],[50000,.12],[106900,.22],[203900,.24],[259350,.32],[648750,.35],[Infinity,.37]],
      mfj:    [[24800,.10],[100000,.12],[213800,.22],[407800,.24],[518700,.32],[777650,.35],[Infinity,.37]],
      mfs:    [[12400,.10],[50000,.12],[106900,.22],[203900,.24],[259350,.32],[388825,.35],[Infinity,.37]],
      hoh:    [[17600,.10],[67050,.12],[106900,.22],[203900,.24],[259300,.32],[648700,.35],[Infinity,.37]],
      qss:    [[24800,.10],[100000,.12],[213800,.22],[407800,.24],[518700,.32],[777650,.35],[Infinity,.37]],
    },
    ltcg:    { single:[50400,557050], mfj:[100800,626350], mfs:[50400,313175], hoh:[67650,591800], qss:[100800,626350] },
    niit:    { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    addlMed: { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    // §461(l) excess business loss thresholds — estimated 2026 (update when Rev. Proc. 2025-xx publishes)
    ebl:     { single:320000, mfj:640000, mfs:320000, hoh:320000, qss:640000 },
    // §24 Child Tax Credit — $2,200 per child (same as 2025; OBBBA did not index CTC for inflation).
    // Phase-out thresholds: $200K single / $400K MFJ — unchanged per OBBBA.
    ctc:     { perChild: 2200 },
  },
}

// ── AMT Tables — Form 6251 — IRC §55-59 ──────────────────────────────────────
// 2024: Rev. Proc. 2023-34 §3.11 | 2025: Rev. Proc. 2024-40 §3.12 | 2026: Rev. Proc. 2025-32 §3.12 (post-OBBBA P.L. 119-21 §70107)
// Note: OBBBA returned 2026 phaseout thresholds to 2018 levels and doubled the phaseout rate from 25¢/dollar to 50¢/dollar.
// QSS uses MFJ amounts per §55(d)(1).
const AMT_TABLES = {
  2024: {
    exemption:     { single:85700,  mfj:133300, mfs:66650,  hoh:85700,  qss:133300 },
    phaseoutStart: { single:609350, mfj:1218700, mfs:609350, hoh:609350, qss:1218700 },
    phaseoutRate:  0.25,
    bracket26_28:  { single:232600, mfj:232600, mfs:116300, hoh:232600, qss:232600 },
  },
  2025: {
    exemption:     { single:88100,  mfj:137000, mfs:68650,  hoh:88100,  qss:137000 },
    phaseoutStart: { single:626350, mfj:1252700, mfs:626350, hoh:626350, qss:1252700 },
    phaseoutRate:  0.25,
    bracket26_28:  { single:239100, mfj:239100, mfs:119550, hoh:239100, qss:239100 },
  },
  2026: {
    exemption:     { single:90100,  mfj:140200, mfs:70100,  hoh:90100,  qss:140200 },
    phaseoutStart: { single:500000, mfj:1000000, mfs:500000, hoh:500000, qss:1000000 },
    phaseoutRate:  0.50,   // OBBBA doubled the phaseout rate beginning 2026
    bracket26_28:  { single:244500, mfj:244500, mhs:122250, hoh:244500, qss:244500 },
  },
}

// SALT deduction caps — Schedule A Line 5e — IRC §164(b)(6) (TCJA) as amended by OBBBA §70106
// 2024: $10K (TCJA original); 2025: $40K (OBBBA increase); 2026: $40,400 (1% inflation adj per OBBBA); MFS = half
const SALT_CAPS = { 2024: 10000, 2025: 40000, 2026: 40400 }

function getTable(year)                  { return TAX_TABLES[year] || TAX_TABLES[2025] }
function getStdDed(year, fs)             { const t = getTable(year).std;     return t[fs] || t.single }
function getBrackets(year, fs)           { const t = getTable(year).brackets; return t[fs] || t.single }
function getLTCGThresholds(year, fs)     { const t = getTable(year).ltcg;    return t[fs] || t.single }
function getNIITThreshold(year, fs)      { const t = getTable(year).niit;    return t[fs] || 200000 }
function getAddlMedicareThreshold(year, fs) { const t = getTable(year).addlMed; return t[fs] || 200000 }

// Marginal ordinary-income rate at a given taxable income level.
// Used for planning heuristics: "$X more income costs $X × marginalRate in tax."
function getMarginalRate(taxable, year, fs) {
  let rate = 0.10, prev = 0
  for (const [cap, r] of getBrackets(year, fs)) {
    if (taxable > prev) rate = r
    prev = cap
  }
  return rate
}

// Ordinary income tax on brackets only — does NOT include LTCG / qualified dividends.
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

// ── IRS Qualified Dividends & Capital Gain Tax Worksheet (QDCGTW) ────────────
// IRC §1(h) — LTCG and qualified dividends taxed at 0% / 15% / 20%
// Also handles: Unrecaptured §1250 gain (max 25%) and Collectibles gain (max 28%)
// ordinaryIncome = taxable income EXCLUDING preferential items
// prefItems = { ltcg, qualDiv, unrecap1250, collectibles }
function calcPreferentialTax(ordinaryIncome, prefItems, year, fs) {
  const { ltcg = 0, qualDiv = 0, unrecap1250 = 0, collectibles = 0 } = prefItems
  const [threshold0, threshold15] = getLTCGThresholds(year, fs)
  let tax = 0

  const totalPref = ltcg + qualDiv
  if (totalPref <= 0 && unrecap1250 <= 0 && collectibles <= 0) return 0

  // "Stacking" — ordinary income fills brackets first, then preferential income stacks on top.
  const ordFloor = Math.max(0, ordinaryIncome)

  // ── LTCG + Qualified Dividends (0% / 15% / 20% tiers) ──────────────────────
  if (totalPref > 0) {
    const zeroRoom     = Math.max(0, threshold0 - ordFloor)
    const atZero       = Math.min(totalPref, zeroRoom)
    const fifteenRoom  = Math.max(0, threshold15 - Math.max(ordFloor, threshold0))
    const remaining15  = totalPref - atZero
    const atFifteen    = Math.min(remaining15, fifteenRoom)
    const atTwenty     = totalPref - atZero - atFifteen

    tax += atFifteen * LTCG_RATE_MID   // 15% — IRC §1(h)(1)(C)
    tax += atTwenty  * LTCG_RATE_HIGH  // 20% — IRC §1(h)(1)(D)
  }

  // ── Unrecaptured Section 1250 Gain (max 25%) — IRC §1(h)(1)(D) ─────────────
  // Taxed at LESSER of 25% or the taxpayer's ordinary bracket rate.
  // Conservative planning assumption: 25% for mid/high-income filers.
  if (unrecap1250 > 0) {
    tax += unrecap1250 * 0.25  // IRC §1(h)(1)(D) — max 25% (§1(h)(7))
  }

  // ── Collectibles Gain (max 28%) — IRC §1(h)(4) ─────────────────────────────
  if (collectibles > 0) {
    tax += collectibles * 0.28  // IRC §1(h)(4) — max 28%
  }

  return Math.round(tax)
}

// Net Investment Income Tax — IRC §1411 — NIIT_RATE (3.8%) on lesser of NII or excess AGI over threshold.
// NIIT has no withholding mechanism — flows entirely through estimated payments or year-end true-up.
// See constants.js NIIT_RATE for full behavioral difference vs. Additional Medicare Tax.
function calcNIIT(nii, agi, year, fs) {
  const threshold = getNIITThreshold(year, fs)
  if (agi <= threshold || nii <= 0) return 0
  const excessAGI = agi - threshold
  return Math.round(Math.min(nii, excessAGI) * NIIT_RATE)
}

// ── Alternative Minimum Tax — Form 6251 — IRC §55-59 ─────────────────────────
// AMTI = taxableIncome + QBI add-back (§199A(f)(2)) + SALT add-back (§56(b)(1)(A)(ii))
// Standard deduction NOT added back per §56(b)(1)(F) since TCJA 2018 (made permanent by OBBBA).
// LTCG/qualified dividends carved out of ordinary AMTI (taxed at preferential rates via calcPreferentialTax).
// Tentative Minimum Tax = ordinary AMT (26%/28%) + preferential AMT; AMT owed = max(0, TMT − regular tax).
// SALT_CAPS parameterized per year. ISO bargain element wiring deferred to PR-C (Issue #44).
function calcAMT({ taxableIncome, qbi, saltAmount, isoBargainElement, ltGain, qualDiv, regularTax, status, taxYear, useItemized, itemized, stdDed }) {
  const amtTable   = AMT_TABLES[taxYear] || AMT_TABLES[2025]
  const baseSaltCap = SALT_CAPS[taxYear] || SALT_CAPS[2025]
  const saltCap    = status === 'mfs' ? baseSaltCap / 2 : baseSaltCap
  // SALT add-back only when filer is actually itemizing (Schedule A)
  const isItemizing  = useItemized && itemized > stdDed
  const saltAddback  = isItemizing ? Math.min(Math.max(0, saltAmount), saltCap) : 0
  // QBI add-back per §199A(f)(2): taxableIncome already had QBI subtracted; restore for AMTI
  // ISO bargain element add-back per §56(b)(3) / Form 6251 line 2i — uncapped
  const isoAddback   = Math.max(0, isoBargainElement || 0)
  const amti = Math.max(0, taxableIncome) + Math.max(0, qbi) + saltAddback + isoAddback

  // Exemption with phaseout — phaseoutRate is 0.25 pre-OBBBA, 0.50 for 2026+ (encoded in AMT_TABLES)
  const phaseoutOver = Math.max(0, amti - amtTable.phaseoutStart[status])
  const exemption    = Math.max(0, amtTable.exemption[status] - phaseoutOver * amtTable.phaseoutRate)
  const amtTaxable   = Math.max(0, amti - exemption)
  if (amtTaxable === 0) return 0

  // Carve out preferential-rate income — taxed at LTCG rates inside AMT, not at 26%/28%
  const preferential   = Math.max(0, ltGain) + Math.max(0, qualDiv)
  const ordinaryAMTI   = Math.max(0, amtTaxable - preferential)

  // 26% / 28% on ordinary AMTI — bracket26_28 is the inflection threshold (see AMT_TABLES)
  const threshold    = amtTable.bracket26_28[status]
  const ordinaryAMT  = ordinaryAMTI <= threshold
    ? ordinaryAMTI * AMT_RATE_LOW
    : threshold * AMT_RATE_LOW + (ordinaryAMTI - threshold) * AMT_RATE_HIGH

  // Reuse calcPreferentialTax for the LTCG portion — same 0%/15%/20% brackets apply inside AMT
  const preferentialAMT = calcPreferentialTax(
    ordinaryAMTI,
    { ltcg: Math.max(0, ltGain), qualDiv: Math.max(0, qualDiv) },
    taxYear, status
  )

  const tentativeMinimumTax = Math.round(ordinaryAMT + preferentialAMT)
  // AMT owed = excess of TMT over regular tax (fedTax = ordinary + LTCG combined, matching Form 6251 line 9)
  return Math.max(0, tentativeMinimumTax - Math.max(0, regularTax))
}

// ── §199A QBI Threshold and Phase-In Tables ───────────────────────────────────
// §199A(e)(2) threshold: taxable income above which wage/UBIA limits and SSTB exclusion begin to phase in.
// Sources: Rev. Proc. 2023-34 (2024), Rev. Proc. 2024-40 (2025), Rev. Proc. 2025-32 (2026 post-OBBBA).
const QBI_THRESHOLDS = {
  2024: { single:191950, mfj:383900, hoh:191950, mfs:191950 },
  2025: { single:197300, mfj:394600, hoh:197300, mfs:197300 },
  2026: { single:201775, mfj:403500, hoh:201775, mfs:201775 },
}

// §199A(b)(3)(B) phase-in range — wage/UBIA limit and SSTB exclusion phase in linearly across this band.
// OBBBA (P.L. 119-21) expanded the range to $75K/$150K starting tax year 2026; 2024–2025 retain original $50K/$100K.
const QBI_PHASE_IN_RANGE = {
  2024: { single:50000, mfj:100000, hoh:50000, mfs:50000 },
  2025: { single:50000, mfj:100000, hoh:50000, mfs:50000 },
  2026: { single:75000, mfj:150000, hoh:75000, mfs:75000 },
}

// §199A(i) OBBBA P.L. 119-21 minimum deduction for active QBI (tax years beginning after 12/31/2025).
// If aggregate QBI from active QTBs (material participation per §469(h)) is ≥ $1,000,
// deduction = GREATER of the regular calc or $400. The §199A(a)(2) carve-out allows the
// floor to override the TI cap when it binds.
const QBI_MIN_DEDUCTION = { 2026: 400 }
const QBI_MIN_THRESHOLD = { 2026: 1000 }

function _applyMinQBI(result, activeQbiForFloor, taxYear) {
  const floor      = QBI_MIN_DEDUCTION[taxYear]
  const threshold  = QBI_MIN_THRESHOLD[taxYear]
  if (floor == null || threshold == null) return result
  if (activeQbiForFloor < threshold) return result
  if (result.deduction >= floor) return { ...result, caps: { ...result.caps, min400: floor } }
  return { deduction: floor, limitApplied: 'min400', caps: { ...result.caps, min400: floor } }
}

// ── calcQBI — §199A Qualified Business Income Deduction ──────────────────────
// CANONICAL IMPLEMENTATION — AIAnalysis.jsx MUST import and call this function
// rather than computing QBI independently. Any module that duplicates this logic
// will diverge from the main calculator over time. (Audit finding F4-02)
//
// Returns { deduction, limitApplied, caps, aggregationApplied, aggregationDisclosure } where:
//   deduction            — actual QBI deduction (rounded)
//   limitApplied         — 'qbi' | 'wage' | 'income' | 'min400' | 'none'
//   caps                 — { qbi, wage, income, min400? } actual values of each cap
//                          (wage is null when fallback path is active — see F5-03 note below)
//   aggregationApplied   — true when W-2 wages from different entity types (e.g., S-Corp
//                          officer W-2 + Schedule C with $0 W-2) are pooled above the
//                          §199A threshold. This is an assumed Reg. §1.199A-4 aggregation
//                          election; it is NOT automatic. UI must display aggregationDisclosure
//                          to the user when this flag is true. (Audit finding F-C02)
//   aggregationDisclosure — human-readable disclosure string; null when not applicable.
//
// opts.hasMultiEntityTypes — passed from calcTaxReturn; true when entities span both
//   SE_SUBJECT_TYPES (Schedule C/Sole Prop) and non-SE types (S-Corp/Partnership).
//   When true and taxableBeforeQBI > QBI threshold, aggregationApplied = true.
function calcQBI(qbiIncome, taxableBeforeQBI, capitalGains, opts = {}) {
  const {
    status = 'single',
    taxYear = 2025,
    entityQbiData = [],
    activeQbi,
    hasMultiEntityTypes = false,   // F-C02: supplied by calcTaxReturn
  } = opts

  // ── F-C02: Compute aggregation flag ────────────────────────────────────────
  const thresholds       = QBI_THRESHOLDS[taxYear] || QBI_THRESHOLDS[2025]
  const threshold        = thresholds[status] || thresholds.single
  const aggregationApplied = hasMultiEntityTypes && taxableBeforeQBI > threshold

  const aggregationDisclosure = aggregationApplied
    ? 'Your QBI deduction assumes you have elected to aggregate your business entities ' +
      'under Reg. §1.199A-4 (combined W-2 wages applied across all entities). ' +
      'This election must be formally made on Form 8995-A, Schedule B and applied ' +
      'consistently each year. Without aggregation, your deduction may be lower. ' +
      'Consult your CPA before relying on this figure.'
    : null

  const withMeta = (result) => ({
    ...result,
    aggregationApplied,
    aggregationDisclosure,
  })

  if (qbiIncome <= 0 || taxableBeforeQBI <= 0) {
    return _applyMinQBI(
      withMeta({ deduction: 0, limitApplied: 'none', caps: { qbi: 0, wage: null, income: 0 } }),
      activeQbi !== undefined ? activeQbi : qbiIncome,
      taxYear
    )
  }

  const netCapGain      = Math.max(0, capitalGains)
  const incomeLimitation = Math.max(0, taxableBeforeQBI - netCapGain) * QBI_DEDUCTION_RATE
  const qbiComponent    = qbiIncome * QBI_DEDUCTION_RATE

  // ── Below threshold: full 20% of QBI, capped only by income limitation ──────
  if (taxableBeforeQBI <= threshold) {
    const ded         = Math.min(qbiComponent, incomeLimitation)
    const limitApplied = qbiComponent <= incomeLimitation ? 'qbi' : 'income'
    return _applyMinQBI(
      withMeta({
        deduction:    Math.round(ded) || 0,
        limitApplied,
        caps: { qbi: Math.round(qbiComponent), wage: null, income: Math.round(incomeLimitation) },
      }),
      activeQbi !== undefined ? activeQbi : qbiIncome,
      taxYear
    )
  }

  // ── Above threshold: §199A(b)(2) wage/UBIA limit and §199A(d)(3) SSTB % ────
  const phaseInForYear  = QBI_PHASE_IN_RANGE[taxYear] || QBI_PHASE_IN_RANGE[2025]
  const phaseInRange    = phaseInForYear[status] || phaseInForYear.single
  const excessOverThreshold = taxableBeforeQBI - threshold
  const phasePercent    = Math.min(1, excessOverThreshold / phaseInRange)

  const sstbApplicablePct = Math.max(0, 1 - phasePercent)

  const sstbEntityQBI = entityQbiData.reduce((s, e) => {
    if (!e.box17V_sstb) return s
    const k1Income = parseFloat(
      e.k1 ?? Math.round(parseFloat(e.netProfit || 0) * ((parseFloat(e.own) || 100) / 100))
    ) || 0
    return s + Math.max(0, k1Income)
  }, 0)

  const adjQBI           = Math.max(0, qbiIncome - sstbEntityQBI * (1 - sstbApplicablePct))
  const scaledQbiComponent = adjQBI * QBI_DEDUCTION_RATE
  const activeQbiForFloor  = activeQbi !== undefined ? activeQbi : adjQBI

  // ── §199A(b)(2) W-2 wage and UBIA limitation ──────────────────────────────
  // F5-03 FIX: If no Box 17V wages entered, use officerW2 as proxy.
  const totalWages = entityQbiData.reduce((s, e) => {
    const w = parseFloat(e.box17V_wages) || parseFloat(e.officerW2) || 0
    return s + (e.box17V_sstb ? w * sstbApplicablePct : w)
  }, 0)
  const totalUBIA = entityQbiData.reduce((s, e) => {
    const u = parseFloat(e.box17V_ubia) || 0
    return s + (e.box17V_sstb ? u * sstbApplicablePct : u)
  }, 0)

  if (totalWages === 0 && totalUBIA === 0) {
    const ded         = Math.min(scaledQbiComponent, incomeLimitation)
    const limitApplied = scaledQbiComponent <= incomeLimitation ? 'qbi' : 'income'
    return _applyMinQBI(
      withMeta({
        deduction:    Math.round(ded) || 0,
        limitApplied,
        caps: { qbi: Math.round(scaledQbiComponent), wage: null, income: Math.round(incomeLimitation) },
      }),
      activeQbiForFloor,
      taxYear
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
  if (incomeLimitation < limitedAmount) limitApplied = 'income'
  else if (wageBindingActive)           limitApplied = 'wage'
  else                                  limitApplied = 'qbi'

  return _applyMinQBI(
    withMeta({
      deduction:    Math.round(ded) || 0,
      limitApplied,
      caps: {
        qbi:    Math.round(scaledQbiComponent),
        wage:   Math.round(wageLimit),
        income: Math.round(incomeLimitation),
      },
    }),
    activeQbiForFloor,
    taxYear
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// calcTaxReturn — top-level orchestrator
// ─────────────────────────────────────────────────────────────────────────────
function calcTaxReturn(input) {
  const {
    taxYear, status, dependents,
    entities = [],
    w2 = 0, k1Total = 0, rentalNet = 0,
    stGain = 0, ltGain = 0, intInc = 0, divInc = 0, qualDiv = 0,
    f4797Inc = 0, taxableSS = 0, iraIncome = 0,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward, priorYearQBILoss,
    useItemized, itemizedAmt, saltAmount,
    hasISO, isoBargainElement,
    isREP,
    isActiveParticipant = true,
    unrecap1250, collectiblesGain,
    w2Withheld, estPaid,
    ytdFactor = 1,
    priorYearTax,
    priorYearAGI,
  } = input

  const ytdScale = (val) => Math.round(nv(val) * ytdFactor)

  const priorQBILossCO = Math.abs(nv(priorYearQBILoss))

  // ── §469 Passive Activity Loss (PAL) Limitation ─────────────────────────────
  let palAdjustedRental  = rentalNet
  let palSuspendedRental = 0
  if (!isREP && rentalNet < 0) {
    const preRentalAGI = w2 + k1Total + f4797Inc + stGain + ltGain + intInc + divInc + iraIncome
      - Math.min(ytdScale(studentLoanInt), 2500)
      - ytdScale(hsaDeduction)
      - ytdScale(selfEmpRetirement)
      - ytdScale(selfEmpHealthIns)
    const isMFS         = status === 'mfs'
    const baseAllowance = (isMFS || !isActiveParticipant) ? 0 : 25000
    const phaseStart    = isMFS ? 0 : 100000
    const specialAllowance = Math.max(0, baseAllowance - Math.max(0, (preRentalAGI - phaseStart) * 0.5))
    palAdjustedRental  = Math.max(rentalNet, -specialAllowance)
    palSuspendedRental = Math.round(palAdjustedRental - rentalNet)
  }

  // ── §461(l) Excess Business Loss (EBL) Limitation ───────────────────────────
  const eblThreshold = (getTable(taxYear).ebl?.[status]) ?? ((['mfj','qss'].includes(status)) ? 626000 : 313000)
  const eblBiz   = k1Total + f4797Inc + (isREP ? rentalNet : palAdjustedRental)
  const eblNetLoss = Math.max(0, -eblBiz)
  const ebl      = Math.max(0, eblNetLoss - eblThreshold)

  const unrec1250   = Math.max(0, nv(unrecap1250))
  const collectibles = Math.max(0, nv(collectiblesGain))

  // ── Self-Employment Tax — IRC §1401 ─────────────────────────────────────────
  const seNetIncome = entities.reduce((sum, e) => {
    if (!e || !SE_SUBJECT_TYPES.includes(e.type)) return sum
    return sum + Math.max(0, parseFloat(e.k1) || 0)
  }, 0)

  const ssWageBase = TAX_TABLES[taxYear]?.ssWageBase || 176100
  const seEarningsSubject = seNetIncome * (1 - FICA_SS_RATE - FICA_MEDICARE_RATE)
  const ssPortion     = Math.min(seEarningsSubject, ssWageBase) * (FICA_SS_RATE * 2)
  const medicarePortion = seEarningsSubject * (FICA_MEDICARE_RATE * 2)
  const seTax         = Math.round(ssPortion + medicarePortion)
  // §164(f): 50% SE tax deduction — reduces AGI. Correctly included in adjustments below.
  const halfSE        = Math.round(seTax * SE_TAX_DEDUCTION_RATE)

  // ── Above-the-line deductions ────────────────────────────────────────────────
  const selfEmpHealthDed    = ytdScale(selfEmpHealthIns)
  const hsaDed              = ytdScale(hsaDeduction)
  const studentLoanDed      = Math.min(ytdScale(studentLoanInt), 2500)
  const selfEmpRetirementDed = ytdScale(selfEmpRetirement)
  // halfSE is included here — this is what reduces AGI per §164(f)
  const adjustments         = halfSE + selfEmpHealthDed + hsaDed + studentLoanDed + selfEmpRetirementDed

  const stdDed  = getStdDed(taxYear, status)
  const itemized = nv(itemizedAmt)
  const deduction = useItemized ? Math.max(stdDed, itemized) : stdDed

  const grossIncomeBeforeNOL = w2 + k1Total + palAdjustedRental + stGain + ltGain
    + unrec1250 + collectibles + intInc + divInc + f4797Inc + taxableSS + iraIncome + ebl

  const taxableBeforeNOL = Math.max(0, grossIncomeBeforeNOL - adjustments - deduction)
  const priorNOL    = Math.max(0, nv(nolCarryforward))
  const nolAllowed  = Math.min(priorNOL, Math.floor(taxableBeforeNOL * 0.80))
  const nolSurplus  = priorNOL - nolAllowed

  const grossIncome     = grossIncomeBeforeNOL - nolAllowed
  const agi             = grossIncome - adjustments
  const taxableBeforeQBI = taxableBeforeNOL - nolAllowed

  const _sstbThresholds  = QBI_THRESHOLDS[taxYear]  || QBI_THRESHOLDS[2025]
  const _sstbPhaseIn     = QBI_PHASE_IN_RANGE[taxYear] || QBI_PHASE_IN_RANGE[2025]
  const qbiThreshold     = _sstbThresholds[status]  || _sstbThresholds.single
  const qbiPhaseRange    = _sstbPhaseIn[status]     || _sstbPhaseIn.single
  const sstbApplicablePct = taxableBeforeQBI <= qbiThreshold
    ? 1
    : Math.max(0, 1 - Math.min(1, (taxableBeforeQBI - qbiThreshold) / qbiPhaseRange))

  const nonSEk1 = entities.reduce((sum, e) => {
    if (!e || SE_SUBJECT_TYPES.includes(e?.type)) return sum
    const k1 = parseFloat(e.k1 ?? 0) || (parseFloat(e.netProfit || 0) * ((parseFloat(e.own) || 100) / 100))
    const scale = e.box17V_sstb ? sstbApplicablePct : 1
    return sum + k1 * scale
  }, 0)
  const seK1AfterAdjustments = Math.max(0, seNetIncome - halfSE - selfEmpHealthDed)

  const k1FallbackForQBI = entities.length === 0 ? k1Total : 0
  const qbiBasis = nonSEk1 + seK1AfterAdjustments + Math.max(0, palAdjustedRental) - priorQBILossCO + k1FallbackForQBI

  const prefIncome  = ltGain + qualDiv

  const hasMultiEntityTypes = entities.length > 1
    && entities.some(e => e && SE_SUBJECT_TYPES.includes(e.type))
    && entities.some(e => e && !SE_SUBJECT_TYPES.includes(e.type))

  const _qbiResult  = calcQBI(qbiBasis, taxableBeforeQBI, prefIncome, {
    status,
    taxYear,
    entityQbiData:    entities,
    hasMultiEntityTypes,
  })
  const qbi                    = _qbiResult.deduction
  const qbiLimitApplied        = _qbiResult.limitApplied
  const qbiCaps                = _qbiResult.caps
  const qbiAggregationApplied  = _qbiResult.aggregationApplied
  const qbiAggregationDisclosure = _qbiResult.aggregationDisclosure
  const qbiCarryforward        = qbiBasis < 0 ? Math.abs(qbiBasis) : 0

  const totalPrefIncome      = Math.max(0, ltGain) + Math.max(0, qualDiv) + unrec1250 + collectibles
  const taxableAfterQBI      = Math.max(0, taxableBeforeQBI - qbi)
  const ordinaryTaxableIncome = Math.max(0, taxableAfterQBI - totalPrefIncome)
  const taxableIncome        = taxableAfterQBI

  const ordFedTax = calcFederalTax(ordinaryTaxableIncome, taxYear, status)

  const prefTax = calcPreferentialTax(ordinaryTaxableIncome, {
    ltcg:        Math.min(Math.max(0, ltGain),       taxableAfterQBI),
    qualDiv:     Math.min(Math.max(0, qualDiv),       taxableAfterQBI),
    unrecap1250: Math.min(unrec1250,                  taxableAfterQBI),
    collectibles: Math.min(collectibles,              taxableAfterQBI),
  }, taxYear, status)

  const fedTax = ordFedTax + prefTax

  const brackets = getBrackets(taxYear, status)
  let marginalRate = 0
  if (ordinaryTaxableIncome > 0) {
    let prev = 0
    for (const [cap, rate] of brackets) {
      if (ordinaryTaxableIncome > prev) marginalRate = rate
      prev = cap
    }
  } else if (totalPrefIncome > 0) {
    const [t0, t15] = getLTCGThresholds(taxYear, status)
    marginalRate = totalPrefIncome > t15 ? LTCG_RATE_HIGH : totalPrefIncome > t0 ? LTCG_RATE_MID : 0
  }

  // ── Additional Medicare Tax (0.9%) — IRC §3101(b)(2) / Form 8959 ─────────────
  const addlMedThreshold  = getAddlMedicareThreshold(taxYear, status)
  const additionalMedicare = Math.round(
    Math.max(0, w2 + seEarningsSubject - addlMedThreshold) * ADDITIONAL_MEDICARE_TAX_RATE
  )

  // ── Net Investment Income Tax — IRC §1411 ─────────────────────────────────────
  // TAX-04 FIX: Internal variable renamed niitAmount (number) to avoid collision with
  // the return key niit (object). Dashboard.jsx uses niit.applies / niit.amount.
  // The plain number was not null/undefined so Dashboard's ?? operator never fired —
  // the NIIT line never rendered. Fixed by returning niit as an object below.
  const rentalNII  = isREP ? 0 : Math.max(0, rentalNet)
  const nii        = Math.max(0, intInc + divInc + Math.max(0, ltGain + stGain + unrec1250 + collectibles) + rentalNII)
  const niitAmount = calcNIIT(nii, agi, taxYear, status)

  // ── Child Tax Credit — IRC §24 ────────────────────────────────────────────────
  const numDependents        = parseInt(dependents) || 0
  const ctcPerChild          = getTable(taxYear).ctc?.perChild || 2000
  const ctcPhaseoutThreshold = (status === 'mfj' || status === 'qss') ? 400000 : 200000
  const ctcExcess            = Math.max(0, agi - ctcPhaseoutThreshold)
  const ctcReduction         = Math.ceil(ctcExcess / 1000) * 50
  const ctcRaw               = Math.max(0, numDependents * ctcPerChild - ctcReduction)
  const childCredit          = Math.min(ctcRaw, Math.max(0, fedTax + additionalMedicare + niitAmount))

  // ── AMT — Form 6251 ──────────────────────────────────────────────────────────
  const amt = calcAMT({
    taxableIncome, qbi, saltAmount: nv(saltAmount),
    isoBargainElement: hasISO ? nv(isoBargainElement) : 0,
    ltGain, qualDiv, regularTax: fedTax, status, taxYear,
    useItemized, itemized, stdDed,
  })

  // ── Total Tax ─────────────────────────────────────────────────────────────────
  // niitAmount (number) used here for arithmetic — not the return object
  const totalTax = Math.max(0, fedTax + seTax + additionalMedicare + niitAmount + amt - childCredit)

  const effectiveRate  = grossIncome > 0 ? (totalTax / Math.max(1, w2 + Math.max(0, k1Total))) : 0
  const withheld       = nv(w2Withheld)
  const estimated      = nv(estPaid)
  const totalPayments  = withheld + estimated
  const balance        = totalTax - totalPayments

  const quarterlyRecommended = balance > 0 ? Math.round(balance / 4) : 0

  // ── §6654(d)(1) Estimated Tax Safe Harbor ────────────────────────────────────
  const priorYearTaxAmt = Math.max(0, nv(priorYearTax))
  const priorYearAGIAmt = Math.max(0, nv(priorYearAGI))
  const agiBoundary       = status === 'mfs' ? 75000 : 150000
  const priorYearMultiplier = priorYearAGIAmt > agiBoundary ? 1.10 : 1.00
  const safeHarborCurrentYear = Math.round(totalTax * 0.90)
  const safeHarborPriorYear   = priorYearTaxAmt > 0
    ? Math.round(priorYearTaxAmt * priorYearMultiplier)
    : null
  const safeHarborMinimum  = safeHarborPriorYear !== null
    ? Math.min(safeHarborCurrentYear, safeHarborPriorYear)
    : safeHarborCurrentYear
  const safeHarborBalance  = Math.max(0, safeHarborMinimum - totalPayments)
  const safeHarborQuarterly = safeHarborBalance > 0 ? Math.round(safeHarborBalance / 4) : 0

  // ── F-H03: Per-entity income breakdown ───────────────────────────────────────
  const scheduleEK1Income = nonSEk1
  const scheduleCSEIncome = seNetIncome

  const entityIncomeBreakdown = entities.map(e => {
    if (!e) return null
    const isSEType = SE_SUBJECT_TYPES.includes(e.type)
    const income   = parseFloat(e.k1 ?? 0) || (parseFloat(e.netProfit || 0) * ((parseFloat(e.own) || 100) / 100))
    return {
      name:         e.name || e.id || 'Unnamed Entity',
      type:         e.type,
      income:       Math.round(income),
      ownership:    parseFloat(e.own) || 100,
      isSEType,
      scheduleForm: isSEType ? 'Schedule C' : 'Schedule E, Part II',
      taxForm:      isSEType ? '1040 Sch C' : 'K-1 (1120-S / 1065)',
    }
  }).filter(Boolean)

  // ── TAX-01: S-Corp Reasonable Compensation Alert ──────────────────────────────
  // Fires when the first S-Corp entity's officer salary is below
  // SCORP_REASONABLE_COMP_RATIO_THRESHOLD (40%) of total S-Corp compensation.
  // $20,000 de minimis floor — see Dashboard.jsx comment for rationale.
  // The ?? in Dashboard.calcDashboard prefers this value when non-null.
  // Dashboard's fallback IIFE remains as a guard for contexts where calcTaxReturn
  // is not available (e.g., the legacy Dashboard records view).
  const reasonableCompAlert = (() => {
    const scorp = entities.find(e => e && e.type === 'S Corporation')
    if (!scorp) return { triggered: false, ratio: 100, message: '' }
    const sal   = Math.max(0, parseFloat(scorp.pnl?.officerSalary ?? scorp.officerW2 ?? 0) || 0)
    if (sal < 0) return { triggered: false, ratio: 100, message: '' }
    const k1Val = Math.max(0,
      parseFloat(scorp.k1 ?? 0) ||
      Math.round((parseFloat(scorp.pnl?.netProfit || 0)) * ((parseFloat(scorp.own) || 100) / 100))
    )
    const totalComp = sal + k1Val
    if (totalComp < 20000) return { triggered: false, ratio: 100, message: '' }
    const ratio     = totalComp > 0 ? sal / totalComp : 1
    const triggered = ratio < SCORP_REASONABLE_COMP_RATIO_THRESHOLD
    return {
      triggered,
      ratio:   Math.round(ratio * 100),
      message: triggered
        ? `Officer salary ($${Math.round(sal).toLocaleString()}) is ${Math.round(ratio * 100)}% of total S-Corp compensation (salary + K-1). The IRS scrutinizes ratios below 40%. Ref: Rev. Rul. 74-44; Watson v. Commissioner, 668 F.3d 1008.`
        : '',
    }
  })()

  return {
    // ── F-C05: Timestamp ──────────────────────────────────────────────────────
    calculatedAt: Date.now(),

    grossIncome, agi,
    seNetIncome, seEarningsSubject, seTax, halfSE,
    selfEmpHealthDed, hsaDed, studentLoanDed, selfEmpRetirementDed, adjustments,
    stdDed, itemized, deduction,
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

    // TAX-04 FIX: niit is now an object { applies, amount, explanation }.
    // Dashboard.jsx uses niit.applies and niit.amount for conditional rendering.
    // The prior number return caused the ?? operator to never fire (number !== null/undefined)
    // so safeCalc.niit?.applies was always undefined and the NIIT line never rendered.
    niit: {
      applies:     niitAmount > 0,
      amount:      niitAmount,
      explanation: niitAmount > 0
        ? `3.8% on the lesser of net investment income ($${nii.toLocaleString()}) or excess MAGI above the $${getNIITThreshold(taxYear, status).toLocaleString()} threshold (IRC §1411)`
        : '',
    },
    // Backward-compat: raw number for TaxReturn.jsx until that file is updated
    // to reference result.niit.amount. Remove niitAmount alias once TaxReturn.jsx
    // is updated in fix/taxreturn-display PR.
    niitAmount,

    numDependents, childCredit, ctcRaw, ctcReduction, ctcPerChild,
    amt,
    totalTax, effectiveRate,
    withheld, estimated, totalPayments, balance, quarterlyRecommended,
    safeHarborCurrentYear,
    safeHarborPriorYear,
    safeHarborMinimum,
    safeHarborBalance,
    safeHarborQuarterly,
    priorQBILossCO,
    qbiCarryforward,
    nolAllowed,
    nolSurplus,
    ebl,
    palSuspendedRental,
    scheduleEK1Income,
    scheduleCSEIncome,
    entityIncomeBreakdown,

    // TAX-01: S-Corp reasonable compensation alert (centralized from Dashboard.jsx fallback IIFE).
    reasonableCompAlert,

    // TAX-06: All calculations in this file are federal income tax only.
    // State income tax is not computed. UI components must surface this to the user.
    federalOnly: true,
  }
}

export {
  TAX_TABLES,
  AMT_TABLES,
  SALT_CAPS,
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
  QBI_THRESHOLDS,
  QBI_PHASE_IN_RANGE,
  nv,
  calcTaxReturn,
}
