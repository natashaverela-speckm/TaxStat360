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
// F-02 / T-01 / C-02 FIX (NaN propagation → ghost $400 QBI deduction):
// Root cause: e.pnl.netProfit is stored as '' (empty string) when a user adds an
// entity but has not yet entered data. The ?? operator does NOT coerce '' to a
// fallback (only null/undefined trigger ??), so parseFloat('') = NaN. NaN then
// propagates into nonSEk1, qbiBasis, and finally calcQBI. Inside calcQBI,
// NaN <= 0 is false — bypassing the early-exit guard. Math.round(NaN)||0 produces
// deduction=0, but activeQbiForFloor=NaN, and NaN < threshold is also false —
// so _applyMinQBI fell through to the OBBBA $400 floor unconditionally.
// Three-part fix:
//   1. nv() normalization added at calcQBI entry for all three numeric params.
//   2. Number.isFinite guard in _applyMinQBI before the threshold comparison.
//   3. nonSEk1 and related entity income lookups now use nv() instead of parseFloat().
//
// T-02 FIX (officer W-2 excluded from FICA base):
// totalW2ForFICA previously used only the additional W-2 income entered in Step 2.
// Officer W-2 salary entered in Step 1 (entity pnl.officerSalary / officerW2) was
// omitted, understating employee FICA and the SS wage base consumed. Fix:
//   officerW2Total — sum of officer salaries across all S-Corp entities.
//   allW2ForFICA   — additionalW2 + officerW2Total (used for empSS/empMedicare).
//   ssWageBaseRoom — now deducts allW2ForFICA so ficaSavings correctly reflects
//                   the remaining base available for K-1 distribution comparison.
// Both values returned for Tax Waterfall display in TaxReturn.jsx.
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
    // ⚠ ESTIMATED — verify when IRS publishes 2026 mileage notice (typically Dec 2025).
    mileageRate: 0.70,
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

const QBI_MIN_DEDUCTION = { 2026: 400 }
const QBI_MIN_THRESHOLD = { 2026: 1000 }

// F-02 / T-01 / C-02 FIX: Added Number.isFinite guard.
// Prior code: `if (activeQbiForFloor < threshold)` — when activeQbiForFloor is NaN
// (from empty-string pnl fields propagating through nonSEk1 → qbiBasis → calcQBI),
// NaN < threshold evaluates to false and the function fell through to apply the
// $400 OBBBA minimum even when actual QBI was zero.
// Fix: treat non-finite (NaN, ±Infinity) as zero — the minimum never applies at 0.
function _applyMinQBI(result, activeQbiForFloor, taxYear) {
  const floor     = QBI_MIN_DEDUCTION[taxYear]
  const threshold = QBI_MIN_THRESHOLD[taxYear]
  if (floor == null || threshold == null) return result
  // Guard: NaN and Infinity are not valid QBI amounts. Treat them as 0.
  const safeActive = Number.isFinite(activeQbiForFloor) ? activeQbiForFloor : 0
  if (safeActive < threshold) return result
  if (result.deduction >= floor) return { ...result, caps: { ...result.caps, min400: floor } }
  return { deduction: floor, limitApplied: 'min400', caps: { ...result.caps, min400: floor } }
}

