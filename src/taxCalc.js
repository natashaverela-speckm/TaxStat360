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
// getLTCGThresholds, getNIITThreshold, getAddlMedicareThreshold, getMarginalRate, nv
//
// ── Audit-fix change log ────────────────────────────────────────────────────
// TAX-10 FIX (seEarningsSubject formula):
// seEarningsSubject was computed as seNetIncome * (1 - FICA_SS_RATE - FICA_MEDICARE_RATE).
// This produces 0.9235 coincidentally (0.062 + 0.0145 = 0.0765; 1 - 0.0765 = 0.9235)
// but is semantically wrong — the 92.35% factor is the statutory IRC §1402(a)(12)
// net earnings factor, not derived from FICA rates. If FICA rates ever change
// (e.g. temporary payroll tax relief legislation), this formula would silently produce
// an incorrect result. SE_NET_EARNINGS_FACTOR = 0.9235 already exists in constants.js
// and is already used correctly in ficaSavings. Now used here too for consistency.
//
// TAX-08 / F-07 FIX (quarterlyRecommended safe harbor floor):
// quarterlyRecommended was computed as balance / 4 before the safe harbor figures
// were calculated. This could show a lower quarterly amount than the IRC §6654 safe
// harbor requires, leading users to underpay and incur penalties. Fix: moved
// quarterlyRecommended to after the safe harbor calculations and uses
// Math.max(balance/4, safeHarborQuarterly) so it never falls below the safe harbor.
//
// F-M02 (0% ownership falsy bug):
// All instances of (parseFloat(e.own) || 100) / 100 replaced with ownPct(e.own) / 100.
//
// F-M03 (retirement plan limits in TAX_TABLES):
// TAX_TABLES[year] now includes a retirement object with year-specific dollar limits.
//
// F-04 (§469 prior passive loss carryforward):
// calcTaxReturn now accepts priorPassiveLossCarryforward (Form 8582, Line 3).
//
// F-C02 (QBI aggregation disclosure):
// calcQBI now accepts opts.hasMultiEntityTypes and returns aggregationApplied /
// aggregationDisclosure.
//
// F-C05 (stale AI Analysis data):
// calcTaxReturn return object now includes calculatedAt (Date.now()).
//
// F-H03 (income display split — Schedule C vs Schedule E):
// calcTaxReturn return now includes scheduleEK1Income, scheduleCSEIncome,
// entityIncomeBreakdown.
//
// AUDIT FIX (fix/tax-engine-accuracy):
// TAX-01: reasonableCompAlert added to calcTaxReturn return.
// TAX-04: niit return format changed to { applies, amount, explanation } object.
// TAX-06: federalOnly: true added to return.
//
// PASS4B-01 (AMT 2026 MFS bracket typo): 'mhs' → 'mfs' fixed.
// PASS4B-02 (§1366(d) / §704(d) shareholder basis limitation): implemented.
// EBL-FIX (§461(l) non-REP passive exclusion): eblBiz excludes non-REP rental.
// T-01 FIX (ficaSavings 92.35% SE tax factor): seEarningsOnDist uses SE_NET_EARNINGS_FACTOR.
// T-06 FIX (mileageRate added to TAX_TABLES).
//
// MED-FLOOR (IRC §213(a) medical 7.5%-of-AGI floor):
// calcTaxReturn now accepts an OPTIONAL `medicalExpenses` input (raw, pre-floor).
// When provided, only the portion above 7.5% of AGI (figured before the itemized
// deduction) is added to the itemized total; the result object exposes
// `deductibleMedical` so the UI can display the floored amount. When omitted, the
// itemized total is unchanged, so all existing callers and tests are unaffected.
// Previously TaxReturn.jsx summed raw medical into itemizedAmt and the tooltip
// claimed the floor was "applied automatically" — it was not, overstating itemized
// deductions in any positive-AGI year. This fix makes that true.
//
// PASS4B-02b-fix (§1368 income-entity distribution gap):
// The non-limiting branch of the entityBasisResults pass previously omitted
// stockBasis / debtBasis from the pushed result object. For profitable entities
// (k1Gross >= 0) that entered basis data, the distribution loop could not find
// the basis in basisResult and fell back to excessCapGain: null (amber prompt).
// Fix: spread stockBasis / debtBasis into the non-limiting push when hasBasisInput
// is true. The hasBasisEntry guard (basisResult.stockBasis !== undefined) now
// correctly resolves for income entities, enabling full §1368 computation.
// No change for entities where basis was not entered — stockBasis remains absent
// from the pushed result so hasBasisEntry = false (amber prompt, correct).
//
// PASS4B-02b (§1368(b)(2) S-Corp distribution capital gain):
// S-Corp distributions that exceed a shareholder's remaining stock basis (after the
// current year's income/loss allocation) are taxable as long-term capital gain
// (IRC §1368(b)(2)). Previously, distributions were not modeled at all in the engine.
// Fix: after the §1366(d) basis limitation pass, compute excessDistribution for each
// S-Corp entity where both e.stockBasis AND e.distributions are provided. The excess
// is accumulated in distributionCapGain and added to ltGain via _ltGain, which is
// threaded through all subsequent capital gain and NIIT calculations. When distributions
// are entered but no stockBasis is provided, we flag the entity in
// entityDistributionResults with excessCapGain: null (cannot determine taxable portion
// without basis) — no phantom tax is added. entityDistributionResults is included in
// the return object so TaxReturn.jsx and AIAnalysis.jsx can surface the disclosure.
//
// #11 FIX (§461(l)(3)(B) capital-gain inclusion limit):
// Business capital gains netted into the EBL base are now capped at the lesser of
// business capital-gain net income or overall capital-gain net income. See the EBL
// block in calcTaxReturn. No-op when the limit does not bind (the common case).
//
// #12 FIX (§199A rental QBI for REP):
// REP rentals (a non-passive §162 trade/business) now contribute their full net —
// income AND loss — to the QBI base, instead of only positive net. See qbiBasis.
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
  SE_NET_EARNINGS_FACTOR,
  SCORP_REASONABLE_COMP_RATIO_THRESHOLD,
} from './constants.js'
import { normalizeEntityType, isRealEstateEntity } from './utils/entityPredicates.js'

