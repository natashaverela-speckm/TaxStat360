// src/lib/taxCalc-se-wage-base-coordination.test.js
//
// Independent audit, Aug 2026 -- Finding 4: the 12.4% OASDI portion of SE tax was
// capped at the FULL annual Social Security wage base, with no reduction for W-2
// wages the taxpayer already earned (and already paid OASDI tax on) that year --
// including their own S-Corp officer salary. IRC Section 1402(b) and the Form SE
// Part I coordination worksheet require netting the two: the 12.4% portion applies
// only to the wage-base ROOM remaining after existing W-2 OASDI wages.
//
// ssWageBaseRoom already existed in the engine (used only by the advisory
// scorpSeTaxSavings estimate) but was never applied to the actual seTax liability.
// Fix: ssPortion is now computed against ssWageBaseRoom instead of the raw
// ssWageBase; totalW2ForFICA/ssWageBaseRoom are hoisted above the SE tax block so
// they exist before ssPortion needs them.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

const smllc = (netProfit) => ({
  type: 'Sole Proprietor / SMLLC', own: 100,
  pnl: { netProfit, grossRevenue: netProfit, totalExpenses: 0 },
})

describe('Finding 4 -- SE tax Social Security wage-base coordination (IRC Section 1402(b))', () => {
  // Live-tested facts: $140,000 W-2 (S-Corp officer salary) + $234,200 combined SE
  // earnings, single filer, TY2025 (2025 SS wage base: $176,100).
  it('SPEC: SE tax nets W-2 wages against the shared wage base before applying 12.4%', () => {
    const w2 = 140000
    const netProfit = 234200
    const r = calcTaxReturn({
      status: 'single', taxYear: 2025, w2,
      entities: [smllc(netProfit)],
      k1Total: 0,
    })
    const SS_WAGE_BASE_2025 = 176100
    const SE_NET_EARNINGS_FACTOR = 0.9235
    const FICA_SS_RATE = 0.062
    const FICA_MEDICARE_RATE = 0.0145
    const seEarningsSubject = netProfit * SE_NET_EARNINGS_FACTOR
    const wageBaseRoom = Math.max(0, SS_WAGE_BASE_2025 - w2)
    const expectedSsPortion = Math.min(seEarningsSubject, wageBaseRoom) * (FICA_SS_RATE * 2)
    const expectedMedicare  = seEarningsSubject * (FICA_MEDICARE_RATE * 2)
    const expectedSeTax = Math.round(expectedSsPortion + expectedMedicare)
    expect(r.seTax).toBe(expectedSeTax)
    // Regression guard: must NOT match the uncoordinated (pre-fix) calculation, which
    // capped the 12.4% portion at the full $176,100 wage base regardless of the $140,000
    // of W-2 wages already earned.
    const uncoordinatedSsPortion = Math.min(seEarningsSubject, SS_WAGE_BASE_2025) * (FICA_SS_RATE * 2)
    const uncoordinatedSeTax = Math.round(uncoordinatedSsPortion + expectedMedicare)
    expect(r.seTax).toBeLessThan(uncoordinatedSeTax)
    expect(r.seTax).toBeCloseTo(10748, -1) // ~$10,748 coordinated vs. ~$28,109 uncoordinated
  })

  it('W-2 wages already at/above the wage base -> $0 OASDI portion, Medicare portion only', () => {
    const r = calcTaxReturn({
      status: 'single', taxYear: 2025, w2: 200000, // already exceeds the $176,100 2025 wage base
      entities: [smllc(50000)],
      k1Total: 0,
    })
    const seEarningsSubject = 50000 * 0.9235
    const expectedMedicareOnly = Math.round(seEarningsSubject * 0.029)
    expect(r.seTax).toBe(expectedMedicareOnly)
  })

  it('no W-2 wages -> full wage-base room available, matches the simple (uncoordinated) case', () => {
    const r = calcTaxReturn({
      status: 'single', taxYear: 2025, w2: 0,
      entities: [smllc(50000)],
      k1Total: 0,
    })
    const seEarningsSubject = 50000 * 0.9235
    const expected = Math.round(Math.min(seEarningsSubject, 176100) * 0.124 + seEarningsSubject * 0.029)
    expect(r.seTax).toBe(expected)
  })

  it('employee-side FICA withholding (a separate figure) is unaffected -- still caps at the FULL wage base for that one employer', () => {
    const r = calcTaxReturn({
      status: 'single', taxYear: 2025, w2: 140000,
      entities: [smllc(234200)],
      k1Total: 0,
    })
    expect(r.employeeFICA).toBe(Math.round(Math.min(140000, 176100) * 0.062 + 140000 * 0.0145))
  })
})
