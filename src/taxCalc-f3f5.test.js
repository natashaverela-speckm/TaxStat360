import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

// =============================================================================
// F5 — §1231(c) 5-year lookback recharacterization
//
// A net §1231 GAIN is recharacterized as ORDINARY income to the extent of the
// taxpayer's nonrecaptured net §1231 losses from the prior five years
// (IRC §1231(c)(1)); only the excess keeps long-term capital-gain treatment.
// The new `nonrecapturedNet1231Loss` input defaults to 0, so callers that do
// not supply it are unaffected (additive change).
// =============================================================================
describe('F5 — §1231(c) lookback', () => {
  const base = { taxYear: 2025, status: 'single', w2: 80000 }

  it('default (no prior §1231 losses): the full §1231 gain stays preferential', () => {
    const r = calcTaxReturn({ ...base, f4797Inc: 20000 })
    expect(r.ordinary1231Recapture).toBe(0)
    expect(r.totalPrefIncome).toBe(20000)
  })

  it('prior §1231 losses ≥ gain: the entire gain is recharacterized as ordinary', () => {
    const r = calcTaxReturn({ ...base, f4797Inc: 20000, nonrecapturedNet1231Loss: 25000 })
    expect(r.ordinary1231Recapture).toBe(20000) // capped at the gain
    expect(r.totalPrefIncome).toBe(0)           // nothing left at LTCG rates
  })

  it('prior §1231 losses < gain: partial recharacterization', () => {
    const r = calcTaxReturn({ ...base, f4797Inc: 20000, nonrecapturedNet1231Loss: 12000 })
    expect(r.ordinary1231Recapture).toBe(12000)
    expect(r.totalPrefIncome).toBe(8000)        // remainder preferential
  })

  it('recharacterizing to ordinary does not lower tax (ordinary ≥ LTCG rate here)', () => {
    const pref = calcTaxReturn({ ...base, f4797Inc: 20000 })
    const ord  = calcTaxReturn({ ...base, f4797Inc: 20000, nonrecapturedNet1231Loss: 20000 })
    expect(ord.totalTax).toBeGreaterThanOrEqual(pref.totalTax)
    expect(Number.isFinite(ord.totalTax)).toBe(true)
  })

  it('does not apply to a net §1231 LOSS (negative Form 4797)', () => {
    const r = calcTaxReturn({ ...base, f4797Inc: -10000, nonrecapturedNet1231Loss: 50000 })
    expect(r.ordinary1231Recapture).toBe(0)
  })
})

// =============================================================================
// F3 — §199A excludes a §1366(d) basis-suspended loss from QBI
//
// A loss suspended for lack of stock/debt basis is not taken into account for
// QBI until the year it is allowed (Treas. Reg. §1.199A-3(b)(1)(iv)). The engine
// previously used a `nv(e.k1) || grossNetProfit` fallback that treated a fully
// suspended loss (k1 === 0) as "missing" and fell back to the gross loss,
// leaking the suspended amount into the QBI carryforward.
// =============================================================================
describe('F3 — §199A × §1366(d) suspended-loss treatment', () => {
  it('a fully basis-suspended loss does NOT leak into the QBI carryforward', () => {
    const r = calcTaxReturn({
      taxYear: 2025, status: 'single', w2: 100000,
      entities: [{ type: 'S Corporation', own: '100', pnl: { netProfit: -50000 }, stockBasis: '' }],
      assumeZeroBasisOnLoss: true,
    })
    expect(r.qbiCarryforward).toBe(0)
  })

  it('an ALLOWED loss (basis covers it) still reduces QBI / creates a carryforward', () => {
    const r = calcTaxReturn({
      taxYear: 2025, status: 'single', w2: 100000,
      entities: [{ type: 'S Corporation', own: '100', pnl: { netProfit: -50000 }, stockBasis: 60000 }],
      assumeZeroBasisOnLoss: true,
    })
    expect(r.qbiCarryforward).toBe(50000)
  })
})
