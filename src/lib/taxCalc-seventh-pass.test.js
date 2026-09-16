// SEVENTH PASS (independent fresh-eyes audit, 16 Sep 2026) — engine SPEC tests.
//
// Every figure below was derived by hand from the statute / form instructions named in the
// test title, independently of the engine, before the fix was written. Labels per
// ARCHITECTURE §6: SPEC = verified against authority; CHAR = pins current behaviour.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn, calcAMT, calcSchDOrdinaryLine21 } from './taxCalc.js'

const single25 = { taxYear: 2025, status: 'single', dependents: 0, w2Withheld: 0, estPaid: 0 }

describe('F-1 — Form 6251 Part III: the 0%/15% bands are placed by REGULAR ordinary income (lines 19/27)', () => {
  it('SPEC: 2025 single, W-2 75,750 + LTCG 100,000 + ISO bargain element 50,000 → AMT 1,675', () => {
    // Regular: TI 160,000; ordinary 60,000 → 8,114; gain all at 15% (60,000 > 48,350) → 15,000; fedTax 23,114.
    // AMT: AMTI 225,750 − exemption 88,100 = 137,650 (line 12); line 17 = 37,650 × 26% = 9,789;
    // line 19 = 60,000 → 0% room 0; 100,000 × 15% = 15,000; TMT 24,789; AMT 1,675.
    // (Old engine placed the 0% band against line 17 and gave $10,700 of gain a 0% rate: AMT $70.)
    const r = calcTaxReturn({ ...single25, w2: 75750, ltGain: 100000, hasISO: true, isoBargainElement: 50000 })
    expect(r.fedTax).toBe(23114)
    expect(r.amt).toBe(1675)
    expect(r.totalTax).toBe(24789)
  })
  it('SPEC: calcSchDOrdinaryLine21 — QDCGTW line 5 when there is no 25%/28% gain; Sch D TW line 21 otherwise', () => {
    expect(calcSchDOrdinaryLine21(60000, { ltcg: 100000 }, 2025, 'single')).toBe(60000)
    // With §1250 gain the worksheet's line 21 is the LARGER of (TI − all LT gain) and (TI − 0/15/20 gain, capped at the top of the 24% bracket).
    // TI 343,900 (single 2026), LT 300,000 of which 200,000 §1250: L18 43,900; L14 243,900; L19 201,775 → L21 201,775.
    expect(calcSchDOrdinaryLine21(43900, { ltcg: 300000, unrecap1250: 200000 }, 2026, 'single')).toBe(201775)
  })
  it('SPEC: collectibles gain is not in line 13 — taxed inside line 17 at the AMT 26%/28% rates (no 28% line on Form 6251)', () => {
    const args = { taxableIncome: 300000, saltAmount: 0, isoBargainElement: 200000, ltGain: 250000, qualDiv: 0,
      regularTax: 0, status: 'single', taxYear: 2026, useItemized: false, itemized: 0, stdDed: 16100 }
    const noColl = calcAMT({ ...args, collectibles: 0 })
    const coll   = calcAMT({ ...args, collectibles: 200000 })
    // line 12 434,050; line 17 184,050 → 384,050: +60,450 at 26% (to the 244,500 breakpoint) +139,550 at 28%, less 200,000 at 15%.
    expect(coll - noColl).toBe(24791)
  })
  it('CHAR: a filer living on LTCG / qualified dividends still owes no AMT (exemption absorbs the addbacks)', () => {
    for (const lt of [120000, 250000]) expect(calcTaxReturn({ taxYear: 2026, status: 'single', ltGain: lt }).amt).toBe(0)
  })
})

describe('F-8 — §55(d)(3) married-filing-separately AMTI add-back', () => {
  it('SPEC: 2024 MFS, AMTI 1,000,000 all ordinary → add-back min(25% × (1,000,000 − 875,950), 66,650) = 31,012.5 → TMT 286,358', () => {
    // Exemption fully phased out at 609,350 + 66,650 ÷ 0.25 = 875,950. TMT = 116,300 × 26% + 914,712.5 × 28% = 286,357.5.
    const tmt = calcAMT({ taxableIncome: 985400, saltAmount: 0, isoBargainElement: 0, ltGain: 0, qualDiv: 0, regularTax: 0,
      status: 'mfs', taxYear: 2024, useItemized: false, itemized: 0, stdDed: 14600 })
    expect(tmt).toBe(286358)
  })
  it('SPEC: no add-back below the full-phase-out point, and never for other statuses', () => {
    const below = calcAMT({ taxableIncome: 700000, saltAmount: 0, isoBargainElement: 0, ltGain: 0, qualDiv: 0, regularTax: 0,
      status: 'mfs', taxYear: 2024, useItemized: false, itemized: 0, stdDed: 14600 })
    // AMTI 714,600; exemption 66,650 − 25% × 105,250 = 40,337.5; base 674,262.5 → 116,300 × 26% + 557,962.5 × 28% = 186,467.5
    expect(below).toBe(186468)
    const single = calcAMT({ taxableIncome: 985400, saltAmount: 0, isoBargainElement: 0, ltGain: 0, qualDiv: 0, regularTax: 0,
      status: 'single', taxYear: 2024, useItemized: false, itemized: 0, stdDed: 14600 })
    // AMTI 1,000,000; exemption 85,700 − 25% × 390,650 → 0; 232,600 × 26% + 767,400 × 28% = 275,348
    expect(single).toBe(275348)
  })
})

