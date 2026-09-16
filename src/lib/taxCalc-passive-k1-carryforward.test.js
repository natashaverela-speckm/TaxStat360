// PAL-K1-CARRYFORWARD (16 Sep 2026) — prior-year unallowed passive loss from a limited-partner /
// passive-shareholder K-1 activity (Form 8582 Part I line 2c / Worksheet 5), entered on the
// entity card as `priorPAL`. SPEC figures derived by hand from Form 8582 before the code.
//
// Pool mechanics (Form 8582): line 2a/2b = this year's passive K-1 income/loss, line 2c = the
// carryforward, line 2d = net; line 1d = passive rentals (after their own line 1c); line 3 =
// 1d + 2d. A net loss on line 3 is allowed only through the §469(i) special allowance, and
// only for the rental-with-active-participation share. The carryforward is not in k1Total
// (it is not this year's share), so what the pool absorbs is DEDUCTED; the rest is suspended.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

const single = { taxYear: 2025, status: 'single', dependents: 0, w2Withheld: 0, estPaid: 0 }
const lp = (k1, extra = {}) => ({ type: 'Partnership / LLC', name: 'LP', own: 100, k1, limitedPartner: true, stockBasis: 500000, pnl: { netProfit: k1 }, ...extra })
const psh = (k1, extra = {}) => ({ type: 'S Corporation', name: 'PS', own: 100, k1, passiveShareholder: true, stockBasis: 500000, pnl: { netProfit: k1 }, ...extra })
const rental = (k1, extra = {}) => ({ type: 'Real Estate (Schedule E)', own: 100, k1, ...extra })

describe('carryforward absorbed by this year\'s passive K-1 income', () => {
  it('SPEC: W-2 150,000 + LP K-1 +40,000 with 15,000 carried → 15,000 deducted; AGI 175,000; NII on 25,000', () => {
    const r = calcTaxReturn({ ...single, w2: 150000, k1Total: 40000, entities: [lp(40000, { priorPAL: '15,000' })] })
    expect(r.priorK1PAL).toBe(15000)
    expect(r.priorK1PALApplied).toBe(15000)
    expect(r.priorK1PALRemaining).toBe(0)
    expect(r.passiveK1LossSuspended).toBe(0)
    expect(r.agi).toBe(175000)
    expect(r.passiveK1Income).toBe(25000)
    expect(r.passiveK1NII).toBe(25000)   // Reg. §1.1411-4(g)(8): allowed prior losses reduce NII
    expect(r.nii).toBe(25000)
  })
  it('SPEC: control — no carryforward → AGI 190,000; the difference is exactly the 15,000 allowed', () => {
    const r = calcTaxReturn({ ...single, w2: 150000, k1Total: 40000, entities: [lp(40000)] })
    expect(r.agi).toBe(190000)
    expect(r.priorK1PAL).toBe(0)
  })
  it('SPEC: carryforward larger than the income — the excess is suspended again, nothing else changes', () => {
    // +40,000 income, 60,000 carried: 40,000 allowed (AGI 150,000), 20,000 carries forward.
    const r = calcTaxReturn({ ...single, w2: 150000, k1Total: 40000, entities: [lp(40000, { priorPAL: 60000 })] })
    expect(r.agi).toBe(150000)
    expect(r.priorK1PALApplied).toBe(40000)
    expect(r.priorK1PALRemaining).toBe(20000)
    expect(r.passiveK1LossSuspended).toBe(20000)
    expect(r.passiveK1LossSuspendedCurrent).toBe(0)
    expect(r.passiveK1NII).toBe(0)
    expect(r.qbi).toBe(0)   // no net QBI once the allowed prior loss is netted (Reg. §1.199A-3(b)(1)(iv))
  })
})

