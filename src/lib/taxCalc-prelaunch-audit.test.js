// src/lib/taxCalc-prelaunch-audit.test.js
//
// PRE-LAUNCH ACCURACY REVIEW (11 Sep 2026). Fifth pass, covering the areas the earlier
// passes had not touched: partnership self-employment tax and guaranteed payments, the
// limited-partner exclusion, the §162(l) health-insurance limit, §172 NOL, §461(l) excess
// business loss, the Schedule A stack, the refundable child credit, Additional Medicare
// with wages and SE income together, §1250/collectibles rates, the SSTB phase-out, the
// head-of-household and surviving-spouse tables, 2024 tables, the §6654 safe harbor, and
// the §221 education-loan phase-out. Twenty-five hand computations; twenty-four matched.
// The one that did not — §221 allowed in full at any income — is fixed and pinned below.
//
// Test labels (ARCHITECTURE §6): SPEC — verified against the cited authority.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn, calcStudentLoanDeduction } from './taxCalc.js'

const b  = { taxYear: 2025, status: 'single', entities: [] }
const sp = (net) => ({ type: 'Sole Proprietor / SMLLC', own: 100, pnl: { netProfit: net, grossRevenue: Math.max(net, 0) + 50000, totalExpenses: 50000 } })

describe('Self-employment and above-the-line adjustments', () => {
  it('SPEC: active partner, K-1 100,000 + guaranteed payments 40,000 — SE on both (§1402(a)), GP excluded from QBI (§199A(c)(4)(B))', () => {
    // SE 140,000 × 92.35% × 15.3% = 19,781; ½ = 9,891; AGI 130,109; QBI (100,000 − 9,891) × 20% = 18,022; taxable 96,337 → 16,108.
    const r = calcTaxReturn({ ...b, k1Total: 100000, entities: [{ type: 'Partnership / LLC', own: 100, k1: 100000, guaranteedPayments: 40000 }] })
    expect(r.seTax).toBe(19781)
    expect(r.agi).toBe(130109)
    expect(r.qbi).toBe(18022)
    expect(r.totalTax).toBe(35889)
  })

  it('SPEC: limited partner — no SE tax (§1402(a)(13)); QBI held to the taxable-income limit', () => {
    const r = calcTaxReturn({ ...b, k1Total: 100000, entities: [{ type: 'Partnership / LLC', own: 100, k1: 100000, limitedPartner: true }] })
    expect(r.seTax).toBe(0)
    expect(r.qbi).toBe(16850)      // 20% × 84,250
    expect(r.totalTax).toBe(9742)
  })

  it('SPEC: sole proprietor 100,000 with SEHI 15,000 and SEP 10,000 — all three reduce AGI and QBI (Reg. §1.199A-3(b)(1)(vi))', () => {
    // SE 14,130; ½ 7,065; AGI 67,935; QBI 67,935 × 20% capped at 20% × 52,185 = 10,437; taxable 41,748 → 4,771.
    const r = calcTaxReturn({ ...b, k1Total: 100000, entities: [sp(100000)], selfEmpHealthIns: 15000, selfEmpRetirement: 10000 })
    expect(r.agi).toBe(67935)
    expect(r.qbi).toBe(10437)
    expect(r.totalTax).toBe(18901)
  })

  it('SPEC: §162(l) — health-insurance deduction limited to net SE earnings after ½ SE tax', () => {
    // Net 20,000; SE 2,826; ½ 1,413; limit 18,587 of a 30,000 premium. AGI 0.
    const r = calcTaxReturn({ ...b, k1Total: 20000, entities: [sp(20000)], selfEmpHealthIns: 30000 })
    expect(r.selfEmpHealthDed).toBe(18587)
    expect(r.agi).toBe(0)
    expect(r.totalTax).toBe(2826)
  })

  it('SPEC: §172(a)(2) — NOL carryforward limited to 80% of taxable income', () => {
    // Taxable before NOL 84,250 → 67,400 allowed; AGI 32,600; taxable 16,850 → 1,784.
    const r = calcTaxReturn({ ...b, w2: 100000, nolCarryforward: 200000 })
    expect(r.nolAllowed).toBe(67400)
    expect(r.agi).toBe(32600)
    expect(r.totalTax).toBe(1784)
  })

  it('SPEC: §461(l) — excess business loss above 313,000 (single, 2025) is disallowed', () => {
    // 400,000 loss − 313,000 = 87,000 excess; AGI 187,000; tax 33,947 + Additional Medicare 0.9% × 300,000 = 2,700.
    const r = calcTaxReturn({ ...b, w2: 500000, k1Total: -400000, entities: [sp(-400000)] })
    expect(r.ebl).toBe(87000)
    expect(r.agi).toBe(187000)
    expect(r.additionalMedicare).toBe(2700)
    expect(r.totalTax).toBe(36647)
  })
})

