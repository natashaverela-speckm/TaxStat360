// OCT-4 ONCE-OVER (4 Oct 2026 pre-launch full fresh calculation audit; fixes 18 Oct 2026).
// Engine SPECs for the items that reached the engine. Expected figures were hand-derived in
// the audit's independent reference calculator (2026 tables, Rev. Proc. 2025-32 / P.L. 119-21)
// and reproduced on the live site before the fix was written.
//
//   M-1  The Step-1 §199A W-2 field REPLACED the officer salary instead of being floored at it.
//        Live: S-Corp K-1 $300k / officer $100k + Sch C $200k → §199A $50,000 ($169,459);
//        typing $50,000 of staff payroll in the field → $25,000 ($178,209). Reg. §1.199A-2(b).
//   L-1  A §469-allowed loss from a rental NOT elected into §199A wiped out the QBI of a rental
//        that WAS. Live: Rental A −$40,000 (not elected, active participant) + Rental B +$5,000
//        (elected), W-2 $120k → §199A $0; $1,000 due (Reg. §1.199A-3(b)(1)(iv)).
//   L-2  MFJ: the spouse's wages had no field, so the §6413(c) excess-SS credit and the §3102(f)
//        per-employer Additional Medicare credit were assumed away / mis-pooled.
//   L-5  MFS §469(i) allowance was $0 unconditionally; §469(i)(5) gives $12,500 (phase-out from
//        $50,000) when the spouses lived apart all year.
//   N-12a OBBBA §70103 senior deduction (IRC §63(f)(5)): $6,000 per 65+ individual, 2025–2028,
//        6% phase-out above $75k / $150k MFJ, joint return required if married.
import { describe, it, expect } from 'vitest'
import { calcTaxReturn, calc469iAllowance, calcSeniorDeduction, getEntityQbiW2Wages } from './taxCalc.js'

// `k1Total` is the UI's sumK1FlowThrough figure — every Step-1 entity's net, rentals included
// (the engine pulls the rental slice back out for the §469 block).
const base = (o = {}) => ({ taxYear: 2026, status: 'single', dependents: 0, entities: [], k1Total: 0, w2: 0, assumeZeroBasisOnLoss: true, ...o })
// S-Corp: gross $407,650, officer $100,000, employer payroll tax $7,650 → K-1 $300,000.
const SCORP300 = (extra = {}) => ({
  id: 's1', name: 'S', type: 'S Corporation', own: '100',
  pnl: { grossRevenue: 407650, totalExpenses: 107650, officerSalary: 100000, employerPayrollTax: 7650, netProfit: 300000 },
  officerW2: 100000, netProfit: 300000, ...extra,
})
const SCHC200 = { id: 'c1', name: 'C', type: 'Sole Proprietor / SMLLC', own: '100', pnl: { grossRevenue: 200000, totalExpenses: 0, netProfit: 200000 }, netProfit: 200000 }
const rental = (net, extra = {}) => ({
  type: 'Real Estate (Schedule E)', own: '100',
  pnl: { netProfit: net, grossRevenue: Math.max(0, net), totalExpenses: Math.max(0, -net), officerSalary: 0 },
  priorPAL: '', ...extra,
})

describe('OCT-4 M-1 — §199A W-2 wage figure is floored at the officer salary', () => {
  it('SPEC: getEntityQbiW2Wages — blank field ⇒ officer salary; below-officer entry ⇒ officer salary; at/above ⇒ as entered', () => {
    expect(getEntityQbiW2Wages(SCORP300())).toBe(100000)
    expect(getEntityQbiW2Wages(SCORP300({ box17V_wages: '50,000' }))).toBe(100000)
    expect(getEntityQbiW2Wages(SCORP300({ box17V_wages: '150,000' }))).toBe(150000)
    expect(getEntityQbiW2Wages(SCORP300({ box17V_wages: '200000' }))).toBe(200000)
    expect(getEntityQbiW2Wages({ type: 'Sole Proprietor / SMLLC', box17V_wages: '60000' })).toBe(60000)
  })
  it('SPEC: live repro — K-1 $300k / officer $100k + Sch C $200k, single 2026: $50,000 limit, total $169,459', () => {
    const r = calcTaxReturn(base({ entities: [SCORP300(), SCHC200], k1Total: 500000, w2: 100000 }))
    expect(r.qbi).toBe(50000)
    expect(r.totalTax).toBe(169459)
  })
  it('SPEC: $50,000 typed in the field (staff payroll only) no longer drops the limit to $25,000', () => {
    const r = calcTaxReturn(base({ entities: [SCORP300({ box17V_wages: '50000' }), SCHC200], k1Total: 500000, w2: 100000 }))
    expect(r.qbi).toBe(50000)
    expect(r.totalTax).toBe(169459)
  })
  it('SPEC: $150,000 typed (officer + staff, the correct total) → 50% × $150k = $75,000 limit, deduction = 20% × $300k = $60,000; total $165,959', () => {
    const r = calcTaxReturn(base({ entities: [SCORP300({ box17V_wages: '150000' }), SCHC200], k1Total: 500000, w2: 100000 }))
    expect(r.qbi).toBe(60000)
    expect(r.totalTax).toBe(165959)
  })
})

