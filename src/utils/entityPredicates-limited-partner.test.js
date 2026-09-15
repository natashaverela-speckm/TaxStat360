// FIFTH READ (15 Sep 2026) — a `limitedPartner` attestation can outlive a type change
// (Partnership → Sole Proprietor) on a Step-1 record. Three things must hold for such a
// stale flag: (1) the predicate says the type cannot carry it, (2) the engine still treats
// the entity as an SE-subject sole proprietor (no passive routing, no NII), and (3) the
// SE-savings heading in TaxReturn (which shares the predicate) does not call it
// "limited-partner" income. The type-change handler in CalculateTaxInner clears the flag,
// but records saved before that change still carry it — hence the engine/UI guards.

import { describe, it, expect } from 'vitest'
import { isLimitedPartnerEligibleType } from './entityPredicates.js'
import { isLimitedPartnerEligibleType as reExported, hasLimitedPartnerInterest } from '../lib/aiAnalysisTaxMath.js'
import { calcTaxReturn } from '../lib/taxCalc.js'

describe('isLimitedPartnerEligibleType', () => {
  it('true only for partnership / multi-member LLC labels (both vocabularies)', () => {
    expect(isLimitedPartnerEligibleType('Partnership / LLC')).toBe(true)
    expect(isLimitedPartnerEligibleType('Partnership / MMLLC — Active')).toBe(true)
    expect(isLimitedPartnerEligibleType('Partnership / MMLLC — Passive')).toBe(true)
  })
  it('false for BOTH sole-prop labels (the bare "LLC" trap), corporations, rentals, blank', () => {
    expect(isLimitedPartnerEligibleType('Sole Proprietor / SMLLC')).toBe(false)
    expect(isLimitedPartnerEligibleType('Sole Proprietor / Single-Member LLC')).toBe(false)
    expect(isLimitedPartnerEligibleType('S Corporation')).toBe(false)
    expect(isLimitedPartnerEligibleType('C Corporation')).toBe(false)
    expect(isLimitedPartnerEligibleType('Real Estate (Schedule E)')).toBe(false)
    expect(isLimitedPartnerEligibleType('')).toBe(false)
    expect(isLimitedPartnerEligibleType(undefined)).toBe(false)
  })
  it('aiAnalysisTaxMath still exports the same function (re-export, not a copy)', () => {
    expect(reExported).toBe(isLimitedPartnerEligibleType)
  })
})

describe('stale limitedPartner flag on a sole proprietor', () => {
  const stale = { type: 'Sole Proprietor / SMLLC', k1: 100000, own: 100, netProfit: 100000, limitedPartner: true }
  const clean = { type: 'Sole Proprietor / SMLLC', k1: 100000, own: 100, netProfit: 100000 }
  const run = (e) => calcTaxReturn({ taxYear: 2026, status: 'single', w2: 300000, entities: [e], k1Total: 100000 })
  it('engine: identical SE tax, NII and total tax with or without the stale flag', () => {
    const a = run(stale), b = run(clean)
    expect(a.seTax).toBe(b.seTax)
    expect(a.seTax).toBeGreaterThan(0)
    expect(a.passiveK1Income).toBe(0)
    expect(a.nii).toBe(b.nii)
    expect(a.totalTax).toBe(b.totalTax)
  })
  it('UI predicate: a sole prop with the stale flag is NOT a limited-partner interest', () => {
    expect(hasLimitedPartnerInterest([stale])).toBe(false)
    expect(hasLimitedPartnerInterest([{ type: 'Partnership / LLC', k1: 1, limitedPartner: true }])).toBe(true)
  })
})
