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
  // Aggregation under Reg. §1.199A-4 pools W-2 wages and QBI across entities.
  // It applies here when:
  //   (a) the caller has entities of different types (SE + non-SE), AND
  //   (b) we are above the §199A income threshold where the W-2 wage limit bites.
  // Without aggregation, a Schedule C entity with no W-2 wages would receive $0 QBI
  // above the threshold. With aggregation, the S-Corp's W-2 wages offset the limit
  // for the combined business income — but only if the Reg. §1.199A-4 election is made.
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

  // Shared early-exit helper used on multiple return paths below
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
  const incomeLimitation = Math.max(0, taxableBeforeQBI - netCapGain) * QBI_DEDUCTION_RATE  // §199A(a)(2) — applied LAST in Step 3
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

  // §199A(d)(3) SSTB applicable percentage — 100% at threshold, 0% at threshold+phaseInRange.
  // Applied per-entity so mixed SSTB + non-SSTB filers correctly exclude only the SSTB portion.
  const sstbApplicablePct = Math.max(0, 1 - phasePercent)

  // SSTB entities' contribution to aggregate QBI
  const sstbEntityQBI = entityQbiData.reduce((s, e) => {
    if (!e.box17V_sstb) return s
    const k1Income = parseFloat(
      e.k1 ?? Math.round(parseFloat(e.netProfit || 0) * ((parseFloat(e.own) || 100) / 100))
    ) || 0
    return s + Math.max(0, k1Income)
  }, 0)

  // Reduce aggregate QBI by SSTB exclusion
  const adjQBI           = Math.max(0, qbiIncome - sstbEntityQBI * (1 - sstbApplicablePct))
  const scaledQbiComponent = adjQBI * QBI_DEDUCTION_RATE
  const activeQbiForFloor  = activeQbi !== undefined ? activeQbi : adjQBI

  // ── §199A(b)(2) W-2 wage and UBIA limitation ──────────────────────────────
  // Box 17V wages: use explicitly-entered K-1 wages when available.
  // F5-03 FIX: If no Box 17V wages have been entered for an entity but the officer W-2
  // salary IS known (entered in Step 1), use it as a proxy. The officer salary qualifies
  // as "wages paid by the qualified trade or business" under IRC §199A(b)(4) and
  // Treas. Reg. §1.199A-2(b)(2). Box 17V from the actual K-1 should be entered when
  // available for maximum accuracy — this fallback prevents a silent 20%-uncapped result
  // for S-Corp owners who entered their officer salary but not the K-1 Box 17V figure.
  //
  // F-C02 NOTE: When aggregationApplied=true, the W-2 wages from the S-Corp entity
  // offset the Schedule C entity's lack of wages. This is valid ONLY if the Reg. §1.199A-4
  // aggregation election has been made. The aggregationDisclosure string above surfaces
  // this assumption to the user via TaxReturn.jsx and AIAnalysis.jsx.
  const totalWages = entityQbiData.reduce((s, e) => {
    const w = parseFloat(e.box17V_wages) || parseFloat(e.officerW2) || 0  // F5-03: officerW2 fallback
    return s + (e.box17V_sstb ? w * sstbApplicablePct : w)
  }, 0)
  const totalUBIA = entityQbiData.reduce((s, e) => {
    const u = parseFloat(e.box17V_ubia) || 0
    return s + (e.box17V_sstb ? u * sstbApplicablePct : u)
  }, 0)

  // Backward-compat fallback: if neither Box 17V wages/UBIA nor officer W-2 are available,
  // fall back to the scaled 20% amount. TaxReturn.jsx surfaces a warning in this state.
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

  // Wage/UBIA limit per §199A(b)(2): greater of 50% wages OR 25% wages + 2.5% UBIA
  const wageLimit = Math.max(
    totalWages * W2_WAGE_LIMIT_RATE,
    totalWages * W2_WAGE_ALT_RATE + totalUBIA * UBIA_RATE
  )

  // §199A(b)(3)(B) phase-in: linear between threshold and threshold+phaseInRange
  let limitedAmount, wageBindingActive
  if (excessOverThreshold >= phaseInRange) {
    limitedAmount     = Math.min(scaledQbiComponent, wageLimit)
    wageBindingActive = wageLimit < scaledQbiComponent
  } else {
    const reduction   = Math.max(0, scaledQbiComponent - wageLimit) * phasePercent
    limitedAmount     = scaledQbiComponent - reduction
    wageBindingActive = reduction > 0
  }

  // §199A(a)(2) overall taxable income cap — applied LAST (Step 3 per constants.js architecture)
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
// Officer W-2 salary data flow (F4-04):
//   The officer W-2 salary entered in Step 1 (CalculateTaxInner.jsx) is passed here
//   as `w2` (along with any non-S-Corp W-2 wages). It is:
//     1. Included in grossIncome as regular W-2 compensation (IRC §61(a)(1))
//     2. Subject to FICA via the employer payroll tax at the entity level (not SE tax)
//     3. NOT subject to SE tax — S-Corp is excluded from SE_SUBJECT_TYPES (IRC §1402(a))
//     4. Used as the §199A(b)(2) W-2 wage proxy in calcQBI via e.officerW2 (F5-03)
//   The K-1 ordinary business income is SEPARATE from the W-2 and passes through to
//   Schedule E Part II (not subject to SE tax for S-Corp shareholders per IRC §1402(a)(2)).
//
// F-H03 income routing audit trail:
//   seNetIncome  — sum of K-1 income from SE_SUBJECT_TYPES only (Schedule C / Sole Prop).
//                  Subject to SE tax (IRC §1401). Flows to Schedule C, then Schedule 1.
//   nonSEk1      — sum of K-1 income from non-SE types (S-Corp / Partnership).
//                  NOT subject to SE tax (IRC §1402(a)(2)). Flows to Schedule E, Part II.
//   Both values are returned separately so TaxReturn.jsx can display them as distinct
//   waterfall rows with correct form labels. See scheduleEK1Income / scheduleCSEIncome below.
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
    // §6654 prior year safe harbor inputs (F5-04)
    priorYearTax,   // total tax liability from the prior year return
    priorYearAGI,   // AGI from the prior year return (determines 100% vs 110% multiplier)
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

  // §1250 recapture and collectibles gains — moved before grossIncome so they are
  // correctly included in AGI and the NIIT base (Treas. Reg. §1.1411-4(d)(4)(ii)).
  const unrec1250   = Math.max(0, nv(unrecap1250))
  const collectibles = Math.max(0, nv(collectiblesGain))

  // ── Self-Employment Tax — IRC §1401 ─────────────────────────────────────────
  // F-H03 AUDIT TRAIL: SE tax is calculated ONLY on entities whose type is in
  // SE_SUBJECT_TYPES (imported from constants.js). This explicitly excludes:
  //   - S-Corporations: IRC §1402(a)(2) — K-1 income from S-Corp is not SE income.
  //   - Partnerships/LLCs taxed as partnerships: general partners are SE; limited
  //     partners are excluded per IRC §1402(a)(13) (handled via entity type flag).
  // Officer W-2 salary from an S-Corp is subject to FICA at the entity level (payroll
  // taxes remitted by the S-Corp); it is NOT re-assessed as SE tax on the personal return.
  // This is the correct treatment per Rev. Rul. 59-221 and IRC §1402(a)(2).
  const seNetIncome = entities.reduce((sum, e) => {
    if (!e || !SE_SUBJECT_TYPES.includes(e.type)) return sum
    return sum + Math.max(0, parseFloat(e.k1) || 0)
  }, 0)

  const ssWageBase = TAX_TABLES[taxYear]?.ssWageBase || 176100
  // SE earnings base = net SE income × 0.9235.
  // 0.9235 = 1 − FICA_SS_RATE − FICA_MEDICARE_RATE (per-employee-side rates: 6.2% + 1.45% = 7.65%)
  // This factor represents the economic effect of the above-the-line SE deduction reducing
  // the tax base before the SE tax itself is computed — IRC §1402(a); Treas. Reg. §1.1402(a)-1.
  // Expressed with live constants so the factor stays correct if FICA rates ever change.
  const seEarningsSubject = seNetIncome * (1 - FICA_SS_RATE - FICA_MEDICARE_RATE)
  const ssPortion     = Math.min(seEarningsSubject, ssWageBase) * (FICA_SS_RATE * 2)      // 12.4% combined
  const medicarePortion = seEarningsSubject * (FICA_MEDICARE_RATE * 2)                    // 2.9% combined
  const seTax         = Math.round(ssPortion + medicarePortion)
  // §164(f) above-the-line deduction: 50% of SE tax — SE_TAX_DEDUCTION_RATE from constants.js
  const halfSE        = Math.round(seTax * SE_TAX_DEDUCTION_RATE)

  // ── Above-the-line deductions ────────────────────────────────────────────────
  const selfEmpHealthDed    = ytdScale(selfEmpHealthIns)
  const hsaDed              = ytdScale(hsaDeduction)
  const studentLoanDed      = Math.min(ytdScale(studentLoanInt), 2500)
  const selfEmpRetirementDed = ytdScale(selfEmpRetirement)
  const adjustments         = halfSE + selfEmpHealthDed + hsaDed + studentLoanDed + selfEmpRetirementDed

  const stdDed  = getStdDed(taxYear, status)
  const itemized = nv(itemizedAmt)
  const deduction = useItemized ? Math.max(stdDed, itemized) : stdDed

  // grossIncomeBeforeNOL includes unrec1250 + collectibles — §61(a)(3) / Treas. Reg. §1.61-6.
  // They are carved back out of ordinaryTaxableIncome later and taxed at 25%/28% preferential rates.
  const grossIncomeBeforeNOL = w2 + k1Total + palAdjustedRental + stGain + ltGain
    + unrec1250 + collectibles + intInc + divInc + f4797Inc + taxableSS + iraIncome + ebl

  // §172(a)(2) NOL 80% cap — post-2017 NOL carryforwards limited to 80% of taxable income.
  // Note: TaxStat360 cannot distinguish pre-2018 (unlimited) from post-2017 (80%-limited)
  // NOLs without a separate user input; 80% cap applied to full amount as planning-safe default.
  const taxableBeforeNOL = Math.max(0, grossIncomeBeforeNOL - adjustments - deduction)
  const priorNOL    = Math.max(0, nv(nolCarryforward))
  const nolAllowed  = Math.min(priorNOL, Math.floor(taxableBeforeNOL * 0.80))
  const nolSurplus  = priorNOL - nolAllowed

  const grossIncome     = grossIncomeBeforeNOL - nolAllowed
  const agi             = grossIncome - adjustments
  const taxableBeforeQBI = taxableBeforeNOL - nolAllowed

  // SSTB applicable percentage (needed for per-entity nonSEk1 scaling)
  const _sstbThresholds  = QBI_THRESHOLDS[taxYear]  || QBI_THRESHOLDS[2025]
  const _sstbPhaseIn     = QBI_PHASE_IN_RANGE[taxYear] || QBI_PHASE_IN_RANGE[2025]
  const qbiThreshold     = _sstbThresholds[status]  || _sstbThresholds.single
  const qbiPhaseRange    = _sstbPhaseIn[status]     || _sstbPhaseIn.single
  const sstbApplicablePct = taxableBeforeQBI <= qbiThreshold
    ? 1
    : Math.max(0, 1 - Math.min(1, (taxableBeforeQBI - qbiThreshold) / qbiPhaseRange))

  // F-H03: nonSEk1 = S-Corp / Partnership K-1 income only → Schedule E, Part II
  // seNetIncome (computed above) = Schedule C / Sole Prop income only → Schedule C
  // These are kept separate throughout and labeled correctly in the return object.
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

  // ── F-C02: Determine whether multi-entity aggregation is occurring ──────────
  // hasMultiEntityTypes is true when the entity list spans both SE types (Schedule C)
  // and non-SE types (S-Corp / Partnership). When true and above the QBI threshold,
  // calcQBI will set aggregationApplied=true and return a disclosure string.
  const hasMultiEntityTypes = entities.length > 1
    && entities.some(e => e && SE_SUBJECT_TYPES.includes(e.type))
    && entities.some(e => e && !SE_SUBJECT_TYPES.includes(e.type))

  const _qbiResult  = calcQBI(qbiBasis, taxableBeforeQBI, prefIncome, {
    status,
    taxYear,
    entityQbiData:    entities,
    hasMultiEntityTypes,             // F-C02: aggregation disclosure flag
  })
  const qbi                    = _qbiResult.deduction
  const qbiLimitApplied        = _qbiResult.limitApplied
  const qbiCaps                = _qbiResult.caps
  const qbiAggregationApplied  = _qbiResult.aggregationApplied   // F-C02
  const qbiAggregationDisclosure = _qbiResult.aggregationDisclosure // F-C02
  const qbiCarryforward        = qbiBasis < 0 ? Math.abs(qbiBasis) : 0

  // Split income into ordinary vs preferential
  const totalPrefIncome      = Math.max(0, ltGain) + Math.max(0, qualDiv) + unrec1250 + collectibles
  const taxableAfterQBI      = Math.max(0, taxableBeforeQBI - qbi)
  const ordinaryTaxableIncome = Math.max(0, taxableAfterQBI - totalPrefIncome)
  const taxableIncome        = taxableAfterQBI

  // ── Federal income tax on ordinary income ────────────────────────────────────
  const ordFedTax = calcFederalTax(ordinaryTaxableIncome, taxYear, status)

  // ── Preferential tax via QDCGTW — IRC §1(h) ─────────────────────────────────
  const prefTax = calcPreferentialTax(ordinaryTaxableIncome, {
    ltcg:        Math.min(Math.max(0, ltGain),       taxableAfterQBI),
    qualDiv:     Math.min(Math.max(0, qualDiv),       taxableAfterQBI),
    unrecap1250: Math.min(unrec1250,                  taxableAfterQBI),
    collectibles: Math.min(collectibles,              taxableAfterQBI),
  }, taxYear, status)

  const fedTax = ordFedTax + prefTax

  // ── Marginal rate on ordinary income ─────────────────────────────────────────
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
  // F-H06 DISPLAY NOTE: This is a SEPARATE tax from Form 6251 AMT (calcAMT above).
  // TaxReturn.jsx must display this as its own labeled row ("Additional Medicare Tax
  // (0.9%) — Form 8959") so users understand why both `additionalMedicare` and `amt`
  // can be $0 independently. At the test case income level:
  //   W-2 ($70,000) + SE earnings subject ($110,820) = $180,820 < $200,000 threshold
  //   → additionalMedicare = $0 (correct; threshold not reached)
  // Higher-income users (W-2 + SE > $200K single / $250K MFJ) will see this populated.
  const addlMedThreshold  = getAddlMedicareThreshold(taxYear, status)
  const additionalMedicare = Math.round(
    Math.max(0, w2 + seEarningsSubject - addlMedThreshold) * ADDITIONAL_MEDICARE_TAX_RATE
  )

  // ── Net Investment Income Tax — IRC §1411 ─────────────────────────────────────
  // unrec1250 and collectibles included per Treas. Reg. §1.1411-4(a)(1)(i) and §1.1411-4(d)(4)(ii).
  const rentalNII = isREP ? 0 : Math.max(0, rentalNet)
  const nii       = Math.max(0, intInc + divInc + Math.max(0, ltGain + stGain + unrec1250 + collectibles) + rentalNII)
  const niit      = calcNIIT(nii, agi, taxYear, status)

  // ── Child Tax Credit — IRC §24 (as amended by OBBBA P.L. 119-21 §70301) ─────
  const numDependents        = parseInt(dependents) || 0
  const ctcPerChild          = getTable(taxYear).ctc?.perChild || 2000
  const ctcPhaseoutThreshold = (status === 'mfj' || status === 'qss') ? 400000 : 200000
  const ctcExcess            = Math.max(0, agi - ctcPhaseoutThreshold)
  const ctcReduction         = Math.ceil(ctcExcess / 1000) * 50
  const ctcRaw               = Math.max(0, numDependents * ctcPerChild - ctcReduction)
  const childCredit          = Math.min(ctcRaw, Math.max(0, fedTax + additionalMedicare + niit))

  // ── AMT — Form 6251 ──────────────────────────────────────────────────────────
  const amt = calcAMT({
    taxableIncome, qbi, saltAmount: nv(saltAmount),
    isoBargainElement: hasISO ? nv(isoBargainElement) : 0,
    ltGain, qualDiv, regularTax: fedTax, status, taxYear,
    useItemized, itemized, stdDed,
  })

  // ── Total Tax ─────────────────────────────────────────────────────────────────
  const totalTax = Math.max(0, fedTax + seTax + additionalMedicare + niit + amt - childCredit)

  const effectiveRate  = grossIncome > 0 ? (totalTax / Math.max(1, w2 + Math.max(0, k1Total))) : 0
  const withheld       = nv(w2Withheld)
  const estimated      = nv(estPaid)
  const totalPayments  = withheld + estimated
  const balance        = totalTax - totalPayments

  const quarterlyRecommended = balance > 0 ? Math.round(balance / 4) : 0

  // ── §6654(d)(1) Estimated Tax Safe Harbor — F5-04 ────────────────────────────
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

  // ── F-H03: Per-entity income breakdown for display routing ───────────────────
  // TaxReturn.jsx uses entityIncomeBreakdown to render the income waterfall with
  // correct form labels per entity type instead of a combined "K-1 Ordinary Business
  // Income" line. AIAnalysis.jsx uses it for accurate Filing Map card amounts.
  // scheduleEK1Income — S-Corp / Partnership K-1 → Schedule E, Part II
  // scheduleCSEIncome — Sole Prop / SMLLC net profit → Schedule C
  const scheduleEK1Income = nonSEk1         // S-Corp K-1; exempt from SE tax per IRC §1402(a)(2)
  const scheduleCSEIncome = seNetIncome     // Schedule C net profit; subject to SE tax per IRC §1401

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

  return {
    // ── F-C05: Timestamp for stale-data detection in AIAnalysis.jsx ─────────
    // AIAnalysis compares calculatedAt against savedRecord.savedAt.
    // If calculatedAt > savedAt, show: "⚠ Analysis based on last saved record."
    calculatedAt: Date.now(),

    grossIncome, agi,
    seNetIncome, seEarningsSubject, seTax, halfSE,
    selfEmpHealthDed, hsaDed, studentLoanDed, selfEmpRetirementDed, adjustments,
    stdDed, itemized, deduction,
    unrec1250, collectibles,
    nonSEk1, seK1AfterAdjustments, qbiBasis, taxableBeforeQBI, prefIncome,
    qbi, qbiLimitApplied, qbiCaps,
    qbiAggregationApplied,   // F-C02: drives UI disclosure in TaxReturn.jsx + AIAnalysis.jsx
    qbiAggregationDisclosure, // F-C02: disclosure text string
    totalPrefIncome, taxableAfterQBI, ordinaryTaxableIncome, taxableIncome,
    ordFedTax, prefTax, fedTax,
    marginalRate,
    addlMedThreshold,
    additionalMedicare,      // F-H06: IRC §3101(b)(2), Form 8959 — display as separate row in TaxReturn.jsx
    rentalNII, nii, niit,
    numDependents, childCredit, ctcRaw, ctcReduction, ctcPerChild,
    amt,                     // F-H06: Form 6251 AMT — distinct from additionalMedicare; label separately in UI
    totalTax, effectiveRate,
    withheld, estimated, totalPayments, balance, quarterlyRecommended,
    // §6654 safe harbor outputs — F5-04
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
    // ── F-H03: Income routing for display ────────────────────────────────────
    scheduleEK1Income,       // S-Corp K-1 only → Schedule E, Part II
    scheduleCSEIncome,       // Schedule C only → Schedule C (subject to SE tax)
    entityIncomeBreakdown,   // per-entity array: { name, type, income, scheduleForm, ... }
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