describe('F-2 — a passive K-1 LOSS is a passive activity loss (§469(a), (d)(1))', () => {
  const lp = (k1, extra = {}) => ({ type: 'Partnership / LLC', own: 100, k1, limitedPartner: true, stockBasis: 100000, ...extra })
  it('SPEC: 2025 single, W-2 200,000 + limited-partner K-1 −50,000 → the loss is suspended; AGI 200,000', () => {
    const r = calcTaxReturn({ ...single25, w2: 200000, k1Total: -50000, entities: [lp(-50000)] })
    const control = calcTaxReturn({ ...single25, w2: 200000 })
    expect(r.passiveK1LossSuspended).toBe(50000)
    expect(r.agi).toBe(200000)
    expect(r.totalTax).toBe(control.totalTax)
    expect(r.qbi).toBe(0)
  })
  it('SPEC: the loss offsets passive rental INCOME first (Form 8582 line 2b vs. 1a); only the remainder is suspended', () => {
    const rental = { type: 'Real Estate (Schedule E)', own: 100, k1: 30000 }
    const r = calcTaxReturn({ ...single25, w2: 200000, k1Total: -20000, entities: [lp(-50000), rental] })
    expect(r.passiveK1LossAbsorbedByRental).toBe(30000)
    expect(r.passiveK1LossSuspended).toBe(20000)
    expect(r.agi).toBe(200000)          // 200,000 + 30,000 − 50,000 + 20,000 suspended
    expect(r.rentalNII).toBe(0)         // the rental income absorbed by the loss is not NII (Reg. §1.1411-4(g)(8))
  })
  it('SPEC: a passive loss smaller than the passive rental income is allowed in full', () => {
    const rental = { type: 'Real Estate (Schedule E)', own: 100, k1: 60000 }
    const r = calcTaxReturn({ ...single25, w2: 200000, k1Total: 10000, entities: [lp(-50000), rental] })
    expect(r.passiveK1LossSuspended).toBe(0)
    expect(r.agi).toBe(210000)
    expect(r.rentalNII).toBe(10000)
  })
  it('SPEC: an ACTIVE (general) partner\'s loss is not passive — deducted as before', () => {
    const r = calcTaxReturn({ ...single25, w2: 200000, k1Total: -50000, entities: [{ type: 'Partnership / LLC', own: 100, k1: -50000, stockBasis: 100000 }] })
    expect(r.passiveK1LossSuspended).toBe(0)
    expect(r.agi).toBe(150000)
  })
  it('SPEC: the suspended loss does not count for the §469(i) MAGI or the §461(l) figure', () => {
    // MAGI is determined without regard to any passive activity loss (§469(i)(3)(F)(iv)); a
    // W-2 of 140,000 alone phases the allowance to 5,000; the LP loss must not restore it.
    const rental = { type: 'Real Estate (Schedule E)', own: 100, k1: -20000, isActiveParticipant: true }
    const r = calcTaxReturn({ ...single25, w2: 140000, k1Total: -70000, entities: [lp(-50000), rental] })
    expect(r.rentalAllowed).toBe(-5000)
    expect(r.passiveK1LossSuspended).toBe(50000)
    expect(r.ebl).toBe(0)
  })
})

