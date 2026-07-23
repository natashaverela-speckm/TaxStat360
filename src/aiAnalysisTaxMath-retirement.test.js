// src/aiAnalysisTaxMath-retirement.test.js
//
// F3/F8 (consistency audit, Jul 2026): known-good coverage for the retirement-plan
// strategy math extracted from AIAnalysis.jsx into aiAnalysisTaxMath.js. Before the
// extraction this logic lived inside a 2,600-line component and could only be
// exercised through component rendering; these are direct unit tests.
//
// The anchor figure ties to the rationale comment on selfEmployedRetirementBase:
// $150,000 of sole-proprietor net profit yields a $27,881 max SEP-IRA (20% of the
// net-of-half-SE-tax base), NOT $30,000 (20% of raw profit).

import { describe, it, expect } from 'vitest'
import {
  selfEmployedRetirementBase,
  seEligibleK1FromEntities,
  hasLimitedPartnerInterest,
  computeRetirementContributionRoom,
} from './lib/aiAnalysisTaxMath.js'

describe('selfEmployedRetirementBase (§164(f) net-of-half-SE-tax base)', () => {
  it('derives SE tax from the year table when no engine SE tax is given', () => {
    // seEarnings = 150000 * 0.9235 = 138525
    // SE tax = 138525*0.124 + 138525*0.029 = 21194.325 ; half = 10597.1625
    // base = 150000 - 10597.1625 = 139402.8375
    expect(selfEmployedRetirementBase(150000, 2025)).toBeCloseTo(139402.8375, 2)
  })

  it('uses the engine SE tax verbatim when provided (ties to filed return)', () => {
    // halfSeTax = 20000/2 = 10000 -> 150000 - 10000 = 140000
    expect(selfEmployedRetirementBase(150000, 2025, 20000)).toBe(140000)
  })

  it('returns 0 for zero or negative net SE income', () => {
    expect(selfEmployedRetirementBase(0, 2025)).toBe(0)
    expect(selfEmployedRetirementBase(-5000, 2025)).toBe(0)
  })
})

describe('seEligibleK1FromEntities (SE-eligible base, §1402)', () => {
  const K1 = 50000
  it('includes a general-partner / SE-subject K-1', () => {
    expect(seEligibleK1FromEntities([{ type: 'Partnership / LLC', own: 100, k1: K1 }])).toBe(K1)
  })
  it('excludes a limited-partner share (§1402(a)(13))', () => {
    expect(seEligibleK1FromEntities([{ type: 'Partnership / LLC', own: 100, k1: K1, limitedPartner: true }])).toBe(0)
  })
  it('excludes S-corp, C-corp and Schedule-E rental K-1', () => {
    expect(seEligibleK1FromEntities([{ type: 'S-Corp', own: 100, k1: K1 }])).toBe(0)
    expect(seEligibleK1FromEntities([{ type: 'Real Estate (Schedule E)', own: 100, k1: K1 }])).toBe(0)
  })
  it('nets multiple entities and tolerates a non-array', () => {
    expect(seEligibleK1FromEntities([
      { type: 'Partnership / LLC', own: 100, k1: 60000 },
      { type: 'S-Corp', own: 100, k1: 40000 },
    ])).toBe(60000)
    expect(seEligibleK1FromEntities(null)).toBe(0)
  })
})

describe('hasLimitedPartnerInterest', () => {
  it('is true only when a limited-partner interest is present', () => {
    expect(hasLimitedPartnerInterest([{ type: 'Partnership / LLC', own: 100, k1: 1, limitedPartner: true }])).toBe(true)
    expect(hasLimitedPartnerInterest([{ type: 'Partnership / LLC', own: 100, k1: 1 }])).toBe(false)
    expect(hasLimitedPartnerInterest(null)).toBe(false)
  })
})

describe('computeRetirementContributionRoom', () => {
  it('sole proprietor: 20% of net-of-half-SE-tax base, Solo-401(k) stacks the deferral', () => {
    const r = computeRetirementContributionRoom({
      isSCorpOwner: false, totalOfficerSalary: 0, seEligibleK1: 150000, seTax: undefined, year: 2025,
    })
    expect(r.sepBase).toBeCloseTo(139402.8375, 2)
    expect(r.sepRate).toBeCloseTo(0.20, 10)
    expect(r.sepIraMax).toBe(70000)
    expect(r.maxSEP).toBe(27881)                 // NOT 30000
    expect(r.solo401kDeferral).toBe(23500)
    expect(r.maxSolo401kEmployer).toBe(27881)
    expect(r.maxSolo401k).toBe(51381)            // 27881 + 23500
  })

  it('S-corp owner: base is W-2 officer salary at 25%, Solo-401(k) = 25% + deferral', () => {
    const r = computeRetirementContributionRoom({
      isSCorpOwner: true, totalOfficerSalary: 100000, seEligibleK1: 0, seTax: 0, year: 2025,
    })
    expect(r.sepBase).toBe(100000)
    expect(r.sepRate).toBe(0.25)
    expect(r.maxSEP).toBe(25000)
    expect(r.maxSolo401kEmployer).toBe(25000)
    expect(r.maxSolo401k).toBe(48500)            // 25000 + 23500
  })

  it('caps the SEP-IRA at the §415(c) annual limit', () => {
    // A very large salary must clamp to sepIraMax, not 25% of salary.
    const r = computeRetirementContributionRoom({
      isSCorpOwner: true, totalOfficerSalary: 1000000, seEligibleK1: 0, seTax: 0, year: 2025,
    })
    expect(r.maxSEP).toBe(70000)                 // min(70000, 250000)
    expect(r.maxSolo401k).toBe(70000)            // min(solo401kMax 70000, 250000+23500)
  })
})
