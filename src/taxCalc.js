// Pure tax calculation helpers extracted from TaxReturn.jsx (Issue #59).
// No React, no DOM, no side effects. Safe to call from any module.
// Behavior is preserved exactly; this PR (PR-H1) only relocates already-pure
// module-scope helpers. PR-H2 will extract still-inline math into calcTaxReturn().

// ── IRS Tax Tables 2024-2026 ─────────────────────────────────────────────────
// Sources: Rev. Proc. 2023-34 (2024) | Rev. Proc. 2024-40 + OBBBA Rev. Proc. 2025-32 (2025) | Rev. Proc. 2025-32 (2026)
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
const QBI_THRESHOLDS = {
  2024: { single: 241950, mfj: 483900, hoh: 241950, mfs: 241950 },
  2025: { single: 250500, mfj: 501000, hoh: 250500, mfs: 250500 },
  2026: { single: 261650, mfj: 523300, hoh: 261650, mfs: 261650 }
};

function calcQBI(qbiIncome, taxableBeforeQBI, capitalGains, opts = {}) {
  const { status = 'single', taxYear = 2025, entityQbiData = [] } = opts;
  if (qbiIncome <= 0 || taxableBeforeQBI <= 0) return 0;
  const netCapGain = Math.max(0, capitalGains);
  const incomeLimitation = Math.max(0, taxableBeforeQBI - netCapGain) * 0.20;
  const qbiComponent = qbiIncome * 0.20;

  // §199A(e)(2) threshold check
  const thresholds = QBI_THRESHOLDS[taxYear] || QBI_THRESHOLDS[2025];
  const threshold = thresholds[status] || thresholds.single;

  // Below threshold: simple 20% of QBI capped by income limitation, no wage/UBIA/SSTB limits
  if (taxableBeforeQBI <= threshold) {
    return Math.round(Math.min(qbiComponent, incomeLimitation)) || 0;
  }

  // Above threshold: apply §199A(b)(2) wage/UBIA limit
  // Phase-in approximation: hard cutoff at threshold (true phase-in spans 50K single / 100K MFJ above threshold)
  const totalWages = entityQbiData.reduce((s, e) => s + (parseFloat(e.box17V_wages) || 0), 0);
  const totalUBIA = entityQbiData.reduce((s, e) => s + (parseFloat(e.box17V_ubia) || 0), 0);

  // If no Box 17V data entered, preserve backward-compat behavior (simple 20%).
  // Users above threshold should enter wages/UBIA from K-1 Box 17V (S-corp) / Box 20Z (partnership) for accurate calc.
  if (totalWages === 0 && totalUBIA === 0) {
    return Math.round(Math.min(qbiComponent, incomeLimitation)) || 0;
  }

  // Wage/UBIA limit per §199A(b)(2): greater of 50% wages OR 25% wages + 2.5% UBIA
  const wageLimit = Math.max(totalWages * 0.50, totalWages * 0.25 + totalUBIA * 0.025);

  return Math.round(Math.min(qbiComponent, wageLimit, incomeLimitation)) || 0;
}
// ─────────────────────────────────────────────────────────────────────────────
// calcTaxReturn — top-level pure orchestrator (Issue #59 PR-H2)
// ─────────────────────────────────────────────────────────────────────────────
// Pure function: takes a config object of pre-scaled income inputs + raw
// adjustment/payment strings + ytdFactor for internal scaling, returns a result
// object with all derived calc values.
//
// Contract: this function is PURE. No React, no state, no side effects.
// Same input → same output, always. Safe to call multiple times for scenario
// comparisons (Issue #45 — Scenario Compare v1).
//
// Input shape:
//   Filing context: taxYear, status, dependents
//   Entities: entities[]
//   Pre-YTD-scaled income: w2, k1Total, rentalNet, stGain, ltGain, intInc,
//     divInc, qualDiv, f4797Inc, taxableSS, iraIncome
//   Raw strings (orchestrator nv()s + ytdScales as appropriate):
//     selfEmpHealthIns, hsaDeduction, studentLoanInt, nolCarryforward,
//     priorYearQBILoss, itemizedAmt, saltAmount, isoBargainElement,
//     unrecap1250, collectiblesGain, w2Withheld, estPaid
//   Booleans: useItemized, hasISO, isREP
//   YTD scaling: ytdFactor (1 = no scaling; e.g. 12/3 = scale Q1 to full year)
function calcTaxReturn(input) {
  const {
    taxYear, status, dependents,
    entities = [],
    w2 = 0, k1Total = 0, rentalNet = 0,
    stGain = 0, ltGain = 0, intInc = 0, divInc = 0, qualDiv = 0,
    f4797Inc = 0, taxableSS = 0, iraIncome = 0,
    selfEmpHealthIns, hsaDeduction, studentLoanInt,
    nolCarryforward, priorYearQBILoss,
    useItemized, itemizedAmt, saltAmount,
    hasISO, isoBargainElement,
    isREP,
    unrecap1250, collectiblesGain,
    w2Withheld, estPaid,
    ytdFactor = 1,
  } = input

  // Internal helper: matches the component's ytdScale closure
  const ytdScale = (val) => Math.round(nv(val) * ytdFactor)

  // QBI loss carryforward — reduces qbiBasis only, NOT AGI; not YTD-scaled (annual amount)
  const priorQBILossCO = Math.abs(nv(priorYearQBILoss))

  // Total gross income (Schedule 1 Line 8a NOL carryforward subtracted; not YTD-scaled)
  const grossIncome = w2 + k1Total + rentalNet + stGain + ltGain + intInc + divInc + f4797Inc + taxableSS + iraIncome - Math.max(0, nv(nolCarryforward))

  // SE tax computed BEFORE adjustments because halfSE is an above-the-line deduction (Schedule 1 Line 15)
  const SE_SUBJECT_TYPES = ['Sole Proprietor / Single-Member LLC', 'Partnership / Multi-Member LLC']
  const seNetIncome = entities.reduce((sum, e) => {
    if (!e || !SE_SUBJECT_TYPES.includes(e.type)) return sum
    return sum + Math.max(0, parseFloat(e.k1) || 0)
  }, 0)

  // SE tax: 12.4% SS (capped at wage base) + 2.9% Medicare (uncapped), on 92.35% of SE earnings
  // SS wage base parameterized via TAX_TABLES per year (2024: $168,600, 2025: $176,100, 2026: $184,500 per SSA)
  const ssWageBase = TAX_TABLES[taxYear]?.ssWageBase || 176100
  const seEarningsSubject = seNetIncome * 0.9235
  const ssPortion = Math.min(seEarningsSubject, ssWageBase) * 0.124
  const medicarePortion = seEarningsSubject * 0.029
  const seTax = Math.round(ssPortion + medicarePortion)
  const halfSE = Math.round(seTax / 2) // deductible half of SE tax (Schedule 1 Line 15, reduces AGI; also reduces QBI basis per Reg §1.199A-3(b)(1)(vi))

  // Above-the-line deductions (Schedule 1, Part II) — halfSE is included here so it reduces AGI
  const selfEmpHealthDed = ytdScale(selfEmpHealthIns)
  const hsaDed = ytdScale(hsaDeduction)
  const studentLoanDed = Math.min(ytdScale(studentLoanInt), 2500) // capped at $2,500
  const adjustments = halfSE + selfEmpHealthDed + hsaDed + studentLoanDed
  const agi = grossIncome - adjustments

  // Deductions
  const stdDed = getStdDed(taxYear, status)
  const itemized = nv(itemizedAmt)
  const deduction = useItemized ? Math.max(stdDed, itemized) : stdDed

  // Additional capital gain types
  const unrec1250 = Math.max(0, nv(unrecap1250))      // Unrecaptured Sec 1250 gain — max 25%
  const collectibles = Math.max(0, nv(collectiblesGain)) // Collectibles — max 28%

  // QBI basis per Treas. Reg. §1.199A-3(b)(1)(vi): reduce SE-subject income by halfSE AND SE health insurance
  // S-Corp K-1 is NOT SE-subject, so its portion passes through unchanged
  const nonSEk1 = Math.max(0, k1Total - seNetIncome)
  const seK1AfterAdjustments = Math.max(0, seNetIncome - halfSE - selfEmpHealthDed)
  const qbiBasis = nonSEk1 + seK1AfterAdjustments + Math.max(0, rentalNet) - priorQBILossCO
  const taxableBeforeQBI = Math.max(0, agi - deduction)
  // LTCG + qualified dividends excluded from QBI income limitation base per IRC §199A(e)(1)
  const prefIncome = ltGain + qualDiv
  const qbi = calcQBI(qbiBasis, taxableBeforeQBI, prefIncome, { status, taxYear, entityQbiData: entities })

  // ── Split income into ordinary vs preferential for accurate tax calculation ──
  // Ordinary taxable income = everything EXCEPT LTCG, qualified dividends, 1250, collectibles
  // These are already included in grossIncome → taxableBeforeQBI, so we subtract them out
  const totalPrefIncome = Math.max(0, ltGain) + Math.max(0, qualDiv) + unrec1250 + collectibles
  const taxableAfterQBI = Math.max(0, taxableBeforeQBI - qbi)
  // Ordinary income is whatever remains after removing preferential income (floor at 0)
  const ordinaryTaxableIncome = Math.max(0, taxableAfterQBI - totalPrefIncome)
  // Total taxable income (for display)
  const taxableIncome = taxableAfterQBI

  // ── Federal income tax on ORDINARY income only (brackets) ──
  const ordFedTax = calcFederalTax(ordinaryTaxableIncome, taxYear, status)

  // ── Preferential tax via QDCGTW (IRC §1(h)) ──
  // LTCG + qualified dividends at 0/15/20%; Sec 1250 at max 25%; Collectibles at max 28%
  const prefTax = calcPreferentialTax(ordinaryTaxableIncome, {
    ltcg: Math.min(Math.max(0, ltGain), taxableAfterQBI),
    qualDiv: Math.min(Math.max(0, qualDiv), taxableAfterQBI),
    unrecap1250: Math.min(unrec1250, taxableAfterQBI),
    collectibles: Math.min(collectibles, taxableAfterQBI),
  }, taxYear, status)

  const fedTax = ordFedTax + prefTax

  // ── Marginal rate on ordinary income ──
  const brackets = getBrackets(taxYear, status)
  let marginalRate = 0
  if (ordinaryTaxableIncome > 0) {
    let prev = 0
    for (const [cap, rate] of brackets) {
      if (ordinaryTaxableIncome > prev) { marginalRate = rate }
      prev = cap
    }
  } else if (totalPrefIncome > 0) {
    // Show LTCG rate when only preferential income exists
    const [t0, t15] = getLTCGThresholds(taxYear, status)
    marginalRate = totalPrefIncome > t15 ? 0.20 : totalPrefIncome > t0 ? 0.15 : 0
  }

  // ── Additional Medicare Tax (0.9%) — IRC §3101(b)(2) ──
  const addlMedThreshold = getAddlMedicareThreshold(taxYear, status)
  const additionalMedicare = Math.round(Math.max(0, w2 + seEarningsSubject - addlMedThreshold) * 0.009) // Form 8959 unified threshold on combined W-2 + SE

  // ── Net Investment Income Tax (3.8%) — IRC §1411 ──
  // NII = net investment income: dividends, interest, rental income (if passive), LTCG
  // For REP: rental income is NOT passive → excluded from NII
  const rentalNII = isREP ? 0 : Math.max(0, rentalNet)
  const nii = Math.max(0, intInc + divInc + Math.max(0, ltGain) + Math.max(0, qualDiv) + rentalNII)
  const niit = calcNIIT(nii, agi, taxYear, status)

  // ── Child Tax Credit (IRC §24) ──
  const numDependents = parseInt(dependents) || 0
  const childCredit = Math.min(numDependents * 2000, fedTax + additionalMedicare + niit)

  // ── Total Tax ──
  const amt = calcAMT({ taxableIncome, qbi, saltAmount: nv(saltAmount), isoBargainElement: hasISO ? nv(isoBargainElement) : 0, ltGain, qualDiv, regularTax: fedTax, status, taxYear, useItemized, itemized, stdDed })
  const totalTax = Math.max(0, fedTax + seTax + additionalMedicare + niit + amt - childCredit)

  // Effective rate on earned income
  const effectiveRate = grossIncome > 0 ? (totalTax / Math.max(1, w2 + Math.max(0, k1Total))) : 0

  // Payments
  const withheld = nv(w2Withheld)
  const estimated = nv(estPaid)
  const totalPayments = withheld + estimated
  const balance = totalTax - totalPayments

  // Quarterly estimate recommendation (remaining quarters)
  const quarterlyRecommended = balance > 0 ? Math.round(balance / 4) : 0

  return {
    grossIncome, agi,
    seNetIncome, seEarningsSubject, seTax, halfSE,
    selfEmpHealthDed, hsaDed, studentLoanDed, adjustments,
    stdDed, itemized, deduction,
    unrec1250, collectibles,
    nonSEk1, seK1AfterAdjustments, qbiBasis, taxableBeforeQBI, prefIncome, qbi,
    totalPrefIncome, taxableAfterQBI, ordinaryTaxableIncome, taxableIncome,
    ordFedTax, prefTax, fedTax,
    marginalRate,
    addlMedThreshold, additionalMedicare, rentalNII, nii, niit,
    numDependents, childCredit,
    amt,
    totalTax, effectiveRate,
    withheld, estimated, totalPayments, balance, quarterlyRecommended,
    priorQBILossCO,
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
  getAddlMedicareThreshold,
  calcFederalTax,
  calcPreferentialTax,
  calcNIIT,
  calcAMT,
  calcQBI,
  nv,
  calcTaxReturn,
}
