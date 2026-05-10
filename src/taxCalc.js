// Pure tax calculation helpers extracted from TaxReturn.jsx (Issue #59).
// No React, no DOM, no side effects. Safe to call from any module.
// Behavior is preserved exactly; this PR (PR-H1) only relocates already-pure
// module-scope helpers. PR-H2 will extract still-inline math into calcTaxReturn().

// ── IRS Tax Tables 2024-2026 ─────────────────────────────────────────────────
// Sources: Rev. Proc. 2023-34 (2024) | Rev. Proc. 2024-40 + OBBBA Rev. Proc. 2025-32 (2025) | Rev. Proc. 2025-32 (2026)
// Numeric value coercer — used throughout calcTaxReturn to safely cast form-state inputs (which may be empty strings, undefined, or numbers) to a finite number, defaulting to 0.
const nv = (v) => parseFloat(v) || 0

const TAX_TABLES = {
  2024: {
    std:      { single:14600, mfj:29200, mfs:14600, hoh:21900, qss:29200 },
    ssWageBase: 168600,
    brackets: {
      single: [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[609350,.35],[Infinity,.37]],
      mfj:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
      mfs:    [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[365600,.35],[Infinity,.37]],
      hoh:    [[16550,.10],[63100,.12],[100500,.22],[191950,.24],[243700,.32],[609350,.35],[Infinity,.37]],
      qss:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
    },
    ltcg: { single:[47025,518900], mfj:[94050,583750], mfs:[47025,291850], hoh:[63000,551350], qss:[94050,583750] },
    niit: { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    addlMed:  { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    // §461(l) excess business loss thresholds — Rev. Proc. 2023-34 §3.13 (2024)
    ebl: { single:305000, mfj:610000, mfs:305000, hoh:305000, qss:610000 },
  },
  2025: {
    std:      { single:15750, mfj:31500, mfs:15750, hoh:23625, qss:31500 },
    ssWageBase: 176100,
    brackets: {
      single: [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]],
      mfj:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
      mfs:    [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[313200,.35],[Infinity,.37]],
      hoh:    [[17000,.10],[64850,.12],[103350,.22],[197300,.24],[250500,.32],[626350,.35],[Infinity,.37]],
      qss:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
    },
    ltcg: { single:[48350,533400], mfj:[96700,600050], mfs:[48350,300000], hoh:[64750,566700], qss:[96700,600050] },
    niit: { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    addlMed:  { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    // §461(l) excess business loss thresholds — Rev. Proc. 2024-40 §3.14 (2025)
    ebl: { single:313000, mfj:626000, mfs:313000, hoh:313000, qss:626000 },
  },
  2026: {
    std:      { single:16100, mfj:32200, mfs:16100, hoh:24150, qss:32200 },
    ssWageBase: 184500,
    brackets: {
      single: [[12400,.10],[50000,.12],[106900,.22],[203900,.24],[259350,.32],[648750,.35],[Infinity,.37]],
      mfj:    [[24800,.10],[100000,.12],[213800,.22],[407800,.24],[518700,.32],[777650,.35],[Infinity,.37]],
      mfs:    [[12400,.10],[50000,.12],[106900,.22],[203900,.24],[259350,.32],[388825,.35],[Infinity,.37]],
      hoh:    [[17600,.10],[67050,.12],[106900,.22],[203900,.24],[259300,.32],[648700,.35],[Infinity,.37]],
      qss:    [[24800,.10],[100000,.12],[213800,.22],[407800,.24],[518700,.32],[777650,.35],[Infinity,.37]],
    },
    ltcg: { single:[50400,557050], mfj:[100800,626350], mfs:[50400,313175], hoh:[67650,591800], qss:[100800,626350] },
    niit: { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    addlMed:  { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    // §461(l) excess business loss thresholds — estimated 2026 (update when Rev. Proc. 2025-xx publishes)
    ebl: { single:320000, mfj:640000, mfs:320000, hoh:320000, qss:640000 },
  },
}
// ── AMT Tables — Form 6251 — IRC §55-59 ──
// 2024: Rev. Proc. 2023-34 §3.11 | 2025: Rev. Proc. 2024-40 §3.12 | 2026: Rev. Proc. 2025-32 §3.12 (post-OBBBA P.L. 119-21 §70107)
// Note: OBBBA returned 2026 phaseout thresholds to 2018 levels and doubled the phaseout rate from 25¢/dollar to 50¢/dollar over threshold.
// QSS uses MFJ amounts per §55(d)(1).
const AMT_TABLES = {
    2024: {
          exemption:        { single:85700,  mfj:133300, mfs:66650, hoh:85700,  qss:133300 },
          phaseoutStart:    { single:609350, mfj:1218700, mfs:609350, hoh:609350, qss:1218700 },
          phaseoutRate:     0.25,
          bracket26_28:     { single:232600, mfj:232600, mfs:116300, hoh:232600, qss:232600 },
    },
    2025: {
          exemption:        { single:88100,  mfj:137000, mfs:68650, hoh:88100,  qss:137000 },
          phaseoutStart:    { single:626350, mfj:1252700, mfs:626350, hoh:626350, qss:1252700 },
          phaseoutRate:     0.25,
          bracket26_28:     { single:239100, mfj:239100, mfs:119550, hoh:239100, qss:239100 },
    },
    2026: {
          exemption:        { single:90100,  mfj:140200, mfs:70100, hoh:90100,  qss:140200 },
          phaseoutStart:    { single:500000, mfj:1000000, mfs:500000, hoh:500000, qss:1000000 },
          phaseoutRate:     0.50, // OBBBA doubled the phaseout rate beginning 2026
          bracket26_28:     { single:244500, mfj:244500, mfs:122250, hoh:244500, qss:244500 },
    },
}
// SALT deduction caps — Schedule A Line 5e — IRC §164(b)(6) (TCJA) as amended by OBBBA §70106
// 2024: $10K (TCJA original); 2025: $40K (OBBBA increase); 2026: $40,400 (1% inflation adj per OBBBA); MFS = half
const SALT_CAPS = { 2024: 10000, 2025: 40000, 2026: 40400 }

function getTable(year) { return TAX_TABLES[year] || TAX_TABLES[2025] }
function getStdDed(year, fs) { const t = getTable(year).std; return t[fs] || t.single }
function getBrackets(year, fs) { const t = getTable(year).brackets; return t[fs] || t.single }
function getLTCGThresholds(year, fs) { const t = getTable(year).ltcg; return t[fs] || t.single }
function getNIITThreshold(year, fs) { const t = getTable(year).niit; return t[fs] || 200000 }
function getAddlMedicareThreshold(year, fs) { const t = getTable(year).addlMed; return t[fs] || 200000 }
// Marginal ordinary-income tax rate at a given taxable income level.
// Walks the year/status brackets and returns the rate of the bracket the income lands in.
// Used for planning-tool heuristics (e.g., "$X more income would cost $X * marginalRate in tax").
function getMarginalRate(taxable, year, fs) {
  let rate = 0.10, prev = 0
  for (const [cap, r] of getBrackets(year, fs)) {
    if (taxable > prev) rate = r
    prev = cap
  }
  return rate
}

// Ordinary income tax (brackets only — does NOT include LTCG/qualified dividends)
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

// ── IRS Qualified Dividends & Capital Gain Tax Worksheet (QDCGTW) ──────────────
// IRC §1(h) — LTCG and qualified dividends taxed at 0%, 15%, or 20%
// Also handles: Unrecaptured Sec 1250 gain (max 25%) and Collectibles gain (max 28%)
// ordinaryIncome = taxable income EXCLUDING preferential items
// prefItems = { ltcg, qualDiv, unrecap1250, collectibles }
function calcPreferentialTax(ordinaryIncome, prefItems, year, fs) {
  const { ltcg = 0, qualDiv = 0, unrecap1250 = 0, collectibles = 0 } = prefItems
  const [threshold0, threshold15] = getLTCGThresholds(year, fs)
  let tax = 0

  // Step 1: Total preferential income (LTCG + qualified dividends)
  const totalPref = ltcg + qualDiv
  if (totalPref <= 0 && unrecap1250 <= 0 && collectibles <= 0) return 0

  // Step 2: "Stacking" — ordinary income fills brackets first, then pref income stacks on top
  const ordFloor = Math.max(0, ordinaryIncome)

  // ── LTCG + Qualified Dividends (0/15/20% rates) ────────────────────────────
  if (totalPref > 0) {
    // Amount of LTCG in the 0% bucket
    const zeroRoom = Math.max(0, threshold0 - ordFloor)
    const atZero = Math.min(totalPref, zeroRoom)

    // Amount of LTCG in the 15% bucket
    const fifteenTop = threshold15
    const fifteenRoom = Math.max(0, fifteenTop - Math.max(ordFloor, threshold0))
    const remaining15 = totalPref - atZero
    const atFifteen = Math.min(remaining15, fifteenRoom)

    // Remainder at 20%
    const atTwenty = totalPref - atZero - atFifteen

    tax += atFifteen * 0.15
    tax += atTwenty * 0.20
  }

  // ── Unrecaptured Section 1250 Gain (max 25%) — IRC §1(h)(1)(D) ─────────────
  // Taxed at the LESSER of 25% or the taxpayer's ordinary bracket rate
  // For planning purposes: use 25% (conservative, correct for mid/high income)
  if (unrecap1250 > 0) {
    // Stack 1250 gain on top of ordinary income + LTCG already used
    const alreadyUsed = ordFloor + Math.min(totalPref, Math.max(0, threshold15 - ordFloor))
    // Rate is min(25%, marginal ordinary rate above this stack point)
    // Simplified: 25% for incomes above the 22% bracket, 22% for lower — use 25% for planning
    tax += unrecap1250 * 0.25
  }

  // ── Collectibles Gain (max 28%) — IRC §1(h)(4) ─────────────────────────────
  if (collectibles > 0) {
    tax += collectibles * 0.28
  }

  return Math.round(tax)
}

// Net Investment Income Tax — IRC §1411 — 3.8% on lesser of NII or excess AGI over threshold
function calcNIIT(nii, agi, year, fs) {
  const threshold = getNIITThreshold(year, fs)
  if (agi <= threshold || nii <= 0) return 0
  const excessAGI = agi - threshold
  return Math.round(Math.min(nii, excessAGI) * 0.038)
}

// ── Alternative Minimum Tax — Form 6251 — IRC §55-59 ──────────────────────────
// AMTI = taxableIncome + QBI add-back (§199A(f)(2)) + SALT add-back (post-cap, §56(b)(1)(A)(ii) / Form 6251 line 2a)
// Note: standard deduction is NOT added back (§56(b)(1)(F) since TCJA 2018, made permanent by OBBBA)
// LTCG/qualified dividends carved out of AMTI for ordinary 26/28% calc; taxed at preferential rates via existing calcPreferentialTax
// Tentative Minimum Tax = ordinary AMT (26/28%) + preferential AMT (0/15/20%); AMT owed = max(0, TMT − regular tax)
// SALT_CAPS parameterized per year — see top of file. ISO bargain element wiring deferred to PR-C (Issue #44).
function calcAMT({ taxableIncome, qbi, saltAmount, isoBargainElement, ltGain, qualDiv, regularTax, status, taxYear, useItemized, itemized, stdDed }) {
  const amtTable = AMT_TABLES[taxYear] || AMT_TABLES[2025]
  const baseSaltCap = SALT_CAPS[taxYear] || SALT_CAPS[2025]
  const saltCap = status === 'mfs' ? baseSaltCap / 2 : baseSaltCap
  // SALT add-back applies ONLY if filer is actually itemizing (and itemized exceeds stdDed, which is what triggers Schedule A)
  const isItemizing = useItemized && itemized > stdDed
  const saltAddback = isItemizing ? Math.min(Math.max(0, saltAmount), saltCap) : 0
  // QBI add-back per §199A(f)(2): taxableIncome already had QBI subtracted; restore it for AMTI
  // ISO bargain element add-back per §56(b)(3) / Form 6251 line 2i — never capped, always added when present
  const isoAddback = Math.max(0, isoBargainElement || 0)
  const amti = Math.max(0, taxableIncome) + Math.max(0, qbi) + saltAddback + isoAddback
  // Exemption with phaseout — phaseoutRate is 0.25 (pre-OBBBA) or 0.50 (2026+ OBBBA, already encoded in AMT_TABLES)
  const phaseoutOver = Math.max(0, amti - amtTable.phaseoutStart[status])
  const exemption = Math.max(0, amtTable.exemption[status] - phaseoutOver * amtTable.phaseoutRate)
  const amtTaxable = Math.max(0, amti - exemption)
  if (amtTaxable === 0) return 0
  // Carve out preferential-rate income — taxed at LTCG rates inside AMT, not 26/28%
  const preferential = Math.max(0, ltGain) + Math.max(0, qualDiv)
  const ordinaryAMTI = Math.max(0, amtTaxable - preferential)
  // 26% / 28% on ordinary AMTI; bracket26_28 is the threshold ($232,600 in 2024 etc., MFS = half, already encoded)
  const threshold = amtTable.bracket26_28[status]
  const ordinaryAMT = ordinaryAMTI <= threshold
    ? ordinaryAMTI * 0.26
    : threshold * 0.26 + (ordinaryAMTI - threshold) * 0.28
  // Reuse calcPreferentialTax for the LTCG portion — same 0/15/20% brackets apply inside AMT
  // Stack preferential income on top of ordinaryAMTI, mirroring the QDCGTW logic
  const preferentialAMT = calcPreferentialTax(ordinaryAMTI, { ltcg: Math.max(0, ltGain), qualDiv: Math.max(0, qualDiv) }, taxYear, status)
  const tentativeMinimumTax = Math.round(ordinaryAMT + preferentialAMT)
  // AMT owed = excess of TMT over regular tax (regular tax here = fedTax = ordinary + LTCG combined, which matches Form 6251 line 9)
  return Math.max(0, tentativeMinimumTax - Math.max(0, regularTax))
}

// §199A QBI threshold amounts per IRC §199A(e)(2), inflation-adjusted per IRS Rev. Proc.
// Above the threshold, the wage/UBIA limit (§199A(b)(2)) and SSTB exclusion (§199A(d)(2)) apply.
// §199A(e)(2) threshold amounts (start of phase-in) — taxable income above which
// wage/UBIA limits and SSTB exclusion begin to phase in.
// Sources: Rev. Proc. 2023-34 (2024), Rev. Proc. 2024-40 (2025), Rev. Proc. 2025-32 (2026 post-OBBBA).
const QBI_THRESHOLDS = {
  2024: { single: 191950, mfj: 383900, hoh: 191950, mfs: 191950 },
  2025: { single: 197300, mfj: 394600, hoh: 197300, mfs: 197300 },
  2026: { single: 201775, mfj: 403500, hoh: 201775, mfs: 201775 }
};

// §199A(b)(3)(B) phase-in range — wage/UBIA limit and SSTB exclusion phase in linearly
// across this band above threshold. OBBBA (P.L. 119-21) expanded the range to
// $75K/$150K starting tax year 2026; 2024–2025 retain the original $50K/$100K.
const QBI_PHASE_IN_RANGE = {
  2024: { single: 50000, mfj: 100000, hoh: 50000, mfs: 50000 },
  2025: { single: 50000, mfj: 100000, hoh: 50000, mfs: 50000 },
  2026: { single: 75000, mfj: 150000, hoh: 75000, mfs: 75000 }
};

// §199A(i) — OBBBA P.L. 119-21 minimum deduction for active QBI.
// For tax years beginning after 12/31/2025: if aggregate QBI from active QTBs
// (material participation per §469(h)) is ≥ $1,000, deduction is the GREATER
// of the regular calc or $400. The conforming amendment to §199A(a) ("except
// as provided in subsection (i),") carves out (i) from the lesser-of, so the
// floor overrides the TI cap when it binds.
// Both amounts indexed for inflation in $5 increments after 2026 — extend
// these tables once IRS publishes the 2027 Rev. Proc.
const QBI_MIN_DEDUCTION = {
  2026: 400
};
const QBI_MIN_THRESHOLD = {
  2026: 1000
};

// §199A(i) — apply minimum deduction to a calcQBI result.
// Greater of the regular result or $400 when applicable taxpayer (active QBI ≥ $1,000).
function _applyMinQBI(result, activeQbiForFloor, taxYear) {
  const floor = QBI_MIN_DEDUCTION[taxYear];
  const threshold = QBI_MIN_THRESHOLD[taxYear];
  if (floor == null || threshold == null) return result;
  if (activeQbiForFloor < threshold) return result;
  if (result.deduction >= floor) {
    return { ...result, caps: { ...result.caps, min400: floor } };
  }
  return {
    deduction: floor,
    limitApplied: 'min400',
    caps: { ...result.caps, min400: floor },
  };
}

function calcQBI(qbiIncome, taxableBeforeQBI, capitalGains, opts = {}) {
  const { status = 'single', taxYear = 2025, entityQbiData = [], activeQbi } = opts;

  if (qbiIncome <= 0 || taxableBeforeQBI <= 0) {
    return _applyMinQBI(
      { deduction: 0, limitApplied: 'none', caps: { qbi: 0, wage: null, income: 0 } },
      activeQbi !== undefined ? activeQbi : qbiIncome,
      taxYear
    );
  }

  const netCapGain = Math.max(0, capitalGains);
  const incomeLimitation = Math.max(0, taxableBeforeQBI - netCapGain) * 0.20;
  const qbiComponent = qbiIncome * 0.20;

  const thresholds = QBI_THRESHOLDS[taxYear] || QBI_THRESHOLDS[2025];
  const threshold = thresholds[status] || thresholds.single;

  if (taxableBeforeQBI <= threshold) {
    const ded = Math.min(qbiComponent, incomeLimitation);
    const limitApplied = qbiComponent <= incomeLimitation ? 'qbi' : 'income';
    return _applyMinQBI(
      {
        deduction: Math.round(ded) || 0,
        limitApplied,
        caps: { qbi: Math.round(qbiComponent), wage: null, income: Math.round(incomeLimitation) }
      },
      activeQbi !== undefined ? activeQbi : qbiIncome,
      taxYear
    );
  }

  const phaseInForYear = QBI_PHASE_IN_RANGE[taxYear] || QBI_PHASE_IN_RANGE[2025];
  const phaseInRange = phaseInForYear[status] || phaseInForYear.single;
  const excessOverThreshold = taxableBeforeQBI - threshold;
  const phasePercent = Math.min(1, excessOverThreshold / phaseInRange);
  const sstbApplicablePct = Math.max(0, 1 - phasePercent);

  const sstbEntityQBI = entityQbiData.reduce((s, e) => {
    if (!e.box17V_sstb) return s;
    const k1Income = parseFloat(
      e.k1 ?? Math.round(parseFloat(e.netProfit || 0) * ((parseInt(e.own) || 100) / 100))
    ) || 0;
    return s + Math.max(0, k1Income);
  }, 0);

  const adjQBI = Math.max(0, qbiIncome - sstbEntityQBI * (1 - sstbApplicablePct));
  const scaledQbiComponent = adjQBI * 0.20;
  const activeQbiForFloor = activeQbi !== undefined ? activeQbi : adjQBI;

  const totalWages = entityQbiData.reduce((s, e) => {
    const w = parseFloat(e.box17V_wages) || 0;
    return s + (e.box17V_sstb ? w * sstbApplicablePct : w);
  }, 0);
  const totalUBIA = entityQbiData.reduce((s, e) => {
    const u = parseFloat(e.box17V_ubia) || 0;
    return s + (e.box17V_sstb ? u * sstbApplicablePct : u);
  }, 0);

  if (totalWages === 0 && totalUBIA === 0) {
    const ded = Math.min(scaledQbiComponent, incomeLimitation);
    const limitApplied = scaledQbiComponent <= incomeLimitation ? 'qbi' : 'income';
    return _applyMinQBI(
      {
        deduction: Math.round(ded) || 0,
        limitApplied,
        caps: { qbi: Math.round(scaledQbiComponent), wage: null, income: Math.round(incomeLimitation) }
      },
      activeQbiForFloor,
      taxYear
    );
  }

  const wageLimit = Math.max(totalWages * 0.50, totalWages * 0.25 + totalUBIA * 0.025);

  let limitedAmount;
  let wageBindingActive;
  if (excessOverThreshold >= phaseInRange) {
    limitedAmount = Math.min(scaledQbiComponent, wageLimit);
    wageBindingActive = wageLimit < scaledQbiComponent;
  } else {
    const reduction = Math.max(0, scaledQbiComponent - wageLimit) * phasePercent;
    limitedAmount = scaledQbiComponent - reduction;
    wageBindingActive = reduction > 0;
  }

  const ded = Math.min(limitedAmount, incomeLimitation);
  let limitApplied;
  if (incomeLimitation < limitedAmount) {
    limitApplied = 'income';
  } else if (wageBindingActive) {
    limitApplied = 'wage';
  } else {
    limitApplied = 'qbi';
  }

  return _applyMinQBI(
    {
      deduction: Math.round(ded) || 0,
      limitApplied,
      caps: {
        qbi: Math.round(scaledQbiComponent),
        wage: Math.round(wageLimit),
        income: Math.round(incomeLimitation)
      }
    },
    activeQbiForFloor,
    taxYear
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// calcTaxReturn — top-level pure orchestrator (Issue #59 PR-H2)
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
  } = input

  const ytdScale = (val) => Math.round(nv(val) * ytdFactor)
  const priorQBILossCO = Math.abs(nv(priorYearQBILoss))

  // ── §469 Passive Activity Loss (PAL) Limitation ─────────────────────────────
  let palAdjustedRental = rentalNet
  let palSuspendedRental = 0
  if (!isREP && rentalNet < 0) {
    const preRentalAGI = w2 + k1Total + f4797Inc + stGain + ltGain + intInc + divInc + iraIncome
      - Math.min(ytdScale(studentLoanInt), 2500)
      - ytdScale(hsaDeduction)
      - ytdScale(selfEmpRetirement)
      - ytdScale(selfEmpHealthIns)
    const isMFS = status === 'mfs'
    const baseAllowance = (isMFS || !isActiveParticipant) ? 0 : 25000
    const phaseStart    = isMFS ? 0 : 100000
    const specialAllowance = Math.max(0, baseAllowance - Math.max(0, (preRentalAGI - phaseStart) * 0.5))
    palAdjustedRental = Math.max(rentalNet, -specialAllowance)
    palSuspendedRental = Math.round(palAdjustedRental - rentalNet)
  }

  // ── §461(l) Excess Business Loss (EBL) Limitation ───────────────────────────
  const eblThreshold = (getTable(taxYear).ebl?.[status]) ?? ((['mfj','qss'].includes(status)) ? 626000 : 313000)
  const eblBiz = k1Total + f4797Inc + (isREP ? rentalNet : palAdjustedRental)
  const eblNetLoss = Math.max(0, -eblBiz)
  const ebl = Math.max(0, eblNetLoss - eblThreshold)

  const grossIncome = w2 + k1Total + palAdjustedRental + stGain + ltGain + intInc + divInc + f4797Inc + taxableSS + iraIncome + ebl - Math.max(0, nv(nolCarryforward))

  const SE_SUBJECT_TYPES = ['Sole Proprietor / Single-Member LLC', 'Partnership / MMLLC — Active']
  const seNetIncome = entities.reduce((sum, e) => {
    if (!e || !SE_SUBJECT_TYPES.includes(e.type)) return sum
    return sum + Math.max(0, parseFloat(e.k1) || 0)
  }, 0)

  const ssWageBase = TAX_TABLES[taxYear]?.ssWageBase || 176100
  const seEarningsSubject = seNetIncome * 0.9235
  const ssPortion = Math.min(seEarningsSubject, ssWageBase) * 0.124
  const medicarePortion = seEarningsSubject * 0.029
  const seTax = Math.round(ssPortion + medicarePortion)
  const halfSE = Math.round(seTax / 2)

  const selfEmpHealthDed = ytdScale(selfEmpHealthIns)
  const hsaDed = ytdScale(hsaDeduction)
  const studentLoanDed = Math.min(ytdScale(studentLoanInt), 2500)
  const selfEmpRetirementDed = ytdScale(selfEmpRetirement)
  const adjustments = halfSE + selfEmpHealthDed + hsaDed + studentLoanDed + selfEmpRetirementDed
  const agi = grossIncome - adjustments

  const stdDed = getStdDed(taxYear, status)
  const itemized = nv(itemizedAmt)
  const deduction = useItemized ? Math.max(stdDed, itemized) : stdDed

  const unrec1250 = Math.max(0, nv(unrecap1250))
  const collectibles = Math.max(0, nv(collectiblesGain))

  const taxableBeforeQBI = Math.max(0, agi - deduction)

  const _sstbThresholds = QBI_THRESHOLDS[taxYear] || QBI_THRESHOLDS[2025]
  const _sstbPhaseIn    = QBI_PHASE_IN_RANGE[taxYear] || QBI_PHASE_IN_RANGE[2025]
  const qbiThreshold  = _sstbThresholds[status] || _sstbThresholds.single
  const qbiPhaseRange = _sstbPhaseIn[status]    || _sstbPhaseIn.single
  const sstbApplicablePct = taxableBeforeQBI <= qbiThreshold
    ? 1
    : Math.max(0, 1 - Math.min(1, (taxableBeforeQBI - qbiThreshold) / qbiPhaseRange))

  const nonSEk1 = entities.reduce((sum, e) => {
    if (!e || SE_SUBJECT_TYPES.includes(e?.type)) return sum
    const k1 = parseFloat(e.k1 ?? 0) || (parseFloat(e.netProfit || 0) * ((parseInt(e.own) || 100) / 100))
    const scale = e.box17V_sstb ? sstbApplicablePct : 1
    return sum + k1 * scale
  }, 0)
  const seK1AfterAdjustments = Math.max(0, seNetIncome - halfSE - selfEmpHealthDed)

  const k1FallbackForQBI = entities.length === 0 ? k1Total : 0
  const qbiBasis = nonSEk1 + seK1AfterAdjustments + Math.max(0, palAdjustedRental) - priorQBILossCO + k1FallbackForQBI

  const prefIncome = ltGain + qualDiv
  const _qbiResult = calcQBI(qbiBasis, taxableBeforeQBI, prefIncome, { status, taxYear, entityQbiData: entities })
  const qbi = _qbiResult.deduction
  const qbiLimitApplied = _qbiResult.limitApplied
  const qbiCaps = _qbiResult.caps
  const qbiCarryforward = qbiBasis < 0 ? Math.abs(qbiBasis) : 0

  const totalPrefIncome = Math.max(0, ltGain) + Math.max(0, qualDiv) + unrec1250 + collectibles
  const taxableAfterQBI = Math.max(0, taxableBeforeQBI - qbi)
  const ordinaryTaxableIncome = Math.max(0, taxableAfterQBI - totalPrefIncome)
  const taxableIncome = taxableAfterQBI

  const ordFedTax = calcFederalTax(ordinaryTaxableIncome, taxYear, status)

  const prefTax = calcPreferentialTax(ordinaryTaxableIncome, {
    ltcg: Math.min(Math.max(0, ltGain), taxableAfterQBI),
    qualDiv: Math.min(Math.max(0, qualDiv), taxableAfterQBI),
    unrecap1250: Math.min(unrec1250, taxableAfterQBI),
    collectibles: Math.min(collectibles, taxableAfterQBI),
  }, taxYear, status)

  const fedTax = ordFedTax + prefTax

  const brackets = getBrackets(taxYear, status)
  let marginalRate = 0
  if (ordinaryTaxableIncome > 0) {
    let prev = 0
    for (const [cap, rate] of brackets) {
      if (ordinaryTaxableIncome > prev) { marginalRate = rate }
      prev = cap
    }
  } else if (totalPrefIncome > 0) {
    const [t0, t15] = getLTCGThresholds(taxYear, status)
    marginalRate = totalPrefIncome > t15 ? 0.20 : totalPrefIncome > t0 ? 0.15 : 0
  }

  const addlMedThreshold = getAddlMedicareThreshold(taxYear, status)
  const additionalMedicare = Math.round(Math.max(0, w2 + seEarningsSubject - addlMedThreshold) * 0.009)

  const rentalNII = isREP ? 0 : Math.max(0, rentalNet)
  const nii = Math.max(0, intInc + divInc + Math.max(0, ltGain + stGain) + rentalNII)
  const niit = calcNIIT(nii, agi, taxYear, status)

  const numDependents = parseInt(dependents) || 0
  const childCredit = Math.min(numDependents * 2000, fedTax + additionalMedicare + niit)

  const amt = calcAMT({ taxableIncome, qbi, saltAmount: nv(saltAmount), isoBargainElement: hasISO ? nv(isoBargainElement) : 0, ltGain, qualDiv, regularTax: fedTax, status, taxYear, useItemized, itemized, stdDed })
  const totalTax = Math.max(0, fedTax + seTax + additionalMedicare + niit + amt - childCredit)

  const effectiveRate = grossIncome > 0 ? (totalTax / Math.max(1, w2 + Math.max(0, k1Total))) : 0

  const withheld = nv(w2Withheld)
  const estimated = nv(estPaid)
  const totalPayments = withheld + estimated
  const balance = totalTax - totalPayments

  const quarterlyRecommended = balance > 0 ? Math.round(balance / 4) : 0

  return {
    grossIncome, agi,
    seNetIncome, seEarningsSubject, seTax, halfSE,
    selfEmpHealthDed, hsaDed, studentLoanDed, selfEmpRetirementDed, adjustments,
    stdDed, itemized, deduction,
    unrec1250, collectibles,
    nonSEk1, seK1AfterAdjustments, qbiBasis, taxableBeforeQBI, prefIncome, qbi, qbiLimitApplied, qbiCaps,
    totalPrefIncome, taxableAfterQBI, ordinaryTaxableIncome, taxableIncome,
    ordFedTax, prefTax, fedTax,
    marginalRate,
    addlMedThreshold, additionalMedicare, rentalNII, nii, niit,
    numDependents, childCredit,
    amt,
    totalTax, effectiveRate,
    withheld, estimated, totalPayments, balance, quarterlyRecommended,
    priorQBILossCO,
    qbiCarryforward,
    ebl,
    palSuspendedRental,
  }
}

// ── Planning heuristics — IRC-grounded rate constants ────────────────────────
// FIX (C-05): These constants were previously hardcoded in multiple components.
// Centralizing here means a single Rev. Proc. update propagates everywhere.

// SEP-IRA / Solo 401(k) annual addition limit — IRC §415(c)(1)(A), inflation-indexed.
// S-Corp owners base contributions on officer W-2 salary (×SEP_SCORP_RATE).
// Sole props base on net SE earnings after half-SE deduction (×SEP_SOLEPROP_RATE).
// 2024: $66,000 (Rev. Proc. 2023-34); 2025: $70,000 (Rev. Proc. 2024-40);
// 2026: $70,000 (estimated — update when Rev. Proc. 2025-xx publishes).
const SEP_IRA_LIMITS = { 2024: 66000, 2025: 70000, 2026: 70000 }

// S-Corp owner SEP-IRA / Solo 401(k) contribution rate — 25% of officer W-2 salary
// per IRC §402(h) and §415(c). K-1 distributions do NOT qualify as the base.
// IRS Pub. 560 worksheet confirms this. Excess contributions trigger §4973 excise tax.
const SEP_SCORP_RATE = 0.25

// Sole prop / general partner SEP-IRA rate — simplified as ~20% of net profit.
// Exact derivation: 0.25 / 1.25 = 0.20, accounting for the half-SE tax deduction
// that reduces the contribution base. (IRS Pub. 560 Worksheet 1.)
const SEP_SOLEPROP_RATE = 0.20

// Reasonable compensation ratios — IRC §3121(a); Rev. Rul. 74-44; Watson v. Comm'r (8th Cir. 2012).
// IRS benchmarks S-Corp owner-operator salary at 30–60% of net profit.
// MIN_PCT: minimum defensible floor used in planning alerts.
// TARGET_PCT: conservative IRS audit benchmark (40% threshold that triggers scrutiny review).
const REASONABLE_COMP_MIN_PCT    = 0.35
const REASONABLE_COMP_TARGET_PCT = 0.40

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
  // FIX (C-05): planning heuristic constants — previously hardcoded in components
  SEP_IRA_LIMITS,
  SEP_SCORP_RATE,
  SEP_SOLEPROP_RATE,
  REASONABLE_COMP_MIN_PCT,
  REASONABLE_COMP_TARGET_PCT,
}