// F-02 / T-01 / C-02 FIX: nv() normalization added at function entry.
// All three numeric inputs are normalized here so downstream comparisons
// (qbiIncome <= 0, taxableBeforeQBI <= 0) behave correctly when called with NaN.
// Without this, NaN <= 0 evaluates to false, bypassing the early-exit guard entirely.
function calcQBI(qbiIncome, taxableBeforeQBI, capitalGains, opts = {}) {
  // Normalize all three inputs: parseFloat('') = NaN; nv('') = 0.
  qbiIncome        = nv(qbiIncome)
  taxableBeforeQBI = nv(taxableBeforeQBI)
  capitalGains     = nv(capitalGains)

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
      activeQbi !== undefined ? nv(activeQbi) : qbiIncome,
      taxYear
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
      activeQbi !== undefined ? nv(activeQbi) : qbiIncome,
      taxYear
    )
  }

  const phaseInForYear      = QBI_PHASE_IN_RANGE[taxYear] || QBI_PHASE_IN_RANGE[2025]
  const phaseInRange        = phaseInForYear[status] || phaseInForYear.single
  const excessOverThreshold = taxableBeforeQBI - threshold
  const phasePercent        = Math.min(1, excessOverThreshold / phaseInRange)
  const sstbApplicablePct   = Math.max(0, 1 - phasePercent)

  const sstbEntityQBI = entityQbiData.reduce((s, e) => {
    if (!e.box17V_sstb) return s
    const k1Income = parseFloat(
      e.k1 ?? Math.round(nv(e.pnl?.netProfit ?? e.netProfit ?? 0) * (ownPct(e.own) / 100))
    ) || 0
    return s + Math.max(0, k1Income)
  }, 0)

  const adjQBI             = Math.max(0, qbiIncome - sstbEntityQBI * (1 - sstbApplicablePct))
  const scaledQbiComponent = adjQBI * QBI_DEDUCTION_RATE
  const activeQbiForFloor  = activeQbi !== undefined ? nv(activeQbi) : adjQBI

  const totalWages = entityQbiData.reduce((s, e) => {
    const w = nv(e.box17V_wages) || nv(e.officerW2) || nv(e.pnl?.officerSalary) || 0
    return s + (e.box17V_sstb ? w * sstbApplicablePct : w)
  }, 0)
  const totalUBIA = entityQbiData.reduce((s, e) => {
    const u = nv(e.box17V_ubia) || 0
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
    taxYear
  )
}

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
    priorPassiveLossCarryforward = 0,
  } = input

  const ytdScale = (val) => Math.round(nv(val) * ytdFactor)
  const priorQBILossCO = Math.abs(nv(priorYearQBILoss))

  const entityBasisResults = []
  const entitiesLimited = entities.map(e => {
    if (!e) return e

    const own = ownPct(e.own) / 100
    const k1Gross = e.k1 !== undefined
      ? parseFloat(e.k1) || 0
      : Math.round((nv(e.pnl?.netProfit) || 0) * own)

    const isLimitable = /s.?corp|partner/i.test(e.type || '')
    const hasBasisInput = (
      e.stockBasis !== undefined && e.stockBasis !== null &&
      e.stockBasis !== '' && e.stockBasis !== 0 ||
      String(e.stockBasis) === '0'
    )

    if (!isLimitable || k1Gross >= 0 || !hasBasisInput) {
      entityBasisResults.push({ name: e.name || e.id || 'Entity', type: e.type, k1Gross, k1Allowed: k1Gross, suspended: 0 })
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
  const adjustedK1Total    = k1Total + totalSuspendedLoss

  const priorPAL = Math.max(0, nv(priorPassiveLossCarryforward))
  const palCarryforwardApplied   = (rentalNet > 0 && priorPAL > 0) ? Math.min(priorPAL, rentalNet) : 0
  const palCarryforwardRemaining = Math.max(0, priorPAL - palCarryforwardApplied)
  const rentalNetAfterCF         = rentalNet - palCarryforwardApplied

  let palAdjustedRental  = rentalNetAfterCF
  let palSuspendedRental = 0

  if (!isREP && rentalNetAfterCF < 0) {
    const preRentalAGI = w2 + adjustedK1Total + f4797Inc + stGain + ltGain + intInc + divInc + iraIncome
      - Math.min(ytdScale(studentLoanInt), 2500)
      - ytdScale(hsaDeduction)
      - ytdScale(selfEmpRetirement)
      - ytdScale(selfEmpHealthIns)
    const isMFS            = status === 'mfs'
    const baseAllowance    = (isMFS || !isActiveParticipant) ? 0 : 25000
    const phaseStart       = isMFS ? 0 : 100000
    const specialAllowance = Math.max(0, baseAllowance - Math.max(0, (preRentalAGI - phaseStart) * 0.5))
    palAdjustedRental  = Math.max(rentalNetAfterCF, -specialAllowance)
    palSuspendedRental = Math.round(palAdjustedRental - rentalNetAfterCF)
  }

  const eblThreshold = (getTable(taxYear).ebl?.[status]) ?? (['mfj','qss'].includes(status) ? 640000 : 320000)
  const eblBiz       = adjustedK1Total + f4797Inc + (isREP ? rentalNet : 0)
  const eblNetLoss   = Math.max(0, -eblBiz)
  const ebl          = Math.max(0, eblNetLoss - eblThreshold)

  const unrec1250    = Math.max(0, nv(unrecap1250))
  const collectibles = Math.max(0, nv(collectiblesGain))

  const seNetIncome = entitiesLimited.reduce((sum, e) => {
    if (!e || !SE_SUBJECT_TYPES.includes(e.type)) return sum
    return sum + Math.max(0, parseFloat(e.k1) || 0)
  }, 0)

  const ssWageBase = TAX_TABLES[taxYear]?.ssWageBase || 176100

  // TAX-10 FIX: Use SE_NET_EARNINGS_FACTOR (0.9235) per IRC §1402(a)(12).
  const seEarningsSubject = seNetIncome * SE_NET_EARNINGS_FACTOR
  const ssPortion         = Math.min(seEarningsSubject, ssWageBase) * (FICA_SS_RATE * 2)
  const medicarePortion   = seEarningsSubject * (FICA_MEDICARE_RATE * 2)
  const seTax             = Math.round(ssPortion + medicarePortion)
  const halfSE            = Math.round(seTax * SE_TAX_DEDUCTION_RATE)

  // T-02 FIX: Include officer W-2 salary from S-Corp entities in the FICA base.
  // Prior code only used the additional W-2 entered in Step 2 (nv(w2)).
  // The officer salary entered in Step 1 pnl.officerSalary is also W-2 income
  // subject to FICA. Omitting it understated employee FICA and gave an inflated
  // ssWageBaseRoom, causing ficaSavings to overstate the S-Corp advantage.
  const officerW2Total = entitiesLimited.reduce((sum, e) => {
    if (!e || !/s.?corp/i.test(e.type || '')) return sum
    return sum + Math.max(0, nv(e.pnl?.officerSalary ?? e.officerW2 ?? 0))
  }, 0)
  const additionalW2   = Math.max(0, nv(w2))
  const allW2ForFICA   = additionalW2 + officerW2Total

  const empSS        = Math.min(allW2ForFICA, ssWageBase) * FICA_SS_RATE
  const empMedicare  = allW2ForFICA * FICA_MEDICARE_RATE
  const employeeFICA = Math.round(empSS + empMedicare)

  // ── FICA Savings from S-Corp Structure ────────────────────────────────────
  // ssWageBaseRoom now uses allW2ForFICA (officer + additional) so the
  // remaining room is correctly reduced by all W-2 wages already taxed.
  const k1Distributions  = Math.max(0, nv(adjustedK1Total))
  const ssWageBaseRoom   = Math.max(0, ssWageBase - allW2ForFICA)
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
  const itemized  = nv(itemizedAmt)
  const deduction = useItemized ? Math.max(stdDed, itemized) : stdDed

  const grossIncomeBeforeNOL = w2 + adjustedK1Total + palAdjustedRental + stGain + ltGain
    + unrec1250 + collectibles + intInc + divInc + f4797Inc + taxableSS + iraIncome + ebl

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

  // C-02 FIX: use nv() instead of raw parseFloat() for all entity income lookups.
  // parseFloat('') = NaN; nv('') = 0. The ?? operator does NOT coerce '' to 0
  // (only null/undefined trigger ??), so nv() is required to safely handle
  // the empty-string pnl fields stored when a user adds an entity without data.
  const nonSEk1 = entitiesLimited.reduce((sum, e) => {
    if (!e || SE_SUBJECT_TYPES.includes(e?.type)) return sum
    const k1    = nv(e.k1 ?? 0) || Math.round(nv(e.pnl?.netProfit ?? e.netProfit ?? 0) * (ownPct(e.own) / 100))
    const scale = e.box17V_sstb ? sstbApplicablePct : 1
    return sum + k1 * scale
  }, 0)
  const seK1AfterAdjustments = Math.max(0, seNetIncome - halfSE - selfEmpHealthDed)

  const k1FallbackForQBI = entitiesLimited.length === 0 ? adjustedK1Total : 0
  const qbiBasis = nonSEk1 + seK1AfterAdjustments + Math.max(0, palAdjustedRental) - priorQBILossCO + k1FallbackForQBI

  const prefIncome = ltGain + qualDiv

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

  const totalPrefIncome       = Math.max(0, ltGain) + Math.max(0, qualDiv) + unrec1250 + collectibles
  const taxableAfterQBI       = Math.max(0, taxableBeforeQBI - qbi)
  const ordinaryTaxableIncome = Math.max(0, taxableAfterQBI - totalPrefIncome)
  const taxableIncome         = taxableAfterQBI

  const ordFedTax = calcFederalTax(ordinaryTaxableIncome, taxYear, status)
  const prefTax   = calcPreferentialTax(ordinaryTaxableIncome, {
    ltcg:         Math.min(Math.max(0, ltGain),      taxableAfterQBI),
    qualDiv:      Math.min(Math.max(0, qualDiv),     taxableAfterQBI),
    unrecap1250:  Math.min(unrec1250,                taxableAfterQBI),
    collectibles: Math.min(collectibles,             taxableAfterQBI),
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

  const rentalNII  = isREP ? 0 : Math.max(0, rentalNet)
  const nii        = Math.max(0, intInc + divInc + Math.max(0, ltGain + stGain + unrec1250 + collectibles) + rentalNII)
  const niitAmount = calcNIIT(nii, agi, taxYear, status)

  const numDependents        = parseInt(dependents) || 0
  const ctcPerChild          = getTable(taxYear).ctc?.perChild || 2000
  const ctcPhaseoutThreshold = (status === 'mfj' || status === 'qss') ? 400000 : 200000
  const ctcExcess            = Math.max(0, agi - ctcPhaseoutThreshold)
  const ctcReduction         = Math.ceil(ctcExcess / 1000) * 50
  const ctcRaw               = Math.max(0, numDependents * ctcPerChild - ctcReduction)
  const childCredit          = Math.min(ctcRaw, Math.max(0, fedTax + additionalMedicare + niitAmount))

  const amt = calcAMT({
    taxableIncome, qbi, saltAmount: nv(saltAmount),
    isoBargainElement: hasISO ? nv(isoBargainElement) : 0,
    ltGain, qualDiv, regularTax: fedTax, status, taxYear,
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

  // TAX-08 / F-07 FIX: quarterlyRecommended never falls below safe harbor quarterly.
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
    const own      = ownPct(e.own) / 100
    const income   = parseFloat(e.k1 ?? 0) || Math.round((nv(e.pnl?.netProfit) || 0) * own)
    return {
      name:         e.name || e.id || 'Unnamed Entity',
      type:         e.type,
      income:       Math.round(income),
      ownership:    ownPct(e.own),
      isSEType,
      scheduleForm: isSEType ? 'Schedule C' : 'Schedule E, Part II',
      taxForm:      isSEType ? '1040 Sch C'
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
      Math.round((nv(scorp.pnl?.netProfit || 0)) * (ownPct(scorp.own) / 100))
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
    // T-02: both legacy totalW2ForFICA (additional W-2 only) and new allW2ForFICA
    // (additional + officer) are returned for backward compatibility with callers
    // that reference totalW2ForFICA. New TaxReturn.jsx waterfall uses allW2ForFICA.
    totalW2ForFICA: additionalW2,
    officerW2Total,
    allW2ForFICA,
    employeeFICA,
    ficaSavings, ssWageBase, ssWageBaseRoom, k1Distributions,
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

    palSuspendedRental,
    palCarryforwardApplied,
    palCarryforwardRemaining,

    scheduleEK1Income,
    scheduleCSEIncome,
    entityIncomeBreakdown,

    reasonableCompAlert,

    federalOnly: true,

    entityBasisResults,
    totalSuspendedLoss,
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