// ── IRS Tax Tables 2024-2026 ──────────────────────────────────────────────────
const nv = (v) => parseFloat(v) || 0
const ownPct = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 100 }

const TAX_TABLES = {
  2024: {
    std: { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900, qss: 29200 },
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
    mileageRate: 0.67,
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
    niit:    { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    addlMed: { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
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
    mileageRate: 0.70,
  },
  2026: {
    std: { single: 16100, mfj: 32200, mfs: 16100, hoh: 24150, qss: 32200 },
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
    ebl: { single:320000, mfj:640000, mfs:320000, hoh:320000, qss:640000 },
    ctc: { perChild: 2200 },
    retirement: {
      sepIraMax:        71000,
      solo401kDeferral: 24000,
      solo401kMax:      71000,
      catchUp401k:       7500,
      catchUp401kSuper: 11250,
      iraLimit:          7000,
      catchUpIra:        1000,
    },
    // IRS Notice 2026-10 (released Dec 29, 2025) — 72.5¢/mile for business use (up 2.5¢ from 2025).
    mileageRate: 0.725,
  },
}

// ── AMT Tables — Form 6251 — IRC §55-59 ──────────────────────────────────────
const AMT_TABLES = {
  2024: {
    exemption:    { single:85700,  mfj:133300, mfs:66650,  hoh:85700,  qss:133300 },
    phaseoutStart:{ single:609350, mfj:1218700,mfs:609350, hoh:609350, qss:1218700 },
    phaseoutRate: 0.25,
    bracket26_28: { single:232600, mfj:232600, mfs:116300, hoh:232600, qss:232600 },
  },
  2025: {
    exemption:    { single:88100,  mfj:137000, mfs:68650,  hoh:88100,  qss:137000 },
    phaseoutStart:{ single:626350, mfj:1252700,mfs:626350, hoh:626350, qss:1252700 },
    phaseoutRate: 0.25,
    bracket26_28: { single:239100, mfj:239100, mfs:119550, hoh:239100, qss:239100 },
  },
  2026: {
    exemption:    { single:90100,  mfj:140200, mfs:70100,  hoh:90100,  qss:140200 },
    phaseoutStart:{ single:500000, mfj:1000000,mfs:500000, hoh:500000, qss:1000000 },
    phaseoutRate: 0.50,
    // PASS4B-01 FIX: was 'mhs: 122250' (typo) — corrected to 'mfs: 122250'.
    bracket26_28: { single:244500, mfj:244500, mfs:122250, hoh:244500, qss:244500 },
  },
}

// SALT deduction caps — IRC §164(b)(6) as amended by OBBBA §70106
const SALT_CAPS = { 2024: 10000, 2025: 40000, 2026: 40400 }

function getTable(year) { return TAX_TABLES[year] || TAX_TABLES[2025] }
function getStdDed(year, fs) { const t = getTable(year).std; return t[fs] || t.single }
function getBrackets(year, fs) { const t = getTable(year).brackets; return t[fs] || t.single }
function getLTCGThresholds(year, fs) { const t = getTable(year).ltcg; return t[fs] || t.single }
function getNIITThreshold(year, fs) { const t = getTable(year).niit; return t[fs] || 200000 }
function getAddlMedicareThreshold(year, fs) { const t = getTable(year).addlMed; return t[fs] || 200000 }

function getMarginalRate(taxable, year, fs) {
  let rate = 0.10, prev = 0
  for (const [cap, r] of getBrackets(year, fs)) {
    if (taxable > prev) rate = r
    prev = cap
  }
  return rate
}

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

function calcPreferentialTax(ordinaryIncome, prefItems, year, fs) {
  const { ltcg = 0, qualDiv = 0, unrecap1250 = 0, collectibles = 0 } = prefItems
  const [threshold0, threshold15] = getLTCGThresholds(year, fs)
  let tax = 0

  const totalPref = ltcg + qualDiv
  if (totalPref <= 0 && unrecap1250 <= 0 && collectibles <= 0) return 0

  const ordFloor = Math.max(0, ordinaryIncome)

  if (totalPref > 0) {
    const zeroRoom    = Math.max(0, threshold0  - ordFloor)
    const atZero      = Math.min(totalPref, zeroRoom)
    const fifteenRoom = Math.max(0, threshold15 - Math.max(ordFloor, threshold0))
    const remaining15 = totalPref - atZero
    const atFifteen   = Math.min(remaining15, fifteenRoom)
    const atTwenty    = totalPref - atZero - atFifteen
    tax += atFifteen * LTCG_RATE_MID
    tax += atTwenty  * LTCG_RATE_HIGH
  }
  if (unrecap1250 > 0) tax += unrecap1250 * 0.25
  if (collectibles > 0) tax += collectibles * 0.28

  return Math.round(tax)
}

function calcNIIT(nii, agi, year, fs) {
  const threshold = getNIITThreshold(year, fs)
  if (agi <= threshold || nii <= 0) return 0
  const excessAGI = agi - threshold
  return Math.round(Math.min(nii, excessAGI) * NIIT_RATE)
}

function calcAMT({ taxableIncome, qbi, saltAmount, isoBargainElement, ltGain, qualDiv, regularTax, status, taxYear, useItemized, itemized, stdDed }) {
  const amtTable    = AMT_TABLES[taxYear] || AMT_TABLES[2025]
  const baseSaltCap = SALT_CAPS[taxYear] || SALT_CAPS[2025]
  const saltCap     = status === 'mfs' ? baseSaltCap / 2 : baseSaltCap
  const isItemizing  = useItemized && itemized > stdDed
  const saltAddback  = isItemizing ? Math.min(Math.max(0, saltAmount), saltCap) : 0
  const isoAddback   = Math.max(0, isoBargainElement || 0)
  const amti         = Math.max(0, taxableIncome) + Math.max(0, qbi) + saltAddback + isoAddback

  const phaseoutOver = Math.max(0, amti - amtTable.phaseoutStart[status])
  const exemption    = Math.max(0, amtTable.exemption[status] - phaseoutOver * amtTable.phaseoutRate)
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

// ── §199A QBI Tables ───────────────────────────────────────────────────────────
const QBI_THRESHOLDS = {
  2024: { single:191950, mfj:383900, hoh:191950, mfs:191950 },
  2025: { single:197300, mfj:394600, hoh:197300, mfs:197300 },
  2026: { single:201775, mfj:403500, hoh:201775, mfs:201775 },
}

const QBI_PHASE_IN_RANGE = {
  2024: { single:50000, mfj:100000, hoh:50000, mfs:50000 },
  2025: { single:50000, mfj:100000, hoh:50000, mfs:50000 },
  2026: { single:75000, mfj:150000, hoh:75000, mfs:75000 },
}

// §199A minimum deduction — OBBBA §70101, effective 2026 only.
// No entry for 2025 is intentional: the $400 minimum did not exist pre-OBBBA.
// If _applyMinQBI is called for taxYear=2025, floor/threshold are null and
// the function returns the result unchanged (correct behavior).
const QBI_MIN_DEDUCTION = { 2026: 400 }
const QBI_MIN_THRESHOLD = { 2026: 1000 }

function _applyMinQBI(result, activeQbiForFloor, taxYear, taxableBeforeQBI = Infinity) {
  const floor     = QBI_MIN_DEDUCTION[taxYear]
  const threshold = QBI_MIN_THRESHOLD[taxYear]
  if (floor == null || threshold == null) return result
  if (activeQbiForFloor < threshold) return result
  // §199A minimum deduction cannot exceed taxable income — a $0 taxable income
  // means no QBI benefit regardless of the minimum floor (OBBBA §70101).
  if (taxableBeforeQBI <= 0) return result
  const effectiveFloor = Math.min(floor, taxableBeforeQBI)
  if (result.deduction >= effectiveFloor) return { ...result, caps: { ...result.caps, min400: floor } }
  return { deduction: effectiveFloor, limitApplied: 'min400', caps: { ...result.caps, min400: floor } }
}

function calcQBI(qbiIncome, taxableBeforeQBI, capitalGains, opts = {}) {
  // §199A(a)(2): QBI deduction cannot exceed 20% of taxable income reduced by net capital gains.
  // This is the final ceiling applied AFTER all other limitations (W-2/UBIA, SSTB, minimum floor).
  // Enforced as a post-calculation assertion on the raw _calcQBI result.
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
    // C-02 FIX: nv() handles empty strings; e.k1 = "" yields NaN via parseFloat directly
    const k1Income = nv(e.k1) || Math.round(nv(e.pnl?.netProfit ?? e.netProfit) * (ownPct(e.own) / 100))
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

function calcTaxReturn(input) {
  const {
    taxYear, status, dependents,
    entities: _rawEntities = [],
    w2 = 0, k1Total = 0, rentalNet = 0,
    stGain = 0, ltGain = 0, intInc = 0, divInc = 0, qualDiv = 0,
    f4797Inc = 0, taxableSS = 0, iraIncome = 0,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward, priorYearQBILoss,
    useItemized, itemizedAmt, saltAmount, medicalExpenses,
    hasISO, isoBargainElement,
    isREP,
    isActiveParticipant = true,
    unrecap1250, collectiblesGain,
    w2Withheld, estPaid,
    ytdFactor = 1,
    priorYearTax,
    priorYearAGI,
    priorPassiveLossCarryforward = 0,
  } = input

  // AUDIT FIX (entity-type mismatch): the Step-1 UI emits friendly labels
  // ("Sole Proprietor / SMLLC", "Partnership / LLC") that do not match the engine's
  // exact-match SE_SUBJECT_TYPES / PASSTHROUGH_ENTITY_TYPES arrays — so without this
  // normalization sole props & partnerships silently received NO self-employment tax.
  // Canonicalize every entity's type before any classification below.
  const entities = _rawEntities.map(e => (e ? { ...e, type: normalizeEntityType(e.type) } : e))

  const ytdScale = (val) => Math.round(nv(val) * ytdFactor)
  const priorQBILossCO = Math.abs(nv(priorYearQBILoss))

  // ── PASS4B-02: §1366(d) / §704(d) Shareholder Basis Limitation ────────────
  // For each S-Corp or Partnership entity, if the user has entered a stock basis
  // and the entity has a loss, limit the deductible loss to (stockBasis + debtBasis).
  // The remainder is suspended and carried forward per IRC §1366(d)(2).
  // entityBasisResults records each entity's outcome for display in TaxReturn.jsx
  // and AIAnalysis.jsx.
  const entityBasisResults = []
  const entitiesLimited = entities.map(e => {
    if (!e) return e

    const own = ownPct(e.own) / 100
    const k1Gross = e.k1 !== undefined
      ? parseFloat(e.k1) || 0
      : Math.round((parseFloat(e.pnl?.netProfit) || 0) * own)

    const isLimitable = /s.?corp|partner/i.test(e.type || '')
    const hasBasisInput = (
      e.stockBasis !== undefined && e.stockBasis !== null &&
      e.stockBasis !== '' && e.stockBasis !== 0 ||
      String(e.stockBasis) === '0'
    )

    if (!isLimitable || k1Gross >= 0 || !hasBasisInput) {
      // PASS4B-02b FIX: also store stockBasis/debtBasis when the user has entered
      // them, even for profitable entities (k1Gross >= 0) that don't need loss
      // limitation. Without this, the §1368 distribution capital gain loop below
      // cannot find the basis for income entities and falls back to the amber
      // "enter basis to compute" prompt even though basis was provided.
      const sbPassthrough = hasBasisInput ? Math.max(0, parseFloat(e.stockBasis) || 0) : undefined
      const dbPassthrough = hasBasisInput ? Math.max(0, parseFloat(e.debtBasis)  || 0) : undefined
      entityBasisResults.push({
        name: e.name || e.id || 'Entity', type: e.type,
        k1Gross, k1Allowed: k1Gross, suspended: 0,
        ...(sbPassthrough !== undefined ? { stockBasis: sbPassthrough, debtBasis: dbPassthrough } : {}),
      })
      return e
    }

    const sb          = Math.max(0, parseFloat(e.stockBasis) || 0)
    const db          = Math.max(0, parseFloat(e.debtBasis)  || 0)
    const totalBasis  = sb + db
    const grossLoss   = Math.abs(k1Gross)
    const allowedLoss = Math.min(grossLoss, totalBasis)
    const suspended   = grossLoss - allowedLoss
    const k1Allowed   = allowedLoss > 0 ? -allowedLoss : 0

    entityBasisResults.push({ name: e.name || e.id || 'Entity', type: e.type, k1Gross, k1Allowed, suspended, stockBasis: sb, debtBasis: db, totalBasis })
    return suspended > 0 ? { ...e, k1: k1Allowed } : e
  })

  const totalSuspendedLoss = entityBasisResults.reduce((s, r) => s + (r.suspended || 0), 0)

  // ── REG-01: §469 Step-1 Real Estate (Schedule E) entity routing ───────────
  // A "Real Estate (Schedule E)" entity entered in Step 1 is personally-held
  // rental property, NOT a K-1 trade-or-business. persistStep1() folds its net
  // into k1Total, where it previously flowed through adjustedK1Total as fully
  // deductible NONPASSIVE income and was unconditionally swept into the §461(l)
  // base — bypassing the §469 passive-activity-loss rules entirely.
  //
  // Here we measure each Real Estate entity's contribution to k1Total (computed
  // identically to persistStep1: round(net * own) − §179 − charitable) and pull
  // it back out of the K-1 stream, then route it through the §469 rental block
  // below. Default treatment is PASSIVE (IRC §469(a)): a net loss is suspended
  // unless the taxpayer is a Real Estate Professional (§469(c)(7), e.isREP —
  // a taxpayer-level status, so OR-combined with the global isREP) or qualifies
  // for the §469(i) $25,000 active-participation allowance (e.isActiveParticipant).
  // A net rental GAIN always flows through as (passive) income.
  //
  // NOTE: persistStep1() intentionally still includes Real Estate entities in
  // k1Total; this engine is the single authoritative place that nets them out.
  // Do not also exclude them upstream or their net will be double-removed.
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
    const net = k1Gross - nv(e.box11_12) - nv(e.box12_13)
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

  // Real Estate net removed from the K-1 income line — handled by §469 below.
  const adjustedK1Total = k1Total + totalSuspendedLoss - step1RentalNet

  // ── PASS4B-02b: §1368(b)(2) S-Corp Distribution Capital Gain ─────────────
  // Distributions reduce stock basis. The portion of distributions that exceeds
  // the shareholder's remaining basis (after the current year's income/loss
  // allocation) is a long-term capital gain (IRC §1368(b)(2)).
  //
  // Computation is gated on BOTH stockBasis AND distributions being provided:
  // - If distributions entered but no stockBasis: flag as unknown (excessCapGain: null).
  //   No phantom tax is added — we cannot compute without basis.
  // - If both entered: post-income basis = stockBasis + k1Allowed (positive income
  //   increases basis; limited loss already reduces the allowable deduction above).
  //   excess = max(0, distributions - max(0, postIncomeBasis)).
  //
  // distributionCapGain is threaded into _ltGain and participates in all
  // subsequent capital gain, NIIT, AMT, and preferential tax computations.
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
    const hasBasisEntry = basisResult && basisResult.stockBasis !== undefined

    if (!hasBasisEntry) {
      // Distributions entered but no stock basis — cannot determine taxable portion.
      // Flag for disclosure without adding phantom tax to the calculation.
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

    // Post-income/loss basis: beginning basis + income (or - allowed loss).
    // k1Allowed is negative for losses and positive for income.
    const postIncomeBasis = Math.max(0, basisResult.stockBasis + basisResult.k1Allowed)
    const excess          = Math.max(0, dist - postIncomeBasis)
    const taxFreeReturn   = dist - excess

    distributionCapGain += excess

    entityDistributionResults.push({
      name:            e.name || e.id || 'Entity',
      distributions:   dist,
      basisBeforeDist: postIncomeBasis,
      taxFreeReturn:   Math.round(taxFreeReturn),
      excessCapGain:   Math.round(excess),
    })
  })

  // _ltGain threads the §1368 distribution capital gain into all downstream
  // computations (preferential tax, NIIT, AMT, gross income). The original
  // ltGain parameter (from user-entered Schedule D) is never mutated.
  const _ltGain = nv(ltGain) + distributionCapGain

  // ── PAL — §469 Passive Activity Loss ──────────────────────────────────────
  // REG-01: combine the Step-2 rentalNet field with any Step-1 Real Estate
  // entities into a single §469 pool (the passive-activity rules aggregate all
  // of a taxpayer's rental activities). REP is a taxpayer-level status, so
  // OR-combine it. For the §469(i) active-participation allowance, preserve the
  // exact prior Step-2 behavior when a Step-2 rental is present; otherwise honor
  // the Step-1 entity flag so a Step-1-only rental is passive-by-default unless
  // the user marks active participation. When there are no Step-1 rentals,
  // step1RentalNet === 0 and these collapse to the original Step-2-only values.
  const hasStep2Rental             = nv(rentalNet) !== 0
  const combinedRentalNet          = nv(rentalNet) + step1RentalNet
  const effectiveIsREP             = !!isREP || step1RentalREP
  const effectiveIsActiveParticipant =
    (hasStep2Rental ? isActiveParticipant : false) || step1RentalActive

  const priorPAL = Math.max(0, nv(priorPassiveLossCarryforward))
  const palCarryforwardApplied   = (combinedRentalNet > 0 && priorPAL > 0) ? Math.min(priorPAL, combinedRentalNet) : 0
  const palCarryforwardRemaining = Math.max(0, priorPAL - palCarryforwardApplied)
  const rentalNetAfterCF         = combinedRentalNet - palCarryforwardApplied

  let palAdjustedRental  = rentalNetAfterCF
  let palSuspendedRental = 0

  if (!effectiveIsREP && rentalNetAfterCF < 0) {
    const preRentalAGI = w2 + adjustedK1Total + f4797Inc + stGain + _ltGain + intInc + divInc + iraIncome
      - Math.min(ytdScale(studentLoanInt), 2500)
      - ytdScale(hsaDeduction)
      - ytdScale(selfEmpRetirement)
      - ytdScale(selfEmpHealthIns)
    const isMFS            = status === 'mfs'
    const baseAllowance    = (isMFS || !effectiveIsActiveParticipant) ? 0 : 25000
    const phaseStart       = isMFS ? 0 : 100000
    const specialAllowance = Math.max(0, baseAllowance - Math.max(0, (preRentalAGI - phaseStart) * 0.5))
    palAdjustedRental  = Math.max(rentalNetAfterCF, -specialAllowance)
    palSuspendedRental = Math.round(palAdjustedRental - rentalNetAfterCF)
  }

  const eblThreshold = (getTable(taxYear).ebl?.[status]) ?? (['mfj','qss'].includes(status) ? 640000 : 320000)
  // §461(l): only allowed (nonpassive) business losses enter the EBL base. A
  // suspended passive rental loss is NOT an allowed loss, so it is excluded
  // unless the taxpayer is a Real Estate Professional (then the rental is
  // nonpassive and the full combined rental net belongs in the base).
  //
  // #11 FIX — §461(l)(3)(B) capital-gain inclusion limit: business capital GAINS
  // netted into the EBL base are capped at the LESSER OF (i) business capital-gain
  // net income or (ii) overall capital-gain net income. Any business capital gain
  // above that cap is pulled back out of the base, enlarging the disallowed loss.
  // f4797Inc is treated here as the net §1231 capital gain attributable to the
  // business (it flows to Schedule D as LTCG). If f4797Inc is ever used to carry
  // ORDINARY Form 4797 income (e.g. §1245/§1250 recapture), that ordinary portion
  // is NOT a capital gain and must be split out upstream in TaxReturn.jsx before
  // reaching this field — otherwise it would be incorrectly limited here. When the
  // limit does not bind (overall CGNI ≥ business capital gain — the common case),
  // eblBizCapGainExcluded is 0 and the base is unchanged.
  const eblBizCapGain         = Math.max(0, nv(f4797Inc))
  const eblOverallCapGainNI   = nv(stGain) + _ltGain + nv(f4797Inc)
                              + Math.max(0, nv(unrecap1250)) + Math.max(0, nv(collectiblesGain))
  const eblAllowedBizCapGain  = Math.max(0, Math.min(eblBizCapGain, eblOverallCapGainNI))
  const eblBizCapGainExcluded = eblBizCapGain - eblAllowedBizCapGain
  const eblBiz       = adjustedK1Total + (nv(f4797Inc) - eblBizCapGainExcluded) + (effectiveIsREP ? combinedRentalNet : 0)
  const eblNetLoss   = Math.max(0, -eblBiz)
  const ebl          = Math.max(0, eblNetLoss - eblThreshold)

  const unrec1250    = Math.max(0, nv(unrecap1250))
  const collectibles = Math.max(0, nv(collectiblesGain))

  const seNetIncome = entitiesLimited.reduce((sum, e) => {
    if (!e || !SE_SUBJECT_TYPES.includes(e.type)) return sum
    // AUDIT FIX: derive k1 from pnl.netProfit when no explicit e.k1 is set
    // (manually-entered entities store only pnl.netProfit) — matches every other
    // k1 computation in this engine. Without it, SE income reads as 0.
    const k1 = nv(e.k1) || Math.round(nv(e.pnl?.netProfit ?? e.netProfit) * (ownPct(e.own) / 100))
    return sum + Math.max(0, k1)
  }, 0)

  const ssWageBase = TAX_TABLES[taxYear]?.ssWageBase || 176100

  // TAX-10 FIX: Use SE_NET_EARNINGS_FACTOR (0.9235) per IRC §1402(a)(12).
  const seEarningsSubject = seNetIncome * SE_NET_EARNINGS_FACTOR
  const ssPortion         = Math.min(seEarningsSubject, ssWageBase) * (FICA_SS_RATE * 2)
  const medicarePortion   = seEarningsSubject * (FICA_MEDICARE_RATE * 2)
  const seTax             = Math.round(ssPortion + medicarePortion)
  const halfSE            = Math.round(seTax * SE_TAX_DEDUCTION_RATE)

  const totalW2ForFICA = Math.max(0, nv(w2))
  const empSS          = Math.min(totalW2ForFICA, ssWageBase) * FICA_SS_RATE
  const empMedicare    = totalW2ForFICA * FICA_MEDICARE_RATE
  const employeeFICA   = Math.round(empSS + empMedicare)

  // ── FICA Savings from S-Corp Structure (T-01 FIX) ─────────────────────────
  // AUDIT FIX: only NON-SE-subject pass-through distributions (S-corp, passive
  // partner) avoid SE tax. SE-subject income (sole prop, active partner) is itself
  // SE-taxed, so excluding it here stops the "you avoid SE tax" panel from wrongly
  // appearing for sole proprietors. Scalar-only callers (no entities) keep prior behavior.
  const nonSEDistributions = entitiesLimited.reduce((sum, e) => {
    if (!e || SE_SUBJECT_TYPES.includes(e.type)) return sum
    if (isRealEstateEntity(e.type)) return sum   // REG-01: rental income is not a K-1 distribution
    return sum + (nv(e.k1) || Math.round(nv(e.pnl?.netProfit ?? e.netProfit) * (ownPct(e.own) / 100)))
  }, 0)
  const k1Distributions  = Math.max(0, entitiesLimited.length > 0 ? nonSEDistributions : nv(adjustedK1Total))
  const ssWageBaseRoom   = Math.max(0, ssWageBase - totalW2ForFICA)
  const seEarningsOnDist = k1Distributions * SE_NET_EARNINGS_FACTOR
  const distSSTaxable    = Math.min(seEarningsOnDist, ssWageBaseRoom)
  const ficaSavings = Math.round(
    distSSTaxable    * (FICA_SS_RATE      * 2) +
    seEarningsOnDist * (FICA_MEDICARE_RATE * 2)
  )

  const selfEmpHealthDed     = ytdScale(selfEmpHealthIns)
  const hsaDed               = ytdScale(hsaDeduction)
  const studentLoanDed       = Math.min(ytdScale(studentLoanInt), 2500)
  const selfEmpRetirementDed = ytdScale(selfEmpRetirement)
  const adjustments = halfSE + selfEmpHealthDed + hsaDed + studentLoanDed + selfEmpRetirementDed

  const stdDed    = getStdDed(taxYear, status)

  // _ltGain used here and throughout — includes §1368 distribution cap gain.
  const grossIncomeBeforeNOL = w2 + adjustedK1Total + palAdjustedRental + stGain + _ltGain
    + unrec1250 + collectibles + intInc + divInc + f4797Inc + taxableSS + iraIncome + ebl

  // ── MED-FLOOR: Medical expense 7.5%-of-AGI floor — IRC §213(a) ─────────────
  // Only medical/dental expenses ABOVE 7.5% of AGI are deductible. The floor is
  // applied against AGI figured BEFORE the itemized deduction (Form 1040 line 11
  // precedes Schedule A), which is grossIncomeBeforeNOL − adjustments. The optional
  // NOL deduction's effect on that AGI is a second-order, rarely-co-occurring case
  // and is intentionally NOT fed back here, to avoid a medical↔NOL circular
  // dependency. `medicalExpenses` is an OPTIONAL input: when omitted (every existing
  // caller/test, and any caller that pre-sums medical into itemizedAmt), rawMedical
  // and deductibleMedical are 0 and the itemized total is unchanged — fully
  // backward compatible. TaxReturn.jsx now passes medical here (raw) instead of
  // pre-summing it into itemizedAmt, so the floor the tooltip promises is real.
  const floorAGI          = grossIncomeBeforeNOL - adjustments
  const rawMedical        = Math.max(0, nv(medicalExpenses))
  const deductibleMedical = rawMedical > 0 ? Math.max(0, rawMedical - 0.075 * Math.max(0, floorAGI)) : 0
  const itemized          = nv(itemizedAmt) + deductibleMedical
  const deduction         = useItemized ? Math.max(stdDed, itemized) : stdDed

  const taxableBeforeNOL = Math.max(0, grossIncomeBeforeNOL - adjustments - deduction)
  const priorNOL         = Math.max(0, nv(nolCarryforward))
  const nolAllowed       = Math.min(priorNOL, Math.floor(taxableBeforeNOL * 0.80))
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
    if (isRealEstateEntity(e?.type)) return sum   // REG-01: routed through §469 rental, not K-1
    const k1    = nv(e.k1) || Math.round(nv(e.pnl?.netProfit ?? e.netProfit) * (ownPct(e.own) / 100))
    const scale = e.box17V_sstb ? sstbApplicablePct : 1
    return sum + k1 * scale
  }, 0)
  const seK1AfterAdjustments = Math.max(0, seNetIncome - halfSE - selfEmpHealthDed)

  const k1FallbackForQBI = entitiesLimited.length === 0 ? adjustedK1Total : 0
  // #12 FIX (§199A rental QBI): for a Real Estate Professional the rentals are a
  // non-passive §162 trade/business, so the FULL rental net — income AND loss —
  // belongs in QBI (a qualified business loss reduces QBI / builds the §199A(c)(2)
  // carryforward). The prior Math.max(0, palAdjustedRental) let rental income into
  // QBI but silently dropped rental losses, understating the QBI loss carryforward
  // (e.g. $343,443 instead of $435,042 for a REP with a −$91,599 rental loss).
  // Non-REP rentals are unchanged: only positive net is included, pending a
  // separate §162 trade-or-business determination.
  const rentalQbiContribution = effectiveIsREP ? palAdjustedRental : Math.max(0, palAdjustedRental)
  const qbiBasis = nonSEk1 + seK1AfterAdjustments + rentalQbiContribution - priorQBILossCO + k1FallbackForQBI

  // §1231 FIX (IRC §1231(a)(1)): a NET §1231 gain (positive f4797Inc) is long-term
  // capital gain taxed at 0/15/20%, not ordinary rates. A net §1231 LOSS (negative
  // f4797Inc) stays ordinary (§1231(a)(2)) and remains in ordinary income via
  // grossIncomeBeforeNOL — only the positive portion is reclassified as preferential.
  // Consistent with the EBL block (#11), which already nets f4797Inc as a business
  // capital gain. This field must carry NET §1231 capital amounts ONLY — any ordinary
  // Form 4797 recapture (§1245 / ordinary §1250) must be split out upstream, not here.
  const f4797NetGain = Math.max(0, nv(f4797Inc))

  // Use _ltGain for QBI capital gains ceiling (§199A(a)(2)); net §1231 gain is also
  // "net capital gain" for §199A(a)(2), so it reduces the 20%-of-taxable-income ceiling.
  const prefIncome = _ltGain + qualDiv + f4797NetGain

  const hasMultiEntityTypes = entities.length > 1
    && entities.some(e => e && SE_SUBJECT_TYPES.includes(e.type))
    && entities.some(e => e && !SE_SUBJECT_TYPES.includes(e.type))

  const _qbiResult = calcQBI(qbiBasis, taxableBeforeQBI, prefIncome, {
    status, taxYear, entityQbiData: entitiesLimited, hasMultiEntityTypes,
  })
  const qbi                      = _qbiResult.deduction
  const qbiLimitApplied          = _qbiResult.limitApplied
  const qbiCaps                  = _qbiResult.caps
  const qbiAggregationApplied    = _qbiResult.aggregationApplied
  const qbiAggregationDisclosure = _qbiResult.aggregationDisclosure
  const qbiCarryforward          = qbiBasis < 0 ? Math.abs(qbiBasis) : 0

  // Use _ltGain throughout capital gain computations.
  // §1231 FIX: f4797NetGain (net §1231 gain) is included so it is removed from
  // ordinaryTaxableIncome below and taxed at LTCG (0/15/20%) rates, not ordinary rates.
  const totalPrefIncome       = Math.max(0, _ltGain) + Math.max(0, qualDiv) + unrec1250 + collectibles + f4797NetGain
  const taxableAfterQBI       = Math.max(0, taxableBeforeQBI - qbi)
  const ordinaryTaxableIncome = Math.max(0, taxableAfterQBI - totalPrefIncome)
  const taxableIncome         = taxableAfterQBI

  // ── CG-01 FIX (§1(h) preferential-income aggregate cap) ───────────────────
  // Preferential-rate income cannot exceed taxable income (the Qualified Dividends
  // & Capital Gain Tax Worksheet caps the TOTAL preferential amount at taxable
  // income, then stacks the pieces within that cap). The prior code clamped each
  // item independently with Math.min(item, taxableAfterQBI), so when more than one
  // preferential item was present (e.g. LTCG + qualified dividends, or LTCG +
  // §1250 + collectibles) their SUM could exceed taxable income — overstating the
  // preferential base and the tax. Example (audit case): LTCG 113,072 + qualDiv 143
  // against taxable 80,771 produced a base of 80,771 + 143 = 80,914 (>taxable),
  // i.e. ~$22 too much tax.
  //
  // Fix: allocate the single taxableAfterQBI ceiling across the four buckets in
  // worksheet order — long-term capital gain first, then qualified dividends, then
  // unrecaptured §1250, then collectibles — each taking only the room remaining
  // after the prior buckets. The buckets' rate ordering is preserved by
  // calcPreferentialTax; this only bounds the inputs so they sum to ≤ taxable income.
  let _prefRoom = taxableAfterQBI
  // §1231 FIX: net §1231 gain joins the regular LTCG bucket (0/15/20%) — NOT §1250 (25%)
  // or collectibles (28%). Clamped together with _ltGain so the combined preferential
  // base never exceeds taxable income (§1(h) Qualified Dividends & Cap Gain worksheet).
  const _ltcgClamped         = Math.min(Math.max(0, _ltGain) + f4797NetGain, _prefRoom); _prefRoom -= _ltcgClamped
  const _qualDivClamped      = Math.min(Math.max(0, qualDiv),   _prefRoom); _prefRoom -= _qualDivClamped
  const _unrecap1250Clamped  = Math.min(unrec1250,              _prefRoom); _prefRoom -= _unrecap1250Clamped
  const _collectiblesClamped = Math.min(collectibles,          _prefRoom); _prefRoom -= _collectiblesClamped

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
  const additionalMedicare = Math.round(
    Math.max(0, w2 + seEarningsSubject - addlMedThreshold) * ADDITIONAL_MEDICARE_TAX_RATE
  )

  // NIIT: use _ltGain (includes §1368 distribution capital gain)
  // REG-01: passive rental income (incl. Step-1 rental entities) is net
  // investment income unless the taxpayer is a Real Estate Professional.
  const rentalNII  = effectiveIsREP ? 0 : Math.max(0, combinedRentalNet)
  const nii        = Math.max(0, intInc + divInc + Math.max(0, _ltGain + stGain + unrec1250 + collectibles) + rentalNII)
  const niitAmount = calcNIIT(nii, agi, taxYear, status)

  const numDependents        = parseInt(dependents) || 0
  const ctcPerChild          = getTable(taxYear).ctc?.perChild || 2000
  const ctcPhaseoutThreshold = (status === 'mfj' || status === 'qss') ? 400000 : 200000
  const ctcExcess            = Math.max(0, agi - ctcPhaseoutThreshold)
  const ctcReduction         = Math.ceil(ctcExcess / 1000) * 50
  const ctcRaw               = Math.max(0, numDependents * ctcPerChild - ctcReduction)
  const childCredit          = Math.min(ctcRaw, Math.max(0, fedTax + additionalMedicare + niitAmount))

  // AMT: use _ltGain
  const amt = calcAMT({
    taxableIncome, qbi, saltAmount: nv(saltAmount),
    isoBargainElement: hasISO ? nv(isoBargainElement) : 0,
    // §1231 FIX: net §1231 gain is preferential inside AMT too — carved out of the
    // 26/28% AMTI base so it is taxed at cap-gains rates, matching its regular treatment.
    ltGain: _ltGain + f4797NetGain, qualDiv, regularTax: fedTax, status, taxYear,
    useItemized, itemized, stdDed,
  })

  const totalTax      = Math.max(0, fedTax + seTax + additionalMedicare + niitAmount + amt - childCredit)
  const effectiveRate = grossIncome > 0 ? (totalTax / Math.max(1, w2 + Math.max(0, adjustedK1Total))) : 0
  const withheld      = nv(w2Withheld)
  const estimated     = nv(estPaid)
  const totalPayments = withheld + estimated
  const balance       = totalTax - totalPayments

  // ── Safe harbor calculations ───────────────────────────────────────────────
  const priorYearTaxAmt     = Math.max(0, nv(priorYearTax))
  const priorYearAGIAmt     = Math.max(0, nv(priorYearAGI))
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
  const safeHarborQuarterly = safeHarborBalance > 0 ? Math.round(safeHarborBalance / 4) : 0

  // TAX-08 / F-07 FIX: quarterlyRecommended moved below safe harbor calculations.
  const quarterlyRecommended = Math.max(
    balance > 0 ? Math.round(balance / 4) : 0,
    safeHarborQuarterly
  )

  // ── Schedule C / E income split ───────────────────────────────────────────
  const scheduleEK1Income = nonSEk1
  const scheduleCSEIncome = seNetIncome

  const entityIncomeBreakdown = entities.map(e => {
    if (!e) return null
    const isSEType = SE_SUBJECT_TYPES.includes(e.type)
    const isRE     = isRealEstateEntity(e.type)   // REG-01
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
        : (e.type === 'S Corporation' || e.type === 'C Corporation')
        ? 'K-1 (Form 1120-S)'
        : 'K-1 (Form 1065)',
    }
  }).filter(Boolean)

  // ── S-Corp reasonable compensation alert ──────────────────────────────────
  const reasonableCompAlert = (() => {
    const scorp = entities.find(e => e && e.type === 'S Corporation')
    if (!scorp) return { triggered: false, ratio: 100, message: '' }
    const sal = Math.max(0, parseFloat(scorp.pnl?.officerSalary ?? scorp.officerW2 ?? 0) || 0)
    if (sal < 0) return { triggered: false, ratio: 100, message: '' }
    const k1Val = Math.max(0,
      parseFloat(scorp.k1 ?? 0) ||
      Math.round((parseFloat(scorp.pnl?.netProfit || 0)) * (ownPct(scorp.own) / 100))
    )
    const totalComp = sal + k1Val
    if (totalComp < 20000) return { triggered: false, ratio: 100, message: '' }
    const ratio     = totalComp > 0 ? sal / totalComp : 1
    const triggered = ratio < SCORP_REASONABLE_COMP_RATIO_THRESHOLD
    return {
      triggered,
      ratio: Math.round(ratio * 100),
      message: triggered
        ? `Officer salary ($${Math.round(sal).toLocaleString()}) is ${Math.round(ratio * 100)}% of total S-Corp compensation. Tax practitioners commonly recommend a salary-to-total-compensation ratio of 35–45%, based on case law including Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012). The IRS applies a facts-and-circumstances test — there is no published safe harbor percentage.`
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
    stdDed, itemized, deduction, deductibleMedical,
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
    eblThreshold,
    // #11: amount of business capital gain disallowed from the EBL base by §461(l)(3)(B)
    eblBizCapGainExcluded,

    palSuspendedRental,
    palCarryforwardApplied,
    palCarryforwardRemaining,

    // REG-01: §469 rental routing — combined Step-1 (entity) + Step-2 (field) net,
    // the effective taxpayer-level flags actually applied, and the per-entity
    // Step-1 rental breakdown for display.
    rentalNetCombined:        combinedRentalNet,
    rentalAllowed:            palAdjustedRental,
    rentalIsREP:              effectiveIsREP,
    rentalIsActiveParticipant: effectiveIsActiveParticipant,
    step1RentalNet,
    entityRentalResults,

    scheduleEK1Income,
    scheduleCSEIncome,
    entityIncomeBreakdown,

    reasonableCompAlert,

    federalOnly: true,

    // §1366(d) basis limitation results — one entry per entity
    entityBasisResults,
    totalSuspendedLoss,

    // §1368(b)(2) distribution capital gain results — one entry per S-Corp entity
    distributionCapGain,
    entityDistributionResults,

    // Effective ltGain used in calculations (ltGain input + distributionCapGain)
    ltGainEffective: _ltGain,
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
  QBI_MIN_DEDUCTION,
  nv,
  calcTaxReturn,
}
