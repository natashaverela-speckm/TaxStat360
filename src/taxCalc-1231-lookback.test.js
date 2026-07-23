// RENAMED (M6, audit F-07) from taxCalc-f3f5.test.js. Ticket history: F3/F5.
// Subject: §1231(c) 5-year lookback recharacterization and §199A treatment of
// basis-suspended losses.
import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './lib/taxCalc.js'

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

  it('CHAR: no prior §1231 losses → full gain stays preferential (default frozen)', () => {
    const r = calcTaxReturn({ ...base, f4797Inc: 20000 })
    expect(r.ordinary1231Recapture).toBe(0)
    expect(r.totalPrefIncome).toBe(20000)
  })

  it('SPEC: §1231(c) — prior losses ≥ gain → entire gain recharacterized as ordinary', () => {
    const r = calcTaxReturn({ ...base, f4797Inc: 20000, nonrecapturedNet1231Loss: 25000 })
    expect(r.ordinary1231Recapture).toBe(20000) // capped at the gain
    expect(r.totalPrefIncome).toBe(0)           // nothing left at LTCG rates
  })

  it('SPEC: §1231(c) — prior losses < gain → partial recharacterization', () => {
    const r = calcTaxReturn({ ...base, f4797Inc: 20000, nonrecapturedNet1231Loss: 12000 })
    expect(r.ordinary1231Recapture).toBe(12000)
    expect(r.totalPrefIncome).toBe(8000)        // remainder preferential
  })

  it('CHAR: recharacterization to ordinary does not lower tax in this bracket', () => {
    const pref = calcTaxReturn({ ...base, f4797Inc: 20000 })
    const ord  = calcTaxReturn({ ...base, f4797Inc: 20000, nonrecapturedNet1231Loss: 20000 })
    expect(ord.totalTax).toBeGreaterThanOrEqual(pref.totalTax)
    expect(Number.isFinite(ord.totalTax)).toBe(true)
  })

  it('SPEC: §1231(a)(2) — lookback does not apply to a net §1231 LOSS', () => {
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
  it('SPEC: §199A / Reg. §1.199A-3(b)(1)(iv) — basis-suspended loss does NOT enter the QBI carryforward', () => {
    const r = calcTaxReturn({
      taxYear: 2025, status: 'single', w2: 100000,
      entities: [{ type: 'S Corporation', own: '100', pnl: { netProfit: -50000 }, stockBasis: '' }],
      assumeZeroBasisOnLoss: true,
    })
    expect(r.qbiCarryforward).toBe(0)
  })

  it('SPEC: §199A — an ALLOWED loss still reduces QBI / creates a carryforward', () => {
    const r = calcTaxReturn({
      taxYear: 2025, status: 'single', w2: 100000,
      entities: [{ type: 'S Corporation', own: '100', pnl: { netProfit: -50000 }, stockBasis: 60000 }],
      assumeZeroBasisOnLoss: true,
    })
    expect(r.qbiCarryforward).toBe(50000)
  })
})
