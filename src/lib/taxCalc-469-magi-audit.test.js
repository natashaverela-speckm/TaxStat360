// src/lib/taxCalc-469-magi-audit.test.js
//
// FOURTH READ R-1 (14 Sep 2026) — §469(i)(3)(F) modified AGI.
//
// Test labels (ARCHITECTURE §6):
//   SPEC: <citation>  — expected value computed by hand from the statute BEFORE the
//                       engine was run; the engine is compared to it, never the reverse.
//   CHAR              — freezes current engine behavior.
//
// What was wrong. Both §469 branches measured the $25,000 active-participation
// allowance phase-out on W-2 + K-1 Box 1 (+ investment income − HSA/SEP/SEHI). Two items
// that reach AGI were missing:
//   • §707(c) guaranteed payments — ordinary gross income to the partner (Reg.
//     §1.707-1(c)); §469(i)(3)(F) excludes taxable Social Security, the §219 IRA
//     deduction, the §221 deduction, §135/§137/§911 items and passive losses — nothing
//     else. Leaving GP out UNDERstated MAGI and therefore UNDERstated tax.
//   • the §164(f) half-of-SE-tax deduction — an above-the-line deduction the Form 8582
//     line 7 instructions take into account. Leaving it out OVERstated MAGI.
// Verified on the production site 14 Sep 2026: a general partner with Box 1 $50,000 +
// GP $30,000 + W-2 $50,000 and a −$30,000 active rental was allowed the full $25,000
// (MAGI measured at $100,000 = W-2 + Box 1) where $12,826 was available.
//
// Arithmetic used throughout (2025 tables, Rev. Proc. 2024-40 as modified by OBBBA):
//   SE earnings subject   = $80,000 × 0.9235                = $73,880
//   SE tax                = $73,880 × 15.3%                 = $11,303.64 → $11,304
//   ½ SE (§164(f))        = $11,304 × ½                     = $5,652
//   §469(i) MAGI          = 50,000 + 50,000 + 30,000 − 5,652 = $124,348
//   allowance             = 25,000 − 50% × (124,348 − 100,000) = 25,000 − 12,174 = $12,826
//   suspended             = 30,000 − 12,826                 = $17,174
//   AGI                   = 50,000 + 80,000 − 12,826 − 5,652 = $111,522

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

const base = { taxYear: 2025, status: 'single', dependents: 0, isActiveParticipant: true }

const partner = (k1, extra = {}) => ({ type: 'Partnership / LLC', own: 100, k1, ...extra })
const soleProp = (k1) => ({ type: 'Sole Proprietor / SMLLC', own: 100, k1 })
const rental = (net, extra = {}) => ({
  type: 'Real Estate (Schedule E)', own: 100,
  pnl: { netProfit: net, grossRevenue: 20000, totalExpenses: 20000 - net },
  isActiveParticipant: true, ...extra,
})

describe('R-1 — §469(i)(3)(F) MAGI includes guaranteed payments and nets the ½-SE deduction', () => {

  it('SPEC: §707(c) guaranteed payments are in MAGI — Box 1 50,000 + GP 30,000 + W-2 50,000, rental −30,000 → allowance 12,826, suspended 17,174, AGI 111,522', () => {
    const r = calcTaxReturn({
      ...base, w2: 50000,
      k1Total: 50000 - 30000,
      entities: [partner(50000, { guaranteedPayments: 30000 }), rental(-30000)],
    })
    expect(r.seTax).toBe(11304)
    expect(r.halfSE).toBe(5652)
    expect(r.palSuspendedRental).toBe(17174)
    expect(r.agi).toBe(111522)
    // Income tax: TI before §199A 95,772; QBI 20% × (50,000 − 5,652) = 8,870 (GP excluded);
    // TI 86,902 → 1,192.50 + 4,386 + 22% × 38,427 = 14,032; + SE 11,304 = 25,336.
    expect(Math.abs(r.totalTax - 25336)).toBeLessThanOrEqual(1)
  })

  it('SPEC: the §164(f) ½-SE deduction reduces MAGI — Box 1 80,000 (no GP) + W-2 50,000, rental −30,000 → MAGI 124,348, not 130,000; allowance 12,826', () => {
    const r = calcTaxReturn({
      ...base, w2: 50000,
      k1Total: 80000 - 30000,
      entities: [partner(80000), rental(-30000)],
    })
    expect(r.halfSE).toBe(5652)
    expect(r.palSuspendedRental).toBe(17174)   // was 20,000 when MAGI ignored the ½-SE deduction
    expect(r.agi).toBe(111522)
  })

  it('SPEC: Schedule C earnings get the same ½-SE treatment — Sole Proprietor 80,000 + W-2 50,000, rental −30,000 → suspended 17,174', () => {
    const r = calcTaxReturn({
      ...base, w2: 50000,
      k1Total: 80000 - 30000,
      entities: [soleProp(80000), rental(-30000)],
    })
    expect(r.palSuspendedRental).toBe(17174)
    expect(r.agi).toBe(111522)
  })

  it('SPEC: GP alone drives the phase-out — W-2 0, Box 1 0, GP 130,000, rental −30,000 → MAGI 130,000 − 9,184 = 120,816; allowance 14,592 (SPEC: §469(i)(3)(A))', () => {
    // SE: 130,000 × 0.9235 = 120,055 → × 15.3% = 18,368.42 → 18,368; ½ = 9,184
    // MAGI = 130,000 − 9,184 = 120,816 → allowance 25,000 − 0.5 × 20,816 = 14,592
    const r = calcTaxReturn({
      ...base, w2: 0,
      k1Total: -30000,
      entities: [partner(0, { guaranteedPayments: 130000 }), rental(-30000)],
    })
    expect(r.seTax).toBe(18368)
    expect(r.halfSE).toBe(9184)
    expect(r.palSuspendedRental).toBe(30000 - 14592)
  })

  it('SPEC: per-property §469 branch uses the same MAGI — GP scenario with the aggregation flag present (non-REP → still passive) → suspended 17,174', () => {
    const r = calcTaxReturn({
      ...base, w2: 50000,
      k1Total: 50000 - 30000,
      entities: [partner(50000, { guaranteedPayments: 30000 }), rental(-30000, { materiallyParticipates: false })],
    })
    expect(r.palSuspendedRental).toBe(17174)
    expect(r.agi).toBe(111522)
  })

  it('CHAR: W-2-only returns are unchanged — W-2 120,000, rental −30,000 → allowance 15,000, suspended 15,000, AGI 105,000 (pins the pre-R-1 figure from taxCalc-carryover-audit)', () => {
    const r = calcTaxReturn({ ...base, w2: 120000, k1Total: -30000, entities: [rental(-30000)] })
    expect(r.halfSE).toBe(0)
    expect(r.palSuspendedRental).toBe(15000)
    expect(r.agi).toBe(105000)
  })

  it('SPEC: §221 stays OUT of the MAGI (§469(i)(3)(F)(iii)) while ½-SE stays IN — student-loan interest does not move the allowance', () => {
    const a = calcTaxReturn({ ...base, w2: 50000, k1Total: 50000, entities: [partner(80000), rental(-30000)] })
    const b = calcTaxReturn({ ...base, w2: 50000, k1Total: 50000, entities: [partner(80000), rental(-30000)], studentLoanInt: 2500 })
    expect(b.palSuspendedRental).toBe(a.palSuspendedRental)
  })

  it('CHAR: YTD annualization — half-year figures at ytdFactor 2 reproduce the full-year allowance', () => {
    const full = calcTaxReturn({
      ...base, w2: 50000, k1Total: 20000,
      entities: [partner(50000, { guaranteedPayments: 30000 }), rental(-30000)],
    })
    const ytd = calcTaxReturn({
      ...base, w2: 25000, k1Total: 10000, ytdFactor: 2,
      entities: [partner(25000, { guaranteedPayments: 15000 }), rental(-15000)],
    })
    // Second pass (review finding 5): guaranteedPayments is now in YTD_SCALE_ENTITY_FIELDS,
    // so a half-year GP entry annualizes like every other flow.
    expect(ytd.guaranteedPaymentsTotal).toBe(30000)
    expect(ytd.palSuspendedRental).toBe(full.palSuspendedRental)
    expect(ytd.agi).toBe(full.agi)
  })
})