describe('OCT-4 L-1 — rental QBI is computed per property from §199A-elected rentals only', () => {
  // W-2 $120,000; Rental A −$40,000 (active participant, NOT elected); Rental B +$5,000 (elected).
  // Form 8582: B's income absorbs $5,000 of A's loss, the rest is tested against the §469(i)
  // allowance (MAGI per calc469iMagi — W-2 here, so $15,000) → the household's allowed rental
  // figure is a loss. None of that changes B's QBI: the elected property's own allowed amount is
  // its full $5,000 of income (Reg. §1.199A-3(b)(1)(iv)); A's loss is not a QBI item.
  it('SPEC: the elected rental\'s $5,000 enters QBI in full (20% = $1,000) regardless of the non-elected rental\'s loss', () => {
    const r = calcTaxReturn(base({
      w2: 120000, k1Total: -35000,
      entities: [rental(-40000, { isActiveParticipant: true }), rental(5000, { qbiEligible: true })],
    }))
    expect(r.qbi).toBe(1000)
    // The §469 treatment of the household is untouched by the QBI change.
    expect(r.rentalAllowed).toBeLessThan(0)
  })
  it('SPEC: with the non-elected rental profitable (+$10,000) the result is per-property either way — $1,000', () => {
    const r = calcTaxReturn(base({ w2: 120000, k1Total: 15000, entities: [rental(10000), rental(5000, { qbiEligible: true })] }))
    expect(r.qbi).toBe(1000)
    expect(r.agi).toBe(135000)
  })
  it('SPEC: an elected rental that is itself the loss property carries its ALLOWED share as negative QBI', () => {
    // Elected A −$40,000 (active participant) alone, W-2 $120,000: allowed −$15,000 (MAGI $120k →
    // $15,000 allowance); the allowed loss is negative QBI, so no deduction and no phantom income.
    const r = calcTaxReturn(base({ w2: 120000, k1Total: -40000, entities: [rental(-40000, { isActiveParticipant: true, qbiEligible: true })] }))
    expect(r.rentalAllowed).toBe(-15000)
    expect(r.qbi).toBe(0)
  })
  it('CHAR: no elected rental ⇒ no rental QBI (unchanged opt-in default)', () => {
    const r = calcTaxReturn(base({ w2: 120000, k1Total: 15000, entities: [rental(10000), rental(5000)] }))
    expect(r.qbi).toBe(0)
  })
})

describe('OCT-4 L-2 — spouse W-2 on a joint return', () => {
  const SCORP192 = {
    id: 's1', name: 'S', type: 'S Corporation', own: '100',
    pnl: { grossRevenue: 400000, totalExpenses: 207650, officerSalary: 100000, employerPayrollTax: 7650, netProfit: 192350 },
    officerW2: 100000, netProfit: 192350,
  }
  it('SPEC: spouse wages join household income — MFJ officer $100k + own other W-2 $500k + spouse $0 reproduces the 4 Oct MFJ figure ($190,127 income tax)', () => {
    const r = calcTaxReturn(base({ status: 'mfj', entities: [SCORP192], k1Total: 192350, w2: 600000, w2Spouse: 0 }))
    expect(r.fedTax).toBe(190127)
    expect(r.additionalMedicare).toBe(3150)
  })
  it('SPEC: with the spouse field used, the owner\'s two employers earn the §6413(c) excess-SS credit ($6,200) and the spouse\'s single W-2 does not', () => {
    // Owner: officer $100k + other $500k (two employers → 6,200 excess); spouse $300k (one employer → none).
    const r = calcTaxReturn(base({ status: 'mfj', entities: [SCORP192], k1Total: 192350, w2: 600000, w2Spouse: 300000,
      w2OwnForSE: 600000 }))
    expect(r.totalW2ForFICA).toBe(900000)
    expect(r.excessSSWithheld).toBe(6200)
    // §3102(f): other-employer $500k → 2,700; spouse $300k → 900; officer $100k → 0.
    expect(r.addlMedicareWithheld).toBe(3600)
    // §3101(b)(2): 0.9% × (900,000 − 250,000) = 5,850.
    expect(r.additionalMedicare).toBe(5850)
  })
  it('SPEC: two $150k spouse salaries entered as $150k + $150k are credited no Box 6 withholding (neither employer crossed $200k)', () => {
    const r = calcTaxReturn(base({ status: 'mfj', w2: 150000, w2Spouse: 150000 }))
    expect(r.addlMedicareWithheld).toBe(0)
    expect(r.additionalMedicare).toBe(450)   // 0.9% × (300,000 − 250,000)
  })
  it('SPEC: w2Spouse is ignored on a non-joint return', () => {
    const r = calcTaxReturn(base({ status: 'single', w2: 100000, w2Spouse: 300000 }))
    expect(r.totalW2ForFICA).toBe(100000)
  })
  it('SPEC: the spouse\'s wages never consume the owner\'s Schedule SE wage base (§1402(b))', () => {
    const schc = { ...SCHC200 }
    const r = calcTaxReturn(base({ status: 'mfj', entities: [schc], k1Total: 200000, w2: 0, w2Spouse: 200000, w2OwnForSE: 0 }))
    expect(r.ssWageBaseRoom).toBe(184500)
  })
})

