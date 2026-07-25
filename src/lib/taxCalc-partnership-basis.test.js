// src/taxCalc-partnership-basis.test.js
//
// F5 (independent audit, Jul 2026) — PARTNERSHIP §704(d) OUTSIDE-BASIS LOSS LIMIT.
//
// Correction to the initial finding: the ENGINE already limits a partnership loss by
// outside basis (isLimitable includes partnerships; assumeZeroBasisOnLoss defaults on),
// so a loss with no basis is fully SUSPENDED — not deducted in full. The gap was the UI:
// no field to ENTER partnership outside basis (incl. the §752 share of liabilities), so
// the loss was stuck suspended. These tests pin the engine behavior the new UI feeds.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

const base = { filingStatus: 'single', year: 2026, w2: 200000, assumeZeroBasisOnLoss: true }
const pship = (extra = {}) => ({ type: 'Partnership / LLC', own: 100, k1: -80000, ...extra })

describe('F5 — partnership §704(d) outside-basis loss limit', () => {
  it('no basis entered → the whole loss is suspended (not deducted)', () => {
    const r = calcTaxReturn({ ...base, k1Total: -80000, entities: [pship()] })
    expect(r.totalSuspendedLoss).toBe(80000)
    expect(r.grossIncome).toBe(200000)          // loss did NOT reduce the $200k of other income
  })

  it('sufficient outside basis → the loss is fully allowed', () => {
    const r = calcTaxReturn({ ...base, k1Total: -80000, entities: [pship({ stockBasis: 100000 })] })
    expect(r.totalSuspendedLoss).toBe(0)
    expect(r.grossIncome).toBe(120000)          // 200k − 80k
  })

  it('§752 share of liabilities (debtBasis) increases the loss allowed', () => {
    // $30k outside basis + $40k share of liabilities = $70k absorbs; $10k suspended.
    const r = calcTaxReturn({ ...base, k1Total: -80000, entities: [pship({ stockBasis: 30000, debtBasis: 40000 })] })
    expect(r.totalSuspendedLoss).toBe(10000)
    expect(r.grossIncome).toBe(200000 - 70000)  // only the $70k basis-supported loss is deducted
  })

  it('partial basis → partial loss, remainder carried forward', () => {
    const r = calcTaxReturn({ ...base, k1Total: -80000, entities: [pship({ stockBasis: 50000 })] })
    expect(r.totalSuspendedLoss).toBe(30000)
    expect(r.grossIncome).toBe(150000)          // 200k − 50k allowed
  })
})