// ─── Second pass (14 Sep 2026, fresh-eyes review findings 3 & 4): SEHI and the §1372 gross-up ──

describe('R-1 second pass — the §469(i) MAGI uses the engine\'s final SEHI deduction and the wage gross-up', () => {
  it('SPEC: the split SEHI fields and the single field give the same allowance (both are §162(l) deductions in AGI)', () => {
    const a = calcTaxReturn({ ...base, w2: 50000, k1Total: 50000, entities: [partner(80000), rental(-30000)], selfEmpHealthIns: 20000 })
    const b = calcTaxReturn({ ...base, w2: 50000, k1Total: 50000, entities: [partner(80000), rental(-30000)], selfEmpHealthInsOther: 20000 })
    expect(a.selfEmpHealthDed).toBe(20000)
    expect(b.selfEmpHealthDed).toBe(20000)
    expect(a.palSuspendedRental).toBe(b.palSuspendedRental)
    expect(a.totalTax).toBe(b.totalTax)
    // MAGI = 50,000 + 80,000 − 5,652 − 20,000 = 104,348 → allowance 22,826 → suspended 7,174
    expect(a.palSuspendedRental).toBe(7174)
  })

  it('SPEC: only the DEDUCTIBLE SEHI reduces MAGI — a premium above the §162(l) earned-income cap does not', () => {
    // Sch C 30,000: SE earnings 27,705 → SE tax 4,239 → ½ 2,120; SEHI cap = 30,000 − 2,120 = 27,880
    const r = calcTaxReturn({ ...base, w2: 120000, k1Total: 30000 - 30000, entities: [soleProp(30000), rental(-30000)], selfEmpHealthIns: 60000 })
    expect(r.selfEmpHealthDed).toBe(27880)
    // MAGI = 120,000 + 30,000 − 2,120 − 27,880 = 120,000 → allowance 15,000 → suspended 15,000
    expect(r.palSuspendedRental).toBe(15000)
  })

  it('SPEC: an S-Corp-paid premium is grossed into wages (§1372 / Notice 2008-1) and that gross-up is in the §469(i) MAGI', () => {
    // Officer W-2 100,000 (entered net of premium), K-1 30,000, SEHI 25,000 paid by the S-Corp.
    // AGI = 100,000 + 25,000 gross-up + 30,000 − 25,000 SEHI = 130,000 before the rental → allowance 10,000.
    const r = calcTaxReturn({
      ...base, w2: 100000, k1Total: 30000 - 30000,
      entities: [{ type: 'S Corporation', own: 100, k1: 30000, officerW2: 100000 }, rental(-30000)],
      selfEmpHealthIns: 25000,
    })
    expect(r.sehiScorpWageGrossUp).toBe(25000)
    expect(r.selfEmpHealthDed).toBe(25000)
    expect(r.palSuspendedRental).toBe(20000)
    expect(r.agi).toBe(120000)
  })
})
