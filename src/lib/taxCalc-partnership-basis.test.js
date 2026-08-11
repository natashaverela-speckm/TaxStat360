// src/taxCalc-partnership-basis.test.js
//
// F5 (independent audit, Jul 2026) — PARTNERSHIP §704(d) OUTSIDE-BASIS LOSS LIMIT.
//
// Correction to the initial finding: the ENGINE already limits a partnership loss by
// outside basis (isLimitable includes partnerships; assumeZeroBasisOnLoss defaults on),
// so a loss with no basis is fully SUSPENDED — not deducted in full. The gap was the UI:
// no field to ENTER partnership outside basis (incl. the §752 share of liabilities), so
// the loss was stuck suspended. These tests pin the engine behavior the new UI feeds.

//
// Module C (audit F-2, Aug 2026) — CHAR: labels backfilled onto every test in
// this file per ARCHITECTURE.md §6 ("New tests MUST be labeled"), following the
// same M6b pattern used on taxCalc-engine.test.js: CHAR is the mechanical floor
// claim (freezes current behavior) that is always true for an existing, passing
// test. None were promoted to SPEC in this pass — that requires independently
// re-verifying each expected value against its cited authority, a per-test
// judgment call left for a follow-up pass, not something to mass-apply here.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

const base = { filingStatus: 'single', year: 2026, w2: 200000, assumeZeroBasisOnLoss: true }
const pship = (extra = {}) => ({ type: 'Partnership / LLC', own: 100, k1: -80000, ...extra })

describe('F5 — partnership §704(d) outside-basis loss limit', () => {
  it('CHAR: no basis entered → the whole loss is suspended (not deducted)', () => {
    const r = calcTaxReturn({ ...base, k1Total: -80000, entities: [pship()] })
    expect(r.totalSuspendedLoss).toBe(80000)
    expect(r.grossIncome).toBe(200000)          // loss did NOT reduce the $200k of other income
  })

  it('CHAR: sufficient outside basis → the loss is fully allowed', () => {
    const r = calcTaxReturn({ ...base, k1Total: -80000, entities: [pship({ stockBasis: 100000 })] })
    expect(r.totalSuspendedLoss).toBe(0)
    expect(r.grossIncome).toBe(120000)          // 200k − 80k
  })

  it('CHAR: §752 share of liabilities (debtBasis) increases the loss allowed', () => {
    // $30k outside basis + $40k share of liabilities = $70k absorbs; $10k suspended.
    const r = calcTaxReturn({ ...base, k1Total: -80000, entities: [pship({ stockBasis: 30000, debtBasis: 40000 })] })
    expect(r.totalSuspendedLoss).toBe(10000)
    expect(r.grossIncome).toBe(200000 - 70000)  // only the $70k basis-supported loss is deducted
  })

  it('CHAR: partial basis → partial loss, remainder carried forward', () => {
    const r = calcTaxReturn({ ...base, k1Total: -80000, entities: [pship({ stockBasis: 50000 })] })
    expect(r.totalSuspendedLoss).toBe(30000)
    expect(r.grossIncome).toBe(150000)          // 200k − 50k allowed
  })
})
