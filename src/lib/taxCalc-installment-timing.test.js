// Follow-up (15 Sep 2026) — remaining-installment timing for the estimated-payment
// recommendation. §6654(c)(2): installments due Apr 15, Jun 15, Sep 15 and Jan 15 (next year).
// With `asOfDate` the engine spreads the safe-harbor shortfall and the full balance over the
// dates still ahead; without it the legacy ÷ 4 is preserved byte-for-byte.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

// Single 2026, $100k Schedule C, no payments: total $22,365; 90% = $20,129 (rounded).
const base = { taxYear: 2026, status: 'single', entities: [{ type: 'Sole Proprietor / SMLLC', k1: 100000, own: 100, netProfit: 100000 }], k1Total: 100000 }
const run = (extra = {}) => calcTaxReturn({ ...base, ...extra })

describe('installment timing — legacy behavior without asOfDate', () => {
  it('CHAR: no asOfDate ⇒ 4 installments, quarterly = balance ÷ 4, nextDueDate = Apr 15', () => {
    const r = run()
    expect(r.installmentsRemaining).toBe(4)
    expect(r.installmentsPassed).toBe(0)
    expect(r.quarterlyRecommended).toBe(Math.round(r.balance / 4))
    expect(r.nextDueDate).toBe('2026-04-15')
  })
  it('CHAR: an unparseable asOfDate falls back to the legacy split', () => {
    expect(run({ asOfDate: 'not a date' }).installmentsRemaining).toBe(4)
  })
})

describe('installment timing — with asOfDate', () => {
  it('SPEC: Jan 10 of the tax year ⇒ all 4 ahead (identical to legacy)', () => {
    const r = run({ asOfDate: '2026-01-10' })
    expect(r.installmentsRemaining).toBe(4)
    expect(r.quarterlyRecommended).toBe(run().quarterlyRecommended)
  })
  it('SPEC: on the due date itself the installment still counts as ahead (Sep 15 ⇒ 2 left: Sep 15, Jan 15)', () => {
    const r = run({ asOfDate: '2026-09-15' })
    expect(r.installmentsRemaining).toBe(2)
    expect(r.installmentsPassed).toBe(2)
    expect(r.nextDueDate).toBe('2026-09-15')
    expect(r.quarterlyRecommended).toBe(Math.round(r.balance / 2))
  })
  it('SPEC: Sep 16 ⇒ only Jan 15 left; the whole balance is the single recommendation', () => {
    const r = run({ asOfDate: '2026-09-16' })
    expect(r.installmentsRemaining).toBe(1)
    expect(r.nextDueDate).toBe('2027-01-15')
    expect(r.quarterlyRecommended).toBe(r.balance)
  })
  it('SPEC: after Jan 15 of the following year ⇒ 0 remaining, nextDueDate null, full balance "due now"', () => {
    const r = run({ asOfDate: '2027-02-01' })
    expect(r.installmentsRemaining).toBe(0)
    expect(r.installmentsPassed).toBe(4)
    expect(r.nextDueDate).toBeNull()
    expect(r.quarterlyRecommended).toBe(r.balance)
    expect(r.balancePerInstallment).toBe(r.balance)
  })
  it('SPEC: a prior tax year viewed today ⇒ every date has passed', () => {
    const r = calcTaxReturn({ ...base, taxYear: 2025, asOfDate: '2026-09-15' })
    expect(r.installmentsRemaining).toBe(0)
  })
  it('SPEC: safe-harbor minimum is spread the same way and stays separate from the full-balance figure', () => {
    // prior-year tax $10,000 (AGI under $150k ⇒ 100%): required $10,000 < 90% × current.
    const r = run({ asOfDate: '2026-09-15', priorYearTax: 10000, priorYearAGI: 90000, estPaid: 4000 })
    expect(r.safeHarborMinimum).toBe(10000)
    expect(r.safeHarborQuarterly).toBe(Math.round((10000 - 4000) / 2))   // $3,000 per remaining installment
    expect(r.balancePerInstallment).toBe(Math.round((r.totalTax - 4000) / 2))
    expect(r.quarterlyRecommended).toBe(r.balancePerInstallment)          // "cover the full balance" figure
    expect(r.safeHarborQuarterly).toBeLessThan(r.quarterlyRecommended)
  })
  it('SPEC: safe harbor already met ⇒ safeHarborQuarterly 0 even with a balance still due', () => {
    const r = run({ asOfDate: '2026-09-15', priorYearTax: 10000, priorYearAGI: 90000, estPaid: 12000 })
    expect(r.safeHarborQuarterly).toBe(0)
    expect(r.balance).toBeGreaterThan(0)
  })
  it('SPEC: accepts a Date object', () => {
    expect(run({ asOfDate: new Date(2026, 5, 20) }).installmentsRemaining).toBe(2)
  })
})
