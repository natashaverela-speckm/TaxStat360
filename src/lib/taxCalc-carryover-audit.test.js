// src/lib/taxCalc-carryover-audit.test.js
//
// CARRYOVER AUDIT (11 Sep 2026). Fourth live-scenario pass: §1211(b)/§1212(b) capital-loss
// netting, the §469(i) rental allowance and its phase-out, and the §1231(c) five-year
// lookback. Every expected figure is a hand computation from the Code and the 2025 tables
// (Rev. Proc. 2024-40); all fourteen matched the engine to the dollar, so this file exists
// to keep them matching.
//
// Test labels (ARCHITECTURE §6): SPEC — verified against the cited authority.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

const base = { taxYear: 2025, status: 'single', entities: [] }

describe('§1211(b) / §1212(b) — capital losses: $3,000 against ordinary income, the rest carries with its character', () => {
  it('SPEC: ST loss 20,000 · LT gain 12,000 — net loss 8,000; 3,000 allowed; 5,000 carries as SHORT-term', () => {
    // Schedule D: ST −20,000 absorbs the LT +12,000 (line 16 = −8,000); §1211(b) allows 3,000; AGI 97,000 → 12,789.
    const r = calcTaxReturn({ ...base, w2: 100000, stGain: -20000, ltGain: 12000 })
    expect(r.capitalGainNetIncluded).toBe(-3000)
    expect(r.capLossCarryoverST).toBe(5000)
    expect(r.capLossCarryoverLT).toBe(0)
    expect(r.agi).toBe(97000)
    expect(r.totalTax).toBe(12789)
  })

  it('SPEC: LT carryforward 30,000 joins its pool (line 14) and cross-absorbs the ST gain — 12,000 carries as LONG-term', () => {
    const r = calcTaxReturn({ ...base, w2: 100000, stGain: 5000, ltGain: 10000, capLossCarryforwardLT: 30000 })
    expect(r.capitalGainNetIncluded).toBe(-3000)
    expect(r.capLossCarryoverST).toBe(0)
    expect(r.capLossCarryoverLT).toBe(12000)
    expect(r.totalTax).toBe(12789)
  })

  it('SPEC: an ST loss erodes the LT gain before the preferential rate applies — 40,000 at 15%', () => {
    // AGI 140,000; ordinary 84,250 → 13,449; surviving LT 40,000 × 15% = 6,000.
    const r = calcTaxReturn({ ...base, w2: 100000, stGain: -10000, ltGain: 50000 })
    expect(r.capitalGainNetIncluded).toBe(40000)
    expect(r.prefTax).toBe(6000)
    expect(r.totalTax).toBe(19449)
  })

  it('SPEC: married filing separately — the §1211(b)(1) limit is 1,500', () => {
    const r = calcTaxReturn({ ...base, status: 'mfs', w2: 100000, stGain: -9000 })
    expect(r.capitalGainNetIncluded).toBe(-1500)
    expect(r.capLossCarryoverST).toBe(7500)
    expect(r.agi).toBe(98500)
  })
})

describe('§469(i) — the $25,000 active-participation rental allowance and its 50% phase-out', () => {
  const rental = (net, extra = {}) => ({
    type: 'Real Estate (Schedule E)', own: 100,
    pnl: { netProfit: net, grossRevenue: 40000, totalExpenses: 40000 - net },
    isActiveParticipant: true, ...extra,
  })
  // Step 1 folds every entity into k1Total; the engine pulls the rental back out for §469.
  const run = (w2, net, extra = {}, personal = {}) =>
    calcTaxReturn({ ...base, w2, k1Total: net, entities: [rental(net, extra)], isActiveParticipant: true, ...personal })

  it('SPEC: AGI 120,000 · rental loss 30,000 — allowance 25,000 − 50% × 20,000 = 15,000; AGI 105,000 → 14,549', () => {
    const r = run(120000, -30000)
    expect(r.agi).toBe(105000)
    expect(r.totalTax).toBe(14549)
  })

  it('SPEC: AGI 80,000 — the full 25,000 is allowed; AGI 55,000 → 4,472', () => {
    const r = run(80000, -30000)
    expect(r.agi).toBe(55000)
    expect(r.totalTax).toBe(4472)
  })

  it('SPEC: AGI 160,000 — the allowance is fully phased out (§469(i)(3)(A)); nothing deducted', () => {
    const r = run(160000, -30000)
    expect(r.agi).toBe(160000)
  })

  it('SPEC: no active participation — no allowance at all', () => {
    const r = run(80000, -30000, { isActiveParticipant: false }, { isActiveParticipant: false })
    expect(r.agi).toBe(80000)
  })

  it('SPEC: married filing separately — treated as living together, allowance is zero (§469(i)(5)(B))', () => {
    const r = run(60000, -30000, {}, { status: 'mfs' })
    expect(r.agi).toBe(60000)
  })

  it('SPEC: a prior-year passive loss carryforward offsets current passive income (§469(b))', () => {
    // Rental +15,000 less 10,000 carried = 5,000 passive income; AGI 155,000.
    const r = calcTaxReturn({ ...base, w2: 150000, k1Total: 15000, entities: [rental(15000)], priorPassiveLossCarryforward: 10000 })
    expect(r.agi).toBe(155000)
  })

  it('SPEC: a real estate professional who meets the hours test deducts the loss in full (§469(c)(7))', () => {
    const r = run(200000, -30000, { isREP: true }, { isREP: true, rentalAggregationElection: true, repHoursRE: 800, repHoursTotal: 1200 })
    expect(r.agi).toBe(170000)
    expect(r.totalTax).toBe(29867)
  })
})

describe('§1231(c) — nonrecaptured net §1231 losses recharacterise this year\'s gain as ordinary', () => {
  it('SPEC: §1231 gain 40,000 with 15,000 of lookback losses — 15,000 ordinary, 25,000 long-term', () => {
    // AGI 140,000; ordinary 99,250 → 16,749; 25,000 × 15% = 3,750; total 20,499.
    const r = calcTaxReturn({ ...base, w2: 100000, f4797Inc: 40000, nonrecapturedNet1231Loss: 15000 })
    expect(r.agi).toBe(140000)
    expect(r.prefTax).toBe(3750)
    expect(r.totalTax).toBe(20499)
  })

  it('SPEC: the same gain with no lookback is entirely long-term — 19,449', () => {
    const r = calcTaxReturn({ ...base, w2: 100000, f4797Inc: 40000 })
    expect(r.prefTax).toBe(6000)
    expect(r.totalTax).toBe(19449)
  })
})
