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
// ── M-2 FIX (entity-comparison QBI wage cap) ────────────────────────────────
// calcQBI / calcTaxReturn now accept an OPTIONAL `strictWageCap` flag (default
// false). When true, a business with no W-2 wages and no UBIA above the §199A
// threshold is capped to $0 (the real §199A(b)(2) wage/UBIA limit) instead of the
// existing "no wage data entered → full 20%" convenience default. ONLY the entity-
// structure comparison (CalculateTaxInner.jsx → CompareModal) sets this flag;
// TaxReturn.jsx and AIAnalysis.jsx never pass it, so filed-return results are
// unchanged. IRC §199A(b)(2).
//
// ── Audit-fix change log ────────────────────────────────────────────────────
// F6 ENGINE FIX (§469 rental treatment — §1.469-9(g) aggregation election):
//   All rentals default to PASSIVE (§469(a)); a net loss is limited to the §469(i)
//   $25k active-participation allowance and otherwise suspended. A real estate
//   professional (§469(c)(7)) makes the whole rental portfolio NONPASSIVE by
//   AFFIRMATIVELY making the §1.469-9(g) aggregation election (rentalAggregationElection
//   === true) — i.e. aggregating participation/hours across all properties so the
//   combined activity meets material participation. REP status ALONE is not enough and
//   is never assumed (DECISION 2): a REP without the election keeps passive treatment,
//   so a returning REP may see losses suspended until they elect (surfaced by a one-time
//   migration prompt in TaxReturn.jsx). perPropertyRegimeActive routes any REP through
//   the election-governed branch so the election actually controls the result rather
//   than falling to the legacy "REP ⇒ all nonpassive" path. The engine still honors an
//   explicit per-entity materiallyParticipates flag or step2RentalMaterialParticipation
//   if a caller supplies one (forward-compatible), but the UI exposes a single control:
//   the aggregation election. Non-REP callers with no flags keep the prior legacy path.
//   New return fields: rentalAggregationElectionApplied, rentalNonpassiveNet,
//   rentalPassiveNet. IRC §469(a),(c)(2),(c)(7),(h),(i) · Treas. Reg. §1.469-9(g).
//
// F5 ENGINE FIX (reasonable-comp advisory framing — Treas. Reg. §1.162-7):
//   reasonableCompAlert.message reframed as an informational flag rather than a
//   determination. It now leads with that framing, cites §1.162-7 (the value-of-
//   services standard that actually governs reasonable compensation), and demotes the
//   35–45% salary-to-total band to a rough, non-binding benchmark ("not a fixed ratio
//   or a legal threshold"). Trigger logic and the {triggered, ratio, message} contract
//   are unchanged; the message still contains the salary amount, "35–45%", and the
//   Watson v. Commissioner citation that AIAnalysis.jsx and the test suite rely on.
//
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
//
// PASS4B-02b-fix (§1368 income-entity distribution gap): stockBasis/debtBasis spread
// into the non-limiting push so the §1368 loop resolves basis for income entities.
//
// PASS4B-02b (§1368(b)(2) S-Corp distribution capital gain): excess distributions
// over remaining stock basis are long-term capital gain, threaded via _ltGain.
//
// #11 FIX (§461(l)(3)(B) capital-gain inclusion limit): business capital gains in the
// EBL base capped at lesser of business CGNI or overall CGNI.
//
// #12 FIX (§199A rental QBI for REP): REP rentals contribute full net (income AND
// loss) to the QBI base.
//
// AMT-FIX (§56(b)(1)(E) / §199A(f)(2)): QBI deduction is NOT added back for AMT; the
// standard deduction IS added back for non-itemizers.
//
// F-05 ENGINE FIX (§199A(c)(2) per-entity QBI loss carryforward): per-entity
// qbiLossCarryforward subtracted before aggregation.
//
// F-01 ENGINE FIX (§1366(d)(2) prior-year suspended loss carryforward): released
// prior-year suspended loss added to adjustedK1Total.
//
// YTD-FIX (year-to-date annualization consistency): _annualizeIfYTD() scales every
// income/expense flow once, up front, then resets ytdFactor to 1.
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
  UNRECAPTURED_1250_MAX_RATE,
  COLLECTIBLES_MAX_RATE,
  CURRENT_TAX_YEAR,
} from './constants.js'
import { normalizeEntityType, isRealEstateEntity } from './utils/entityPredicates.js'
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
    mileageRate: 0.725,
  },
}
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
    bracket26_28: { single:244500, mfj:244500, mfs:122250, hoh:244500, qss:244500 },
  },
}
const SALT_CAPS = { 2024: 10000, 2025: 40000, 2026: 40400 }
function getTable(year) { return TAX_TABLES[year] || TAX_TABLES[CURRENT_TAX_YEAR] }
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
  const slices = Math.max(0, unrecap1250) + Math.max(0, collectibles); const regularLTCG = Math.max(0, ltcg - slices); const totalPref = regularLTCG + qualDiv
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
  const cappedSliceTax = (base, amount, cap) => { if (amount <= 0) return 0; const o = calcFederalTax(base + amount, year, fs) - calcFederalTax(base, year, fs); return Math.min(o, amount * cap) }; const _u1250 = Math.max(0, unrecap1250); const _coll = Math.max(0, collectibles); tax += cappedSliceTax(ordFloor, _u1250, UNRECAPTURED_1250_MAX_RATE); tax += cappedSliceTax(ordFloor + _u1250, _coll, COLLECTIBLES_MAX_RATE)
  
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
  const stdDedAddback = isItemizing ? 0 : Math.max(0, stdDed || 0)
  const amti         = Math.max(0, taxableIncome) + stdDedAddback + saltAddback + isoAddback
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
const _YTD_SCALE_FIELDS = [
  'w2', 'k1Total', 'rentalNet',
  'stGain', 'ltGain', 'intInc', 'divInc', 'qualDiv',
  'f4797Inc', 'taxableSS', 'iraIncome',
  'selfEmpHealthIns', 'hsaDeduction', 'studentLoanInt', 'selfEmpRetirement',
]
const _YTD_SCALE_ENTITY_FIELDS = ['k1', 'netProfit', 'box11_12', 'box12_13', 'box17V_wages', 'officerW2']
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
function calcTaxReturn(input) {
  input = _annualizeIfYTD(input)
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
    // F6 (§469 per-property material participation + §1.469-9(g) aggregation):
    // Both are TRI-STATE / opt-in. `rentalAggregationElection` defaults false but the
    // per-property regime only engages when the caller affirmatively supplies the
    // election, a Step-2 material-participation answer, or a per-entity
    // materiallyParticipates flag (see perPropertyRegimeActive below). Legacy callers
    // that supply none of these keep the prior "REP ⇒ all nonpassive" behavior.
    rentalAggregationElection = false,
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
    w2Withheld, estPaid,
    ytdFactor = 1,
    priorYearTax,
    priorYearAGI,
    priorPassiveLossCarryforward = 0,
    priorSuspendedLoss = 0,
    // M-2 FIX: comparison-only opt-in flag, forwarded to calcQBI. Defaults false, so
    // every filed-return caller is unaffected.
    strictWageCap = false,
  } = input
  const entities = _rawEntities.map(e => (e ? { ...e, type: normalizeEntityType(e.type) } : e))
  const ytdScale = (val) => Math.round(nv(val) * ytdFactor)
  const priorQBILossCO = Math.abs(nv(priorYearQBILoss))
  const perEntityQBILossCO = entities.reduce((sum, e) => {
    if (!e) return sum
    return sum + Math.abs(nv(e.qbiLossCarryforward))
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
    const hasBasisInput = (
      e.stockBasis !== undefined && e.stockBasis !== null &&
      e.stockBasis !== '' && e.stockBasis !== 0 ||
      String(e.stockBasis) === '0'
    )
    if (!isLimitable || k1Gross >= 0 || !hasBasisInput) {
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
  let priorSuspendedLossApplied = 0
  const _priorSuspended = Math.max(0, nv(priorSuspendedLoss))
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
    const hasBasisEntry = basisResult && basisResult.stockBasis !== undefined
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
  const _ltGain = nv(ltGain) + distributionCapGain
  const hasStep2Rental             = nv(rentalNet) !== 0
  const combinedRentalNet          = nv(rentalNet) + step1RentalNet
  const effectiveIsREP             = !!isREP || step1RentalREP
  // §469(i) active-participation applies to whatever rental pool exists. Rentals now
  // come from Step-1 Real Estate entities (the Step-2 lump is retired), so gate on the
  // combined rental net rather than the (legacy) Step-2 lump. A per-entity active flag,
  // if a caller still supplies one, also counts.
  const effectiveIsActiveParticipant =
    (combinedRentalNet !== 0 ? isActiveParticipant : false) || step1RentalActive
  const priorPAL = Math.max(0, nv(priorPassiveLossCarryforward))
  const palCarryforwardApplied   = (combinedRentalNet > 0 && priorPAL > 0) ? Math.min(priorPAL, combinedRentalNet) : 0
  const palCarryforwardRemaining = Math.max(0, priorPAL - palCarryforwardApplied)
  const rentalNetAfterCF         = combinedRentalNet - palCarryforwardApplied
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
    const aggregateNonpassive = effectiveIsREP && rentalAggregationElection === true
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
        const net = k1Gross - nv(e.box11_12) - nv(e.box12_13)
        if (effectiveIsREP && e.materiallyParticipates === true) np += net
        else pv += net
      })
      const step2Net = nv(rentalNet)
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
      const preRentalAGI = w2 + adjustedK1Total + nonpassiveRentalNet + f4797Inc + stGain + _ltGain + intInc + divInc + iraIncome
        - Math.min(ytdScale(studentLoanInt), 2500)
        - ytdScale(hsaDeduction)
        - ytdScale(selfEmpRetirement)
        - ytdScale(selfEmpHealthIns)
      const isMFS            = status === 'mfs'
      const baseAllowance    = (isMFS || !effectiveIsActiveParticipant) ? 0 : 25000
      const phaseStart       = isMFS ? 0 : 100000
      const specialAllowance = Math.max(0, baseAllowance - Math.max(0, (preRentalAGI - phaseStart) * 0.5))
      passiveAllowed     = Math.max(passiveRentalNet, -specialAllowance)
      palSuspendedRental = Math.round(passiveAllowed - passiveRentalNet)
    }
    palAdjustedRental     = nonpassiveRentalNet + passiveAllowed
    rentalForEBL          = nonpassiveRentalNet
    rentalForNII          = Math.max(0, passiveAllowed)
    rentalQbiContribution = nonpassiveRentalNet + Math.max(0, passiveAllowed)
  }
  const eblThreshold = (getTable(taxYear).ebl?.[status]) ?? (['mfj','qss'].includes(status) ? 640000 : 320000)
  // Business capital gain for §461(l): f4797Inc (ordinary/§1231 entered as business income)
  // PLUS any §1231 gain entered separately for rate purposes (bizCapGain1231). The latter is
  // NOT added to gross income here — its income effect is already carried by ltGain/unrecap1250
  // — it only informs how much of the capital gain offsets business losses in the EBL netting.
  const extra1231BizGain      = Math.max(0, nv(bizCapGain1231))
  const eblBizCapGain         = Math.max(0, nv(f4797Inc)) + extra1231BizGain
  const eblOverallCapGainNI   = nv(stGain) + _ltGain + nv(f4797Inc)
                              
  const eblAllowedBizCapGain  = Math.max(0, Math.min(eblBizCapGain, eblOverallCapGainNI))
  const eblBizCapGainExcluded = eblBizCapGain - eblAllowedBizCapGain
  const eblBiz       = adjustedK1Total + (nv(f4797Inc) + extra1231BizGain - eblBizCapGainExcluded) + rentalForEBL
  const eblNetLoss   = Math.max(0, -eblBiz)
  const ebl          = Math.max(0, eblNetLoss - eblThreshold)
  const unrec1250    = Math.max(0, nv(unrecap1250))
  const collectibles = Math.max(0, nv(collectiblesGain))
  const seNetIncome = entitiesLimited.reduce((sum, e) => {
    if (!e || !SE_SUBJECT_TYPES.includes(e.type)) return sum
    const k1 = nv(e.k1) || Math.round(nv(e.pnl?.netProfit ?? e.netProfit) * (ownPct(e.own) / 100))
    return sum + Math.max(0, k1)
  }, 0)
  const ssWageBase = TAX_TABLES[taxYear]?.ssWageBase || 176100
  const seEarningsSubject = seNetIncome * SE_NET_EARNINGS_FACTOR
  const ssPortion         = Math.min(seEarningsSubject, ssWageBase) * (FICA_SS_RATE * 2)
  const medicarePortion   = seEarningsSubject * (FICA_MEDICARE_RATE * 2)
  const seTax             = Math.round(ssPortion + medicarePortion)
  const halfSE            = Math.round(seTax * SE_TAX_DEDUCTION_RATE)
  const totalW2ForFICA = Math.max(0, nv(w2))
  const empSS          = Math.min(totalW2ForFICA, ssWageBase) * FICA_SS_RATE
  const empMedicare    = totalW2ForFICA * FICA_MEDICARE_RATE
  const employeeFICA   = Math.round(empSS + empMedicare)
  const nonSEDistributions = entitiesLimited.reduce((sum, e) => {
    if (!e || SE_SUBJECT_TYPES.includes(e.type)) return sum
    if (isRealEstateEntity(e.type)) return sum
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
  const grossIncomeBeforeNOL = w2 + adjustedK1Total + palAdjustedRental + stGain + _ltGain
    + intInc + divInc + f4797Inc + taxableSS + iraIncome + ebl
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
    if (isRealEstateEntity(e?.type)) return sum
    const k1    = nv(e.k1) || Math.round(nv(e.pnl?.netProfit ?? e.netProfit) * (ownPct(e.own) / 100))
    const scale = e.box17V_sstb ? sstbApplicablePct : 1
    return sum + k1 * scale
  }, 0)
  const seK1AfterAdjustments = Math.max(0, seNetIncome - halfSE - selfEmpHealthDed)
  const k1FallbackForQBI = entitiesLimited.length === 0 ? adjustedK1Total : 0
  // rentalQbiContribution is computed in the §469 rental block above (legacy or
  // per-property branch) — do not redeclare here.
  const qbiBasis = nonSEk1 + seK1AfterAdjustments + rentalQbiContribution - effectiveQBILossCO + k1FallbackForQBI
  const f4797NetGain = Math.max(0, nv(f4797Inc))
  const prefIncome = _ltGain + qualDiv + f4797NetGain
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
  const totalPrefIncome       = Math.max(0, _ltGain) + Math.max(0, qualDiv) + f4797NetGain
  const taxableAfterQBI       = Math.max(0, taxableBeforeQBI - qbi)
  const ordinaryTaxableIncome = Math.max(0, taxableAfterQBI - totalPrefIncome)
  const taxableIncome         = taxableAfterQBI
  let _prefRoom = taxableAfterQBI
  const _ltcgClamped         = Math.min(Math.max(0, _ltGain) + f4797NetGain, _prefRoom); _prefRoom -= _ltcgClamped
  const _qualDivClamped      = Math.min(Math.max(0, qualDiv),   _prefRoom); _prefRoom -= _qualDivClamped
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
  const nii        = Math.max(0, intInc + divInc + Math.max(0, _ltGain + stGain + f4797NetGain) + rentalNII)
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
    ltGain: _ltGain + f4797NetGain, qualDiv, regularTax: fedTax, status, taxYear,
    useItemized, itemized, stdDed,
  })
  const totalTax      = Math.max(0, fedTax + seTax + additionalMedicare + niitAmount + amt - childCredit)
  const effectiveRate = grossIncome > 0 ? (totalTax / Math.max(1, w2 + Math.max(0, adjustedK1Total))) : 0
  const withheld      = nv(w2Withheld)
  const estimated     = nv(estPaid)
  const totalPayments = withheld + estimated
  const balance       = totalTax - totalPayments
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
        : (e.type === 'S Corporation' || e.type === 'C Corporation')
        ? 'K-1 (Form 1120-S)'
        : 'K-1 (Form 1065)',
    }
  }).filter(Boolean)
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
        ? `This is an informational flag, not a determination. Reasonable compensation is governed by the value of the services the shareholder-employee actually performs (Treas. Reg. §1.162-7), which the IRS evaluates under a facts-and-circumstances test — there is no published safe-harbor percentage. Here, the officer salary ($${Math.round(sal).toLocaleString()}) is ${Math.round(ratio * 100)}% of total S-Corp compensation. A salary-to-total-compensation band of roughly 35–45% is a rough benchmark some practitioners cite (drawing on case law such as Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012)); it is not a fixed ratio or a legal threshold. Treat a figure below it as a prompt to document how the salary reflects the services rendered, not as evidence the salary is wrong.`
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
    effectiveQBILossCO,
    perEntityQBILossCO,
    qbiCarryforward,
    nolAllowed,
    nolSurplus,
    ebl,
    eblThreshold,
    eblBizCapGainExcluded,
    palSuspendedRental,
    palCarryforwardApplied,
    palCarryforwardRemaining,
    rentalNetCombined:        combinedRentalNet,
    rentalAllowed:            palAdjustedRental,
    rentalAggregationElectionApplied: rentalAggregationElection,
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