describe('F-3 — Form 8582 line 1c: the prior-year unallowed loss joins line 1d BEFORE the §469(i) allowance', () => {
  const rental = (k1, extra = {}) => ({ type: 'Real Estate (Schedule E)', own: 100, k1, isActiveParticipant: true, ...extra })
  it('SPEC: 2025 MFJ, W-2 90,000, rental −10,000 + prior PAL 10,000 → 20,000 allowed (MAGI 90,000 < 100,000); AGI 70,000', () => {
    const r = calcTaxReturn({ ...single25, status: 'mfj', w2: 90000, k1Total: -10000, priorPassiveLossCarryforward: 10000, entities: [rental(-10000)] })
    expect(r.rentalAllowed).toBe(-20000)
    expect(r.agi).toBe(70000)
    expect(r.fedTax).toBe(4143)
    expect(r.palSuspendedRental).toBe(0)
    expect(r.palCarryforwardApplied).toBe(10000)
    expect(r.palCarryforwardRemaining).toBe(0)
  })
  it('SPEC: the pooled loss is measured against the allowance — MAGI 140,000 allows 5,000 of a 20,000 pool; 15,000 carries', () => {
    const r = calcTaxReturn({ ...single25, w2: 140000, k1Total: -10000, priorPassiveLossCarryforward: 10000, entities: [rental(-10000)] })
    expect(r.rentalAllowed).toBe(-5000)
    expect(r.palSuspendedRental).toBe(15000)
    // the current-year loss is deemed allowed first; the carryforward is what remains suspended
    expect(r.palCarryforwardRemaining).toBe(10000)
    expect(r.palCarryforwardApplied).toBe(0)
  })
  it('SPEC: a profitable rental still absorbs the carryforward (unchanged), and a carryforward larger than the profit runs through the allowance', () => {
    const a = calcTaxReturn({ ...single25, w2: 150000, k1Total: 15000, priorPassiveLossCarryforward: 10000, entities: [rental(15000)] })
    expect(a.agi).toBe(155000)
    const b = calcTaxReturn({ ...single25, w2: 90000, k1Total: 5000, priorPassiveLossCarryforward: 30000, entities: [rental(5000)] })
    expect(b.rentalAllowed).toBe(-25000)   // pool −25,000, fully within the allowance
    expect(b.agi).toBe(65000)
  })
  it('SPEC: per-property regime — the carryforward is consumed (it was silently ignored before)', () => {
    const r = calcTaxReturn({ ...single25, w2: 90000, k1Total: 20000, priorPassiveLossCarryforward: 12000,
      entities: [rental(20000, { materiallyParticipates: false })] })
    expect(r.agi).toBe(98000)
    expect(r.palCarryforwardApplied).toBe(12000)
  })
})

describe('F-4 — §199A SSTB phase-in haircut is measured on the SSTB\'s QBI, not its gross share', () => {
  it('SPEC: 2025 HOH, SSTB Schedule C 260,000 (phase-in): deduction 12,601, fedTax 42,324', () => {
    // QBI 245,600 (260,000 − ½ SE 14,400); applicable % 50.65%; adjusted QBI 124,396 → 24,879 × (1 − 49.35% wage-limit reduction) = 12,601.
    const r = calcTaxReturn({ ...single25, status: 'hoh', k1Total: 260000, entities: [{ type: 'Sole Proprietor / SMLLC', own: 100, k1: 260000, box17V_sstb: true }] })
    expect(r.seTax).toBe(28800)
    expect(r.taxableBeforeQBI).toBe(221975)
    expect(r.qbi).toBe(12601)
    expect(r.fedTax).toBe(42324)
  })
})

describe('F-5 — Schedule D line 11: net §1231 gain nets against capital losses before §1211(b)', () => {
  it('SPEC: 2026 single, W-2 100,000, LT carryforward 20,000, STCG 5,000, §1231 gain 8,000 → AGI 97,000; LT carryover 4,000', () => {
    // LT: 8,000 − 20,000 = −12,000; +5,000 ST = −7,000 net → −3,000 allowed; 4,000 carries (long-term).
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 100000, capLossCarryforwardLT: 20000, stGain: 5000, f4797Inc: 8000 })
    expect(r.capitalGainNetIncluded).toBe(-3000)
    expect(r.agi).toBe(97000)
    expect(r.capLossCarryoverLT).toBe(4000)
    expect(r.capLossCarryoverST).toBe(0)
    expect(r.prefIncome).toBe(0)
  })
  it('SPEC: with no capital losses the §1231 gain is still long-term capital gain at preferential rates (unchanged)', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 100000, f4797Inc: 40000, nonrecapturedNet1231Loss: 15000 })
    expect(r.agi).toBe(140000)
    expect(r.ordinary1231Recapture).toBe(15000)
    expect(r.prefTax).toBe(3750)   // 25,000 × 15%
  })
  it('SPEC: NII (Form 8960 line 5a) is the Schedule D result — the netted figure', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 250000, intInc: 20000, ltGain: -80000, f4797Inc: 50000 })
    expect(r.nii).toBe(17000)
    const mp = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 250000, intInc: 20000, ltGain: -80000, f4797Inc: 50000, f4797MateriallyParticipated: true })
    expect(mp.nii).toBe(17000)
  })
})

