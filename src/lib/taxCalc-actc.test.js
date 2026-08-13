// Phase 4 (Aug 2026) — LIMITATION CTC-ACTC. IRC §24(h)(5): up to
// TAX_TABLES[year].ctc.actcMaxPerChild ($1,700 for 2024-2026) of an otherwise-unusable,
// nonrefundable-capped Child Tax Credit is refundable, limited to 15% of earned income
// (§32(c)(2) definition) over $2,500. Placed on `balance` like a payment (Form 1040 Line
// 28), NOT subtracted from `totalTax` (which would misstate liability itself).
//
// Test strategy: rather than hand-computing federal bracket math to predict `childCredit`/
// `ctcRaw` (already independently tested elsewhere in this suite), these tests read those
// PRE-EXISTING, already-verified engine outputs and independently hand-derive the ACTC
// formula from the statute (15% of earned-income excess, per-child cap, unused-CTC cap) to
// check `actc` against. This avoids re-deriving bracket math while still testing the NEW
// logic against the statute, not against the engine's own (possibly wrong) output.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'
import { CURRENT_TAX_YEAR } from './constants.js'

const run = (extra = {}) => calcTaxReturn({
  taxYear: CURRENT_TAX_YEAR, status: 'single', dependents: 0,
  entities: [], w2: 0, k1Total: 0, w2Withheld: 0, estPaid: 0,
  ...extra,
})

describe('Phase 4 — CTC-ACTC: refundable Additional Child Tax Credit', () => {
  it('SPEC: low income, 3 dependents — actc matches the hand-derived §24(h)(5) formula using the engine\'s own (pre-existing) ctcRaw/childCredit', () => {
    const r = run({ dependents: 3, w2: 20000 })
    const unusedCTC = Math.max(0, r.ctcRaw - r.childCredit)
    const earnedIncome = 20000  // pure W2, no entities: seNetIncome/halfSE both 0
    const earnedIncomeLimit = Math.round(0.15 * Math.max(0, earnedIncome - 2500))
    const perChildCap = 3 * 1700
    const expected = Math.max(0, Math.min(unusedCTC, perChildCap, earnedIncomeLimit))
    expect(r.unusedCTC).toBe(unusedCTC)
    expect(r.earnedIncomeForACTC).toBe(earnedIncome)
    expect(r.actc).toBe(expected)
    // Sanity: this scenario should actually produce a nonzero ACTC (otherwise the test
    // isn't exercising the interesting path) — $20k earned income is low enough that the
    // nonrefundable credit can't be fully used against a small tax liability.
    expect(r.actc).toBeGreaterThan(0)
  })

  it('SPEC: zero dependents — actc is always 0, regardless of income', () => {
    const r = run({ dependents: 0, w2: 20000 })
    expect(r.actc).toBe(0)
  })

  it('SPEC: zero earned income (investment-income-only household) — actc is 0 even with dependents and an otherwise-unused CTC', () => {
    const r = run({ dependents: 2, w2: 0, intInc: 100000 })
    expect(r.earnedIncomeForACTC).toBe(0)
    expect(r.actc).toBe(0)
  })

  it('SPEC: high income fully absorbs the nonrefundable CTC — unusedCTC is 0, so actc is 0 too (nothing left to refund)', () => {
    const r = run({ dependents: 2, w2: 300000 })
    expect(r.unusedCTC).toBe(0)
    expect(r.actc).toBe(0)
  })

  it('SPEC: earned-income limit binds before the per-child cap — a single dependent with very low earned income', () => {
    // 1 dependent: per-child cap = $1,700. Earned income $5,000 → 15% of (5,000-2,500)
    // = $375, well under $1,700 — the earned-income limit should be the binding cap.
    const r = run({ dependents: 1, w2: 5000 })
    const earnedIncomeLimit = Math.round(0.15 * Math.max(0, 5000 - 2500))
    expect(earnedIncomeLimit).toBe(375)
    expect(r.actc).toBeLessThanOrEqual(375)
    // And it should actually BE 375 as long as unusedCTC is large enough to not itself
    // be the binding constraint (a $2,200 CTC vs. a ~$0 tax liability at $5,000 income
    // comfortably clears that).
    expect(r.actc).toBe(Math.min(375, Math.max(0, r.ctcRaw - r.childCredit)))
  })

  it('CHAR: actc is placed on balance like a payment, NOT subtracted from totalTax — exact identity holds', () => {
    const r = run({ dependents: 3, w2: 20000, w2Withheld: 1000 })
    expect(r.balance).toBe(r.totalTax - r.totalPayments - r.actc)
  })

  it('SPEC: actcMaxPerChild reads $1,700 for the current table year (2024-2026 confirmed unchanged)', () => {
    const r = run({ dependents: 1, w2: 20000 })
    expect(r.actcMaxPerChild).toBe(1700)
  })
})
