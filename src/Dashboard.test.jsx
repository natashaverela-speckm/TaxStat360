// Unit tests for calcDashboard() — the Dashboard's per-business tax computation.
// Uses the REAL engine (no mocks) so the C-Corp parity assertion is meaningful: the
// Dashboard must produce the same corporate tax as the shared layer that the Tax Tracker
// and entity comparison use.
import { describe, it, expect } from 'vitest'
import { calcDashboard } from './Dashboard'
import { calcCCorpCorporateLayer } from './taxCalc'

const f1040 = {
  filingStatus: 'single', w2Income: '0', otherIncome: '0',
  dependents: '0', estimatedPayments: '0',
}

// Business: $300k revenue, $50k operating expenses, $80k officer salary, single owner.
// Persisted pnl.netProfit is AFTER salary (300k − 50k − 80k = 170k), matching how the
// Tax Tracker stores it; before-salary profit is therefore 250k.
const cCorpBiz = {
  entityType: 'C Corporation',
  grossRevenue: '300000', cogs: '0', operatingExpenses: '50000',
  officerSalary: '80000', ownershipPct: '100', year: '2025',
  pnl: { netProfit: 170000, officerSalary: 80000 },
}

describe('calcDashboard — C-Corp', () => {
  it('produces the same corporate tax as the shared layer (cross-surface parity)', () => {
    const calc = calcDashboard(cCorpBiz, f1040)
    const layer = calcCCorpCorporateLayer({ netProfit: 250000, officerSalary: 80000, taxYear: 2025 })
    expect(calc.isCCorp).toBe(true)
    expect(calc.corpTax).toBe(layer.corpTax)
    expect(calc.corpTax).toBeGreaterThan(0)
  })

  it('includes the corporate tax in the total (was previously omitted)', () => {
    const calc = calcDashboard(cCorpBiz, f1040)
    // Total must exceed the corporate tax alone (personal tax on salary + dividends added).
    expect(calc.totalTax).toBeGreaterThan(calc.corpTax)
    expect(calc.combinedTax).toBe(calc.totalTax)
    expect(calc.taxOwed).toBe(Math.max(0, calc.totalTax))
  })
})

describe('calcDashboard — pass-through (S-Corp)', () => {
  it('does not apply corporate tax and routes through the personal engine', () => {
    const calc = calcDashboard({ ...cCorpBiz, entityType: 'S Corporation' }, f1040)
    expect(calc.isCCorp).toBe(false)
    expect(calc.corpTax).toBe(0)
    expect(calc.combinedTax).toBe(calc.totalTax)
    expect(calc.totalTax).toBeGreaterThan(0)
  })
})