describe('§221 education-loan interest — capped at 2,500 and phased out by MAGI', () => {
  it('SPEC: single 150,000 — fully phased out (Rev. Proc. 2024-40 §3.30: 85,000–100,000)', () => {
    const r = calcTaxReturn({ ...b, w2: 150000, studentLoanInt: 3000 })
    expect(r.studentLoanDed).toBe(0)          // was 2,500 before this review
    expect(r.agi).toBe(150000)
    expect(r.totalTax).toBe(25067)
  })
  it('SPEC: single 70,000 — full 2,500', () => {
    expect(calcTaxReturn({ ...b, w2: 70000, studentLoanInt: 3000 }).studentLoanDed).toBe(2500)
  })
  it('SPEC: single 92,500 — halfway through the band, 1,250', () => {
    expect(calcTaxReturn({ ...b, w2: 92500, studentLoanInt: 3000 }).studentLoanDed).toBe(1250)
  })
  it('SPEC: MAGI is measured before the deduction itself — 86,000 with 2,500 paid → 2,333', () => {
    expect(calcTaxReturn({ ...b, w2: 86000, studentLoanInt: 2500 }).studentLoanDed).toBe(2333)
  })
  it('SPEC: joint 185,000 — 1,250 (170,000–200,000); joint 2026 190,000 — 1,250 (175,000–205,000, Rev. Proc. 2025-32 §4.29)', () => {
    expect(calcTaxReturn({ ...b, status: 'mfj', w2: 185000, studentLoanInt: 3000 }).studentLoanDed).toBe(1250)
    expect(calcTaxReturn({ ...b, taxYear: 2026, status: 'mfj', w2: 190000, studentLoanInt: 3000 }).studentLoanDed).toBe(1250)
  })
  it('SPEC: 2024 single 87,500 — 1,250 (Rev. Proc. 2023-34 §3.30: 80,000–95,000)', () => {
    expect(calcTaxReturn({ ...b, taxYear: 2024, w2: 87500, studentLoanInt: 3000 }).studentLoanDed).toBe(1250)
  })
  it('SPEC: a surviving spouse uses the single band; married filing separately gets nothing (§221(e)(2))', () => {
    expect(calcTaxReturn({ ...b, status: 'qss', w2: 92500, studentLoanInt: 3000 }).studentLoanDed).toBe(1250)
    expect(calcTaxReturn({ ...b, status: 'mfs', w2: 50000, studentLoanInt: 3000 }).studentLoanDed).toBe(0)
  })
  it('SPEC: the helper itself', () => {
    expect(calcStudentLoanDeduction(1000, 92500, 2025, 'single')).toBe(500)
    expect(calcStudentLoanDeduction(4000, 50000, 2025, 'hoh')).toBe(2500)
  })
})