describe('F-6 — §1402(b)(2): no SE tax when net earnings from self-employment are under $400', () => {
  it('SPEC: Schedule C 430 → 92.35% = 397 < 400 → SE tax 0', () => {
    const r = calcTaxReturn({ ...single25, w2: 50000, k1Total: 430, entities: [{ type: 'Sole Proprietor / SMLLC', own: 100, k1: 430 }] })
    expect(r.seTax).toBe(0)
    expect(r.halfSE).toBe(0)
  })
  it('SPEC: Schedule C 434 → 400.80 ≥ 400 → SE tax 61 (all-or-nothing, not a floor)', () => {
    const r = calcTaxReturn({ ...single25, w2: 50000, k1Total: 434, entities: [{ type: 'Sole Proprietor / SMLLC', own: 100, k1: 434 }] })
    expect(r.seTax).toBe(61)
  })
})

describe('F-7 — Capital Loss Carryover Worksheet: the §1211(b) loss is "used" only against positive taxable income', () => {
  it('SPEC: 2025 single, W-2 10,000, STCL −10,000 → taxable income already 0; carryover 10,000 (not 7,000)', () => {
    const r = calcTaxReturn({ ...single25, w2: 10000, stGain: -10000 })
    expect(r.agi).toBe(7000)
    expect(r.taxableIncome).toBe(0)
    expect(r.capLossCarryoverST).toBe(10000)
    expect(r.capLossCarryoverTotal).toBe(10000)
  })
  it('SPEC: partially absorbed — W-2 17,000, STCL −10,000: TI before the loss 1,250 → 1,250 used; 8,750 carries', () => {
    const r = calcTaxReturn({ ...single25, w2: 17000, stGain: -10000 })
    expect(r.capLossCarryoverST).toBe(8750)
  })
  it('SPEC: fully absorbed when taxable income is ample (unchanged): W-2 100,000, LTCL −10,000 → 7,000 carries', () => {
    const r = calcTaxReturn({ ...single25, w2: 100000, ltGain: -10000 })
    expect(r.capLossCarryoverLT).toBe(7000)
  })
})

describe('F-9 — top-level income fields are coerced with nf() (comma strings, negatives)', () => {
  it('SPEC: "100,000" W-2 and "1,000" interest compute like their numbers', () => {
    const a = calcTaxReturn({ ...single25, w2: '100,000', intInc: '1,000', k1Total: '0' })
    const b = calcTaxReturn({ ...single25, w2: 100000, intInc: 1000 })
    expect(a.agi).toBe(101000)
    expect(a.totalTax).toBe(b.totalTax)
    expect(Number.isFinite(a.totalTax)).toBe(true)
  })
  it('SPEC: a negative W-2 is floored at 0 (Box 1 cannot be negative)', () => {
    const r = calcTaxReturn({ ...single25, w2: -50000 })
    expect(r.agi).toBe(0)
    expect(r.totalTax).toBe(0)
  })
})

describe('H-2 — per-installment boxes are CREDITED, not just scheduled', () => {
  it('SPEC: total blank, Q1–Q4 5,000 each → 20,000 of payments; balance reduced accordingly', () => {
    const noQ  = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 150000 })
    const withQ = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 150000, estQ1: 5000, estQ2: 5000, estQ3: 5000, estQ4: 5000 })
    expect(withQ.totalPayments).toBe(20000)
    expect(withQ.estimatedPaymentsCredited).toBe(20000)
    expect(withQ.balance).toBe(noQ.balance - 20000)
    expect(withQ.installmentSchedule[3].paidCumulative).toBe(20000)
  })
  it('SPEC: the larger of the lump and the box sum is credited — a partial set of boxes never reduces a typed total', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 150000, estPaid: 20000, estQ1: 5000 })
    expect(r.totalPayments).toBe(20000)
    const s = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 150000, estPaid: 12000, estQ1: 5000, estQ2: 5000, estQ3: 5000 })
    expect(s.totalPayments).toBe(15000)
  })
})

describe('M-2 — §162(l)(5)(A): the SEHI cap is the shareholder\'s OWN wages, not the entity\'s §199A W-2 total', () => {
  it('SPEC: $60k own salary, $300k entity W-2 wages, $70k premium → deduction capped at 60,000', () => {
    const sc = (extra) => ({ type: 'S Corporation', own: '100', officerW2: 60000,
      pnl: { grossRevenue: 500000, totalExpenses: 300000, officerSalary: 60000, netProfit: 200000 }, ...extra })
    const a = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 60000, k1Total: 200000, entities: [sc({})], selfEmpHealthIns: 70000 })
    const b = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 60000, k1Total: 200000, entities: [sc({ box17V_wages: 300000 })], selfEmpHealthIns: 70000 })
    expect(a.selfEmpHealthDed).toBe(60000)
    expect(b.selfEmpHealthDed).toBe(60000)
    expect(b.totalTax).toBe(a.totalTax)
  })
})