describe('carryforward against OTHER passive income (Form 8582 lines 1a / 2a)', () => {
  it('SPEC: LP loss year (−10,000) + 20,000 carried, passive rental income +25,000 → 25,000 of the 30,000 pool loss allowed', () => {
    // line 2d = −30,000; line 1d = +25,000; line 3 = −5,000 → 5,000 unallowed (no rental loss → no §469(i)).
    // Current-year loss deemed allowed first: carryforward applied 15,000, remaining 5,000.
    // AGI = 200,000 − 10,000 (in k1Total) + 25,000 − 15,000 = 200,000.
    const r = calcTaxReturn({ ...single, w2: 200000, k1Total: 15000, entities: [lp(-10000, { priorPAL: 20000 }), rental(25000)] })
    expect(r.passiveK1LossAbsorbedByRental).toBe(25000)
    expect(r.passiveK1LossSuspended).toBe(5000)
    expect(r.priorK1PALApplied).toBe(15000)
    expect(r.priorK1PALRemaining).toBe(5000)
    expect(r.passiveK1LossSuspendedCurrent).toBe(0)
    expect(r.agi).toBe(200000)
    expect(r.rentalNII).toBe(0)   // the rental income was consumed by passive losses
  })
  it('SPEC: two passive activities — a passive S-Corp\'s income absorbs the LP carryforward', () => {
    const r = calcTaxReturn({ ...single, w2: 100000, k1Total: 30000, entities: [lp(0, { priorPAL: 12000 }), psh(30000)] })
    expect(r.priorK1PALApplied).toBe(12000)
    expect(r.agi).toBe(118000)
    expect(r.passiveK1NII).toBe(18000)
  })
})

describe('nothing to absorb it — the carryforward is suspended again and cannot touch other income', () => {
  it('SPEC: W-2 200,000, LP K-1 0, 30,000 carried → AGI 200,000; carryforward unchanged', () => {
    const r = calcTaxReturn({ ...single, w2: 200000, k1Total: 0, entities: [lp(0, { priorPAL: 30000 })] })
    expect(r.agi).toBe(200000)
    expect(r.priorK1PALApplied).toBe(0)
    expect(r.priorK1PALRemaining).toBe(30000)
    expect(r.passiveK1LossSuspended).toBe(30000)
    expect(r.passiveK1LossSuspendedCurrent).toBe(0)
    const control = calcTaxReturn({ ...single, w2: 200000 })
    expect(r.totalTax).toBe(control.totalTax)
  })
  it('SPEC: with a current-year loss too — both suspended; only the current-year loss is added back to AGI', () => {
    const r = calcTaxReturn({ ...single, w2: 200000, k1Total: -50000, entities: [lp(-50000, { priorPAL: 30000 })] })
    expect(r.passiveK1LossSuspended).toBe(80000)
    expect(r.passiveK1LossSuspendedCurrent).toBe(50000)
    expect(r.priorK1PALRemaining).toBe(30000)
    expect(r.passiveK1AgiAdjustment).toBe(50000)
    expect(r.agi).toBe(200000)
  })
  it('SPEC: the §469(i) MAGI is measured without the passive pool — the carryforward cannot restore a phased-out allowance', () => {
    // W-2 140,000 phases the allowance to 5,000 regardless of the passive K-1 items.
    const r = calcTaxReturn({ ...single, w2: 140000, k1Total: -20000, entities: [lp(0, { priorPAL: 30000 }), rental(-20000, { isActiveParticipant: true })] })
    expect(r.rentalAllowed).toBe(-5000)
    expect(r.priorK1PALApplied).toBe(0)
    expect(r.agi).toBe(135000)
  })
  it('SPEC: a non-passive (general partner) card ignores the field entirely', () => {
    const r = calcTaxReturn({ ...single, w2: 200000, k1Total: 40000, entities: [{ type: 'Partnership / LLC', own: 100, k1: 40000, priorPAL: 15000, pnl: { netProfit: 40000 } }] })
    expect(r.priorK1PAL).toBe(0)
    expect(r.agi).toBe(240000 - r.halfSE)
  })
})

describe('per-property regime (REP / election on the return) uses the same pool', () => {
  it('SPEC: passive rental income +25,000 (REP, not materially participating) absorbs a 10,000 LP carryforward', () => {
    const r = calcTaxReturn({ ...single, w2: 100000, k1Total: 25000, isREP: true,
      entities: [lp(0, { priorPAL: 10000 }), rental(25000, { materiallyParticipates: false })] })
    expect(r.priorK1PALApplied).toBe(10000)
    expect(r.agi).toBe(115000)
    expect(r.rentalNII).toBe(15000)
  })
})
