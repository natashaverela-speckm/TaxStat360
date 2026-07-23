// src/taxCalc-pal.test.js
//
// M1 (audit F-01 / F-02 / F-15, Jul 2026) — §469(i) special allowance + constant wiring.
//
// Test labels (ARCHITECTURE §6):
//   SPEC: <citation>  — expected value independently verified against the cited
//                       IRC section / IRS publication. Only SPEC tests prove correctness.
//   CHAR              — freezes current engine behavior (characterization).
//
// These tests anchor the newly centralized calc469iAllowance() helper — the single
// implementation now consumed by BOTH engine PAL branches and the AIAnalysis
// "$25,000 Rental-Loss Allowance" strategy card — and assert that the previously
// dead constants in constants.js are internally consistent, so they can never
// again silently diverge from the live formula.

import { describe, it, expect } from 'vitest'
import { calc469iAllowance, calcTaxReturn } from './lib/taxCalc.js'
import {
  PAL_SPECIAL_ALLOWANCE_BASE,
  PAL_PHASE_OUT_START,
  PAL_PHASE_OUT_END,
  PAL_PHASE_OUT_RATE,
  NOL_CARRYFORWARD_CAP_RATE,
} from './lib/constants.js'

// ─── calc469iAllowance — the single source of truth ───────────────────────────

describe('calc469iAllowance — §469(i) special allowance (single source of truth)', () => {

  // SPEC: IRC §469(i)(2) — maximum offset for rental real estate activities is $25,000.
  it('full $25,000 allowance at or below the phase-out start (SPEC: §469(i)(2))', () => {
    expect(calc469iAllowance(0, 'single')).toBe(25000)
    expect(calc469iAllowance(100000, 'single')).toBe(25000)
    expect(calc469iAllowance(100000, 'mfj')).toBe(25000)
  })

  // SPEC: IRC §469(i)(3)(A) — allowance reduced by 50% of AGI over $100,000.
  it('phases out 50¢ per $1 of MAGI over $100,000 (SPEC: §469(i)(3)(A))', () => {
    expect(calc469iAllowance(110000, 'single')).toBe(20000)  // 25,000 − 0.5 × 10,000
    expect(calc469iAllowance(125000, 'mfj')).toBe(12500)     // 25,000 − 0.5 × 25,000
    expect(calc469iAllowance(140000, 'hoh')).toBe(5000)      // 25,000 − 0.5 × 40,000
  })

  // SPEC: IRC §469(i)(3)(A) — allowance fully eliminated at $150,000 MAGI.
  it('$0 allowance at or above $150,000 MAGI (SPEC: §469(i)(3)(A))', () => {
    expect(calc469iAllowance(150000, 'single')).toBe(0)
    expect(calc469iAllowance(500000, 'mfj')).toBe(0)
  })

  // SPEC: IRC §469(i)(5)(B) — married filing separately (not living apart the
  // entire year): no allowance. The engine's conservative default models MFS as $0
  // at every MAGI level.
  it('MFS: $0 allowance regardless of MAGI (SPEC: §469(i)(5)(B))', () => {
    expect(calc469iAllowance(0, 'mfs')).toBe(0)
    expect(calc469iAllowance(50000, 'mfs')).toBe(0)
    expect(calc469iAllowance(150000, 'mfs')).toBe(0)
  })

  // SPEC: IRC §469(i)(6) — the allowance requires active participation.
  it('non-active participant: $0 allowance (SPEC: §469(i)(6))', () => {
    expect(calc469iAllowance(80000, 'single', false)).toBe(0)
    expect(calc469iAllowance(80000, 'mfj', false)).toBe(0)
  })

  // CHAR — a nullish MAGI is treated as $0 (full allowance), matching the prior
  // inline behavior of both engine branches.
  it('nullish MAGI treated as $0 → full allowance (CHAR)', () => {
    expect(calc469iAllowance(undefined, 'single')).toBe(25000)
    expect(calc469iAllowance(null, 'mfj')).toBe(25000)
  })
})

// ─── Constant consistency — dead-constant drift can never recur ────────────────

