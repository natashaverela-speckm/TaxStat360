// Phase 3 (Aug 2026) — LIMITATION 121-HOME-SALE, owner decision: a lightweight,
// standalone §121 principal-residence-sale calculator (AIAnalysis.jsx Reports &
// Tools -> Section121Modal). This file is the SPEC test suite for the pure
// statutory math in `calcSection121Exclusion` (taxCalc.js). Values are
// hand-computed from IRC §121(a)-(b) and §165(c).

import { describe, it, expect } from 'vitest'
// calcSection121Exclusion is exported via the same bottom `export { ... }` block
// as calcReasonableCompCore (matches the module's actual export surface).
import { calcTaxReturn, calcSection121Exclusion } from './taxCalc.js'

describe('§121 — calcSection121Exclusion', () => {
  it('SPEC: single filer, full exclusion — gain under the $250,000 cap is entirely excluded', () => {
    const r = calcSection121Exclusion({
      status: 'single', salePrice: 600000, sellingExpenses: 30000, adjustedBasis: 400000,
      meetsOwnershipAndUseTest: true,
    })
    // amountRealized = 600,000 - 30,000 = 570,000; gain = 570,000 - 400,000 = 170,000
    expect(r.amountRealized).toBe(570000)
    expect(r.gain).toBe(170000)
    expect(r.maxExclusion).toBe(250000)
    expect(r.eligible).toBe(true)
    expect(r.excludedGain).toBe(170000)
    expect(r.taxableGain).toBe(0)
  })

  it('SPEC: single filer, gain EXCEEDS the $250,000 cap — excess is taxable', () => {
    const r = calcSection121Exclusion({
      status: 'single', salePrice: 900000, sellingExpenses: 0, adjustedBasis: 300000,
      meetsOwnershipAndUseTest: true,
    })
    // gain = 900,000 - 300,000 = 600,000; excluded capped at 250,000; taxable = 350,000
    expect(r.gain).toBe(600000)
    expect(r.excludedGain).toBe(250000)
    expect(r.taxableGain).toBe(350000)
  })

  it('SPEC: MFJ gets the $500,000 ceiling instead of $250,000', () => {
    const r = calcSection121Exclusion({
      status: 'mfj', salePrice: 900000, sellingExpenses: 0, adjustedBasis: 300000,
      meetsOwnershipAndUseTest: true,
    })
    expect(r.maxExclusion).toBe(500000)
    expect(r.gain).toBe(600000)
    expect(r.excludedGain).toBe(500000)
    expect(r.taxableGain).toBe(100000)
  })

  it('SPEC: MFS/HOH/QSS all get the $250,000 (non-MFJ) ceiling — only "mfj" (case-insensitive) gets $500,000', () => {
    for (const status of ['mfs', 'hoh', 'qss', 'single', 'MFJ', 'Mfj']) {
      const r = calcSection121Exclusion({ status, salePrice: 100000, adjustedBasis: 50000, meetsOwnershipAndUseTest: true })
      expect(r.maxExclusion).toBe(String(status).toLowerCase() === 'mfj' ? 500000 : 250000)
    }
  })

  it('SPEC: ownership-and-use test NOT met — no exclusion, full gain flagged taxable', () => {
    const r = calcSection121Exclusion({
      status: 'single', salePrice: 400000, adjustedBasis: 300000,
      meetsOwnershipAndUseTest: false,
    })
    expect(r.gain).toBe(100000)
    expect(r.eligible).toBe(false)
    expect(r.excludedGain).toBe(0)
    expect(r.taxableGain).toBe(100000)
  })

  it('SPEC: a loss on sale is nondeductible under §165(c) — §121 has no effect either way', () => {
    const r = calcSection121Exclusion({
      status: 'single', salePrice: 300000, sellingExpenses: 10000, adjustedBasis: 400000,
      meetsOwnershipAndUseTest: true,
    })
    // amountRealized = 290,000; gain = 290,000 - 400,000 = -110,000
    expect(r.gain).toBe(-110000)
    expect(r.nondeductibleLoss).toBe(true)
    expect(r.excludedGain).toBe(0)
    expect(r.taxableGain).toBe(0)
    expect(r.eligible).toBe(null)
  })

  it('SPEC: exactly $0 gain is neither a loss nor excludable/taxable — a no-op result', () => {
    const r = calcSection121Exclusion({
      status: 'single', salePrice: 400000, adjustedBasis: 400000,
      meetsOwnershipAndUseTest: true,
    })
    expect(r.gain).toBe(0)
    expect(r.nondeductibleLoss).toBe(false)
    expect(r.excludedGain).toBe(0)
    expect(r.taxableGain).toBe(0)
  })

  it('SPEC: nonqualifiedUseFlag passes through only when there IS a taxable/excluded outcome (eligible === true)', () => {
    const withFlag = calcSection121Exclusion({
      status: 'single', salePrice: 400000, adjustedBasis: 300000,
      meetsOwnershipAndUseTest: true, everRentedOrBusinessUse: true,
    })
    expect(withFlag.nonqualifiedUseFlag).toBe(true)

    const withoutFlag = calcSection121Exclusion({
      status: 'single', salePrice: 400000, adjustedBasis: 300000,
      meetsOwnershipAndUseTest: true, everRentedOrBusinessUse: false,
    })
    expect(withoutFlag.nonqualifiedUseFlag).toBe(false)

    // Not surfaced when the test isn't met at all (eligible: false) — nothing to caveat.
    const notEligible = calcSection121Exclusion({
      status: 'single', salePrice: 400000, adjustedBasis: 300000,
      meetsOwnershipAndUseTest: false, everRentedOrBusinessUse: true,
    })
    expect(notEligible.nonqualifiedUseFlag).toBeUndefined()
  })

  it('SPEC: negative selling expenses and missing/blank inputs are handled safely (no NaN, comma-safe via nf)', () => {
    const r = calcSection121Exclusion({
      status: 'single', salePrice: '450,000', sellingExpenses: -5000, adjustedBasis: '350,000',
      meetsOwnershipAndUseTest: true,
    })
    // Negative selling expenses clamp to 0 rather than INCREASING amountRealized.
    expect(r.amountRealized).toBe(450000)
    expect(r.gain).toBe(100000)
    expect(Number.isNaN(r.gain)).toBe(false)

    const blank = calcSection121Exclusion({ status: 'single', salePrice: '', adjustedBasis: '', meetsOwnershipAndUseTest: true })
    expect(blank.amountRealized).toBe(0)
    expect(blank.gain).toBe(0)
    expect(Number.isNaN(blank.gain)).toBe(false)
  })

  it('CHAR: standalone — calcSection121Exclusion is not wired into calcTaxReturn\'s output (informational-only by design)', () => {
    const r = calcTaxReturn({
      taxYear: 2026, status: 'single', dependents: 0,
      entities: [], w2: 100000, k1Total: 0, w2Withheld: 0, estPaid: 0,
    })
    expect(r.section121).toBeUndefined()
    expect(r.excludedGain).toBeUndefined()
  })
})
