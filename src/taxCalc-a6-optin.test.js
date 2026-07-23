// src/taxCalc-a6-optin.test.js
//
// A6 follow-ups (independent audit, Jul 2026):
//   ITEM 3 — §199A applies to rental income only when the property is a §162 trade or
//            business or meets the rental safe harbor (Rev. Proc. 2019-38 / Notice
//            2019-07). QBI on rentals is now OPT-IN (per-property `qbiEligible`, or the
//            Step-2 `rentalQbiEligible` flag); default is NOT eligible.
//   ITEM 4 — A limited partner's Box 1 distributive share is excluded from self-
//            employment tax (IRC §1402(a)(13)). The `limitedPartner` flag routes the
//            interest to the Passive variant: no SE tax, QBI still applies.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './lib/taxCalc.js'

const BASE = {
  taxYear: 2026, status: 'single', dependents: 0, entities: [],
  w2: 0, k1Total: 0, rentalNet: 0, stGain: 0, ltGain: 0, intInc: 0,
  divInc: 0, qualDiv: 0, f4797Inc: 0, taxableSS: 0, iraIncome: 0,
}

describe('ITEM 3 — rental QBI is opt-in (§162 trade/business or safe harbor)', () => {
  const rentalEntity = (extra = {}) => ({
    type: 'real-estate', own: 100,
    pnl: { netProfit: 50000, grossRevenue: 50000, totalExpenses: 0, officerSalary: 0 },
    ...extra,
  })

  it('a Step-1 rental does NOT get the §199A deduction by default', () => {
    const r = calcTaxReturn({ ...BASE, w2: 30000, k1Total: 50000, entities: [rentalEntity()] })
    expect(r.qbi).toBe(0)
  })

  it('a Step-1 rental WITH qbiEligible:true gets the §199A deduction', () => {
    const r = calcTaxReturn({ ...BASE, w2: 30000, k1Total: 50000, entities: [rentalEntity({ qbiEligible: true })] })
    expect(r.qbi).toBeGreaterThan(0)
  })

  it('eligible rental QBI exceeds the non-eligible baseline by 20% of the rental (cap permitting)', () => {
    const off = calcTaxReturn({ ...BASE, w2: 30000, k1Total: 50000, entities: [rentalEntity()] })
    const on  = calcTaxReturn({ ...BASE, w2: 30000, k1Total: 50000, entities: [rentalEntity({ qbiEligible: true })] })
    // Taxable income is well above 20% × rental, so the QBI component binds: 20% × 50,000 = 10,000.
    expect(on.qbi - off.qbi).toBe(10000)
  })

  it('Step-2 direct rental is also opt-in via rentalQbiEligible', () => {
    const off = calcTaxReturn({ ...BASE, w2: 30000, rentalNet: 50000 })
    const on  = calcTaxReturn({ ...BASE, w2: 30000, rentalNet: 50000, rentalQbiEligible: true })
    expect(off.qbi).toBe(0)
    expect(on.qbi).toBeGreaterThan(0)
  })
})

describe('ITEM 4 — limited partner is not subject to SE tax (§1402(a)(13))', () => {
  const partnership = (extra = {}) => ({
    type: 'Partnership / LLC', own: 100,
    pnl: { netProfit: 100000, grossRevenue: 100000, totalExpenses: 0, officerSalary: 0 },
    ...extra,
  })

  it('a general/active partner IS subject to SE tax (default)', () => {
    const r = calcTaxReturn({ ...BASE, k1Total: 100000, entities: [partnership()] })
    expect(r.seTax).toBeGreaterThan(0)
  })

  it('a limited partner is NOT subject to SE tax', () => {
    const r = calcTaxReturn({ ...BASE, k1Total: 100000, entities: [partnership({ limitedPartner: true })] })
    expect(r.seTax).toBe(0)
  })

  it('a limited partner still receives the §199A QBI deduction on the K-1', () => {
    const r = calcTaxReturn({ ...BASE, k1Total: 100000, entities: [partnership({ limitedPartner: true })] })
    expect(r.qbi).toBeGreaterThan(0)
  })

  it('the active partner has SE tax and the limited partner does not; both returns compute', () => {
    const active  = calcTaxReturn({ ...BASE, k1Total: 100000, entities: [partnership()] })
    const limited = calcTaxReturn({ ...BASE, k1Total: 100000, entities: [partnership({ limitedPartner: true })] })
    expect(active.seTax).toBeGreaterThan(0)
    expect(limited.seTax).toBe(0)
    // No ½-SE-tax above-the-line deduction for the limited partner, so AGI is at least as high.
    expect(limited.agi).toBeGreaterThanOrEqual(active.agi)
  })
})