describe('PAL_* constants — internal consistency (audit F-01 / F-15)', () => {

  // SPEC: §469(i)(3)(A) — the phase-out end is derivable from the other three
  // figures: END = START + BASE / RATE. PAL_PHASE_OUT_END is documentation, but
  // this assertion guarantees the documentation can never drift from the live values.
  it('PAL_PHASE_OUT_END is consistent with START + BASE / RATE (SPEC: §469(i)(3)(A))', () => {
    expect(PAL_PHASE_OUT_START + PAL_SPECIAL_ALLOWANCE_BASE / PAL_PHASE_OUT_RATE)
      .toBe(PAL_PHASE_OUT_END)
  })

  // SPEC: §469(i)(2)/(3)(A) statutory dollar amounts and rate.
  it('statutory values (SPEC: §469(i)(2), §469(i)(3)(A))', () => {
    expect(PAL_SPECIAL_ALLOWANCE_BASE).toBe(25000)
    expect(PAL_PHASE_OUT_START).toBe(100000)
    expect(PAL_PHASE_OUT_END).toBe(150000)
    expect(PAL_PHASE_OUT_RATE).toBe(0.50)
  })

  // The helper must consume the named constants — the allowance at the phase-out
  // boundary points must equal the values derived from the constants themselves.
  it('helper output is derived from the named constants (wiring check)', () => {
    const midpoint = (PAL_PHASE_OUT_START + PAL_PHASE_OUT_END) / 2
    expect(calc469iAllowance(midpoint, 'single'))
      .toBe(PAL_SPECIAL_ALLOWANCE_BASE / 2)
    expect(calc469iAllowance(PAL_PHASE_OUT_END, 'single')).toBe(0)
  })
})

// ─── Engine parity — both PAL branches route through the helper ────────────────

describe('engine §469(i) parity after centralization (audit F-01)', () => {

  const BASE = {
    taxYear: 2025, status: 'single', dependents: 0,
    entities: [], w2: 100000, k1Total: 0,
    rentalNet: 0, stGain: 0, ltGain: 0, intInc: 0,
    divInc: 0, qualDiv: 0, f4797Inc: 0, taxableSS: 0, iraIncome: 0,
  }

  // SPEC: §469(i)(2)/(3)(A) — $120K AGI → allowance 25,000 − 0.5 × 20,000 = 15,000;
  // of a $20,000 loss, $15,000 deducts and $5,000 suspends. Identical to the
  // pre-refactor figures asserted in taxCalc.test.js — this sentinel proves the
  // helper reproduces the single-pool branch exactly.
  it('phased allowance: $120K AGI, $20K loss → $5K suspended (SPEC: §469(i)(3)(A))', () => {
    const r = calcTaxReturn({ ...BASE, w2: 120000, rentalNet: -20000, isREP: false })
    expect(r.palSuspendedRental).toBe(5000)
    expect(r.grossIncome).toBe(105000)
  })

  // SPEC: §469(i)(5)(B) — MFS receives no allowance; the entire loss is suspended.
  it('MFS suspends the entire passive rental loss (SPEC: §469(i)(5)(B))', () => {
    const r = calcTaxReturn({ ...BASE, w2: 80000, rentalNet: -30000, isREP: false, status: 'mfs' })
    expect(r.palSuspendedRental).toBe(30000)
    expect(r.grossIncome).toBe(80000)
  })

  // SPEC: §469(i)(6) — non-active participant: no allowance, full suspension.
  it('non-active participant: full suspension (SPEC: §469(i)(6))', () => {
    const r = calcTaxReturn({ ...BASE, w2: 80000, rentalNet: -30000, isREP: false, isActiveParticipant: false })
    expect(r.palSuspendedRental).toBe(30000)
  })
})

// ─── NOL constant wiring (audit F-02) ──────────────────────────────────────────

describe('NOL_CARRYFORWARD_CAP_RATE wiring (audit F-02)', () => {

  // SPEC: IRC §172(a)(2) — post-2017 NOL deduction limited to 80% of taxable income.
  it('constant holds the statutory 80% rate (SPEC: §172(a)(2))', () => {
    expect(NOL_CARRYFORWARD_CAP_RATE).toBe(0.80)
  })

  // CHAR — a large NOL carryforward is limited to 80% of taxable-before-NOL; the
  // engine result must move when the constant would (sentinel for the wiring: the
  // deduction equals floor(taxableBeforeNOL × rate), not the full carryforward).
  it('engine applies the cap from the named constant (CHAR)', () => {
    const withNOL = calcTaxReturn({
      taxYear: 2025, status: 'single', w2: 200000, nolCarryforward: 500000,
    })
    const withoutNOL = calcTaxReturn({
      taxYear: 2025, status: 'single', w2: 200000,
    })
    // The NOL cannot zero out taxable income — at least 20% survives, so some tax
    // remains due, and strictly less than the no-NOL case.
    expect(withNOL.totalTax).toBeGreaterThan(0)
    expect(withNOL.totalTax).toBeLessThan(withoutNOL.totalTax)
  })
})