describe('Deductions, credits and the rate schedules', () => {
  it('SPEC: Schedule A — medical above 7.5% of AGI, SALT within the cap, mortgage and charitable', () => {
    // 42,000 non-medical + (30,000 − 15,000) medical = 57,000; taxable 143,000 → 27,167.
    const r = calcTaxReturn({ ...b, w2: 200000, useItemized: true, itemizedAmt: 42000, saltAmount: 12000, medicalExpenses: 30000, charitableContr: 10000 })
    expect(r.itemized).toBe(57000)
    expect(r.totalTax).toBe(27167)
  })

  it('SPEC: refundable child credit — 30,000 of wages, two children: 1,472 nonrefundable, 2,928 additional (§24(d))', () => {
    // Tax 1,472 absorbs 1,472 of the 4,400; ACTC = min(2,928, 15% × 27,500, 2 × 1,700) = 2,928.
    const r = calcTaxReturn({ ...b, w2: 30000, dependents: 2 })
    expect(r.fedTax).toBe(1472)
    expect(r.childCredit).toBe(1472)
    expect(r.actc).toBe(2928)
    expect(r.balance).toBe(-2928)
  })

  it('SPEC: Additional Medicare with wages 250,000 and SE 100,000 — 0.9% on 50,000 of wages and on all SE earnings (§3101(b)(2), §1401(b)(2))', () => {
    // SE: wages exceed the wage base, so only 2.9% Medicare on 92,350 = 2,678; Additional Medicare 450 + 831 = 1,281; QBI fully wage-limited to 0.
    const r = calcTaxReturn({ ...b, w2: 250000, k1Total: 100000, entities: [sp(100000)] })
    expect(r.seTax).toBe(2678)
    expect(r.additionalMedicare).toBe(1281)
    expect(r.qbi).toBe(0)
    expect(r.fedTax).toBe(86066)
    expect(r.totalTax).toBe(90025)
  })

  it('SPEC: unrecaptured §1250 at 25% and collectibles at 28% inside a 60,000 long-term gain — 25,749', () => {
    // 13,449 ordinary + 30,000 × 15% + 20,000 × 25% + 10,000 × 28% = 25,749; all-ordinary backstop 27,467 does not bind.
    const r = calcTaxReturn({ ...b, w2: 100000, ltGain: 60000, unrecap1250: 20000, collectiblesGain: 10000 })
    expect(r.prefTax).toBe(12300)
    expect(r.totalTax).toBe(25749)
  })

  it('SPEC: SSTB in the phase-in band — single, taxable 234,250: applicable percentage 26.1%, QBI 7,830', () => {
    const r = calcTaxReturn({ ...b, w2: 100000, k1Total: 150000, entities: [{ type: 'S Corporation', own: 100, k1: 150000, box17V_wages: 100000, officerW2: 100000, box17V_sstb: true }] })
    expect(r.taxableBeforeQBI).toBe(234250)
    expect(r.qbi).toBe(7830)
  })

  it('SPEC: head of household 2025 — standard deduction 23,625 and the HOH brackets; 90,000 with one child → 5,578', () => {
    const r = calcTaxReturn({ ...b, status: 'hoh', w2: 90000, dependents: 1 })
    expect(r.fedTax).toBe(7778)
    expect(r.childCredit).toBe(2200)
    expect(r.totalTax).toBe(5578)
  })

  it('SPEC: qualifying surviving spouse uses the joint table — 100,000 → 7,743', () => {
    expect(calcTaxReturn({ ...b, status: 'qss', w2: 100000 }).fedTax).toBe(7743)
  })

  it('SPEC: 2024 tables (Rev. Proc. 2023-34) — single 100,000 → 13,841', () => {
    expect(calcTaxReturn({ ...b, taxYear: 2024, w2: 100000 }).fedTax).toBe(13841)
  })

  it('SPEC: §6654 safe harbor — prior AGI above 150,000 uses 110% of prior tax; the 90%-of-current figure wins here', () => {
    const r = calcTaxReturn({ ...b, w2: 100000, priorYearTax: 20000, priorYearAGI: 160000 })
    expect(r.safeHarborPriorYear).toBe(22000)
    expect(r.safeHarborCurrentYear).toBe(12104)   // 90% × 13,449
    expect(r.safeHarborMinimum).toBe(12104)
    expect(r.safeHarborQuarterly).toBe(3026)
  })
})
