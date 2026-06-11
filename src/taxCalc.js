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
//
// ── Engine change log ───────────────────────────────────────────────────────
// The historical fix log that used to live here (M-2, F6/F5, TAX-10, PASS4B-*, etc.)
// was moved to CHANGELOG.md (audit F9) so this header documents current behavior and the
// export map only. Record future engine changes in CHANGELOG.md and commit messages,
// not in source comments. Behavior-describing notes and IRC-section citations stay inline
// at the relevant code below.
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
  CTC_PHASEOUT_THRESHOLD_MFJ,
  CTC_PHASEOUT_THRESHOLD_OTHER,
  CTC_PHASEOUT_STEP,
  CTC_PHASEOUT_REDUCTION_PER_STEP,
  C_CORP_TAX_RATE,
  DEFAULT_OFFICER_SALARY_FRACTION,
} from './constants.js'
import { normalizeEntityType, isRealEstateEntity, ownPct } from './utils/entityPredicates.js'
const nv = (v) => parseFloat(v) || 0
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
    amt: {
      exemption:    { single:85700,  mfj:133300, mfs:66650,  hoh:85700,  qss:133300 },
      phaseoutStart:{ single:609350, mfj:1218700,mfs:609350, hoh:609350, qss:1218700 },
      phaseoutRate: 0.25,
      bracket26_28: { single:232600, mfj:232600, mfs:116300, hoh:232600, qss:232600 },
    },
    saltCap: 10000,
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
    amt: {
      exemption:    { single:88100,  mfj:137000, mfs:68650,  hoh:88100,  qss:137000 },
      phaseoutStart:{ single:626350, mfj:1252700,mfs:626350, hoh:626350, qss:1252700 },
      phaseoutRate: 0.25,
      bracket26_28: { single:239100, mfj:239100, mfs:119550, hoh:239100, qss:239100 },
    },
    saltCap: 40000,
    qbi: {
      threshold:    { single:197300, mfj:394600, hoh:197300, mfs:197300 },
      phaseIn:      { single:50000,  mfj:100000, hoh:50000,  mfs:50000 },
      minDeduction: null,
      minThreshold: null,
    },
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
    amt: {
      exemption:    { single:90100,  mfj:140200, mfs:70100,  hoh:90100,  qss:140200 },
      phaseoutStart:{ single:500000, mfj:1000000,mfs:500000, hoh:500000, qss:1000000 },
      phaseoutRate: 0.50,
      bracket26_28: { single:244500, mfj:244500, mfs:122250, hoh:244500, qss:244500 },
    },
    saltCap: 40400,
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
const QBI_THRESHOLDS     = _byYear(t => t.qbi.threshold)
const QBI_PHASE_IN_RANGE = _byYear(t => t.qbi.phaseIn)
const QBI_MIN_DEDUCTION  = _byYearDefined(t => t.qbi.minDeduction)
const QBI_MIN_THRESHOLD  = _byYearDefined(t => t.qbi.minThreshold)
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
    // C-10 FIX (§1366(d)/§704(d) conservative default): opt-in flag. When true, a
    // limitable entity (S-Corp / partnership) that shows a LOSS but has NO stock/debt
    // basis entered is treated as having $0 basis — the full loss is suspended and
    // carried forward (§1366(d)(2)) instead of deducting against other income. Defaults
    // false so existing engine unit tests (which model losses without basis as fully
    // allowed) are unaffected; the live app (TaxReturn, CalculateTaxInner) passes true.
    assumeZeroBasisOnLoss = false,
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
      (e.stockBasis !== undefined && e.stockBasis !== null &&
       e.stockBasis !== '' && e.stockBasis !== 0) ||
      String(e.stockBasis) === '0'
    )
    // C-10 FIX: when assumeZeroBasisOnLoss is set, a limitable entity with a LOSS is
    // run through the §1366(d) limit even with no basis figure entered — basis is
    // conservatively assumed to be $0 and the full loss is suspended until the
    // shareholder enters their Form 7203 basis. Without the flag (engine default), a
    // loss with no basis input still passes through in full, preserving prior behavior.
    const applyLimit = isLimitable && k1Gross < 0 && (hasBasisInput || assumeZeroBasisOnLoss)
    if (!applyLimit) {
      const sbPassthrough = hasBasisInput ? Math.max(0, parseFloat(e.stockBasis) || 0) : undefined
      const dbPassthrough = hasBasisInput ? Math.max(0, parseFloat(e.debtBasis)  || 0) : undefined
      entityBasisResults.push({
        name: e.name || e.id || 'Entity', type: e.type,
        k1Gross, k1Allowed: k1Gross, suspended: 0,
        ...(sbPassthrough !== undefined ? { stockBasis: sbPassthrough, debtBasis: dbPassthrough } : {}),
      })
      return e
    }
    // basisAssumedZero distinguishes "you have insufficient entered basis" from
    // "you entered no basis at all and we conservatively assumed $0" so the UI can
    // tailor the message (enter Form 7203 basis to release the loss).
    const basisAssumedZero = !hasBasisInput
    const sb          = Math.max(0, parseFloat(e.stockBasis) || 0)
    const db          = Math.max(0, parseFloat(e.debtBasis)  || 0)
    const totalBasis  = sb + db
    const grossLoss   = Math.abs(k1Gross)
    const allowedLoss = Math.min(grossLoss, totalBasis)
    const suspended   = grossLoss - allowedLoss
    const k1Allowed   = allowedLoss > 0 ? -allowedLoss : 0
    entityBasisResults.push({ name: e.name || e.id || 'Entity', type: e.type, k1Gross, k1Allowed, suspended, stockBasis: sb, debtBasis: db, totalBasis, basisAssumedZero })
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
    const k1 = nv(e.k1) || Math.round(nv(e.pnl?.netProfit ?? e.netProfit) * (ownPct(e.own) / 100))
    return sum + Math.max(0, k1)
  }, 0)
  const ssWageBase = getTable(taxYear).ssWageBase
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
    // QBI-179 FIX: net the separately-stated §179 (box11_12) and box12/13 out of the
    // QBI basis, mirroring the ordinary K-1 net used everywhere else (the rental net
    // in the §469 blocks above and persistStep1's k1Total = net − box11_12 − box12_13).
    // Previously this used gross netProfit×ownership, so a pass-through that took §179
    // had its §199A deduction computed on the pre-§179 amount — overstating the 20%
    // deduction and disagreeing with AGI (which already nets §179 via k1Total) and with
    // the AI Analysis tab (which reads the §179-netted k1Income). §179 reduces QBI per
    // Treas. Reg. §1.199A-3(b)(1)(ii)(A).
    const k1Gross = nv(e.k1) || Math.round(nv(e.pnl?.netProfit ?? e.netProfit) * (ownPct(e.own) / 100))
    const k1      = k1Gross - nv(e.box11_12) - nv(e.box12_13)
    const scale   = e.box17V_sstb ? sstbApplicablePct : 1
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
  const ctcPhaseoutThreshold = (status === 'mfj' || status === 'qss') ? CTC_PHASEOUT_THRESHOLD_MFJ : CTC_PHASEOUT_THRESHOLD_OTHER
  const ctcExcess            = Math.max(0, agi - ctcPhaseoutThreshold)
  const ctcReduction         = Math.ceil(ctcExcess / CTC_PHASEOUT_STEP) * CTC_PHASEOUT_REDUCTION_PER_STEP
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
  const np         = Math.max(0, Math.round(nv(netProfit)))

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
    w2:       nv(personalContext.w2)      + salary,
    qualDiv:  nv(personalContext.qualDiv) + dividends,
    divInc:   nv(personalContext.divInc)  + dividends,
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
  nv,
  calcTaxReturn,
}