describe('OCT-4 L-5 — §469(i)(5) MFS lived-apart allowance', () => {
  it('SPEC: MFS lived together ⇒ $0; lived apart all year ⇒ $12,500 at MAGI ≤ $50,000, $0 at $75,000', () => {
    expect(calc469iAllowance(40000, 'mfs', true)).toBe(0)
    expect(calc469iAllowance(40000, 'mfs', true, true)).toBe(12500)
    expect(calc469iAllowance(60000, 'mfs', true, true)).toBe(7500)
    expect(calc469iAllowance(75000, 'mfs', true, true)).toBe(0)
    expect(calc469iAllowance(40000, 'single', true, true)).toBe(25000)   // flag is MFS-only
  })
  it('SPEC: engine — MFS, W-2 $60,000, rental −$40,000, active participant: $0 allowed unless lived apart ($7,500)', () => {
    const together = calcTaxReturn(base({ status: 'mfs', w2: 60000, k1Total: -40000, entities: [rental(-40000, { isActiveParticipant: true })] }))
    expect(together.rentalAllowed).toBe(0)
    const apart = calcTaxReturn(base({ status: 'mfs', w2: 60000, k1Total: -40000, entities: [rental(-40000, { isActiveParticipant: true })], mfsLivedApartAllYear: true }))
    expect(apart.rentalAllowed).toBe(-7500)
    expect(apart.agi).toBe(52500)
  })
})

describe('OCT-4 N-12a — OBBBA §70103 senior deduction (IRC §63(f)(5))', () => {
  it('SPEC: $6,000 per qualified individual, 2025–2028 only, 6% phase-out above $75k / $150k joint, MFS excluded', () => {
    expect(calcSeniorDeduction({ taxYear: 2026, status: 'single', magi: 50000, age65Self: true })).toEqual({ deduction: 6000, qualified: 1 })
    expect(calcSeniorDeduction({ taxYear: 2026, status: 'single', magi: 100000, age65Self: true })).toEqual({ deduction: 4500, qualified: 1 })   // 6,000 − 6% × 25,000
    expect(calcSeniorDeduction({ taxYear: 2026, status: 'single', magi: 175000, age65Self: true }).deduction).toBe(0)
    expect(calcSeniorDeduction({ taxYear: 2026, status: 'mfj', magi: 160000, age65Self: true, age65Spouse: true })).toEqual({ deduction: 11400, qualified: 2 })   // 12,000 − 6% × 10,000
    expect(calcSeniorDeduction({ taxYear: 2026, status: 'mfj', magi: 100000, age65Self: false, age65Spouse: true }).deduction).toBe(6000)
    expect(calcSeniorDeduction({ taxYear: 2026, status: 'mfs', magi: 20000, age65Self: true }).deduction).toBe(0)
    expect(calcSeniorDeduction({ taxYear: 2024, status: 'single', magi: 20000, age65Self: true }).deduction).toBe(0)
    expect(calcSeniorDeduction({ taxYear: 2026, status: 'single', magi: 20000 }).deduction).toBe(0)
    // QSS files an individual return → the $75,000 threshold (same reading as §170(p) here).
    expect(calcSeniorDeduction({ taxYear: 2026, status: 'qss', magi: 100000, age65Self: true }).deduction).toBe(4500)
  })
  it('SPEC: engine — single 2026, W-2 $60,000, age 65+: taxable income $60,000 − 16,100 − 6,000 = $37,900; tax $4,300', () => {
    const r = calcTaxReturn(base({ w2: 60000, age65Self: true }))
    expect(r.seniorDeduction).toBe(6000)
    expect(r.taxableIncome).toBe(37900)
    expect(r.fedTax).toBe(4300)   // 1,240 + 12% × (37,900 − 12,400)
  })
  it('SPEC: the senior deduction is allowed to itemizers too, and reduces the §199A 20%-of-taxable-income cap base', () => {
    const r = calcTaxReturn(base({ w2: 60000, age65Self: true, useItemized: true, itemizedAmt: 20000, saltAmount: 10000 }))
    expect(r.seniorDeduction).toBe(6000)
    expect(r.taxableIncome).toBe(34000)
  })
  it('CHAR: a 2025 return applies it; the box is inert for 2024', () => {
    expect(calcTaxReturn(base({ taxYear: 2025, w2: 60000, age65Self: true })).seniorDeduction).toBe(6000)
    expect(calcTaxReturn(base({ taxYear: 2024, w2: 60000, age65Self: true })).seniorDeduction).toBe(0)
  })
})
