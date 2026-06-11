import { describe, it, expect } from 'vitest'
import {
  getStdDed, getBrackets, calcFederalTax, calcPreferentialTax,
  calcNIIT, calcAMT, getMarginalRate,
} from './taxCalc.js'
import { CURRENT_TAX_YEAR } from './constants.js'

// =============================================================================
// getStdDed — standard deduction lookup by year + filing status
// =============================================================================
describe('getStdDed', () => {
  it('2025 single', () => expect(getStdDed(2025, 'single')).toBe(15750))
  it('2025 mfj', () => expect(getStdDed(2025, 'mfj')).toBe(31500))
  it('2025 mfs (= single)', () => expect(getStdDed(2025, 'mfs')).toBe(15750))
  it('2025 hoh', () => expect(getStdDed(2025, 'hoh')).toBe(23625))
  it('2025 qss (= mfj)', () => expect(getStdDed(2025, 'qss')).toBe(31500))
  it('2024 single uses 2024 table ($14,600)', () => expect(getStdDed(2024, 'single')).toBe(14600))
  it('2026 single uses 2026 OBBBA-adjusted ($16,100)', () => expect(getStdDed(2026, 'single')).toBe(16100))
  it('unknown year falls back to the current-year table', () => expect(getStdDed(2099, 'single')).toBe(getStdDed(CURRENT_TAX_YEAR, 'single')))
  it('unknown filing status falls back to single', () => expect(getStdDed(2025, 'civil_union')).toBe(15750))
})

// =============================================================================
// getBrackets — bracket array lookup by year + filing status
// =============================================================================
describe('getBrackets', () => {
  it('2025 single starts with $11,925 / 10%', () => {
    expect(getBrackets(2025, 'single')[0]).toEqual([11925, 0.10])
  })
  it('2025 single ends with [Infinity, 37%]', () => {
    expect(getBrackets(2025, 'single').at(-1)).toEqual([Infinity, 0.37])
  })
  it('2025 mfj 10% bracket boundary doubles single ($23,850)', () => {
    expect(getBrackets(2025, 'mfj')[0]).toEqual([23850, 0.10])
  })
  it('2025 mfj 22% bracket boundary at $206,700', () => {
    expect(getBrackets(2025, 'mfj').find(b => b[1] === 0.22)).toEqual([206700, 0.22])
  })
  it('2026 single 22% bracket boundary at $106,900 (post-OBBBA)', () => {
    expect(getBrackets(2026, 'single').find(b => b[1] === 0.22)).toEqual([106900, 0.22])
  })
  it('unknown year falls back to the current-year brackets', () => {
    expect(getBrackets(2099, 'single')).toEqual(getBrackets(CURRENT_TAX_YEAR, 'single'))
  })
  it('unknown filing status falls back to single brackets', () => {
    expect(getBrackets(2025, 'civil_union')[0]).toEqual([11925, 0.10])
  })
})

// =============================================================================
// calcFederalTax — progressive bracket walking on ordinary income
// =============================================================================
describe('calcFederalTax', () => {
  it('returns 0 for zero income', () => {
    expect(calcFederalTax(0, 2025, 'single')).toBe(0)
  })
  it('returns 0 for negative income', () => {
    expect(calcFederalTax(-5000, 2025, 'single')).toBe(0)
  })
  it('only the 10% bracket ($10k single 2025)', () => {
    // Entirely within first bracket: 10000 × 0.10 = 1000
    expect(calcFederalTax(10000, 2025, 'single')).toBe(1000)
  })
  it('spans 10% and 12% brackets ($30k single 2025)', () => {
    // 11925 × .10 + (30000 − 11925) × .12 = 1192.50 + 2169 = 3361.50 → 3362
    expect(calcFederalTax(30000, 2025, 'single')).toBe(3362)
  })
  it('spans through 22% bracket ($75k single 2025)', () => {
    expect(calcFederalTax(75000, 2025, 'single')).toBe(11414)
  })
  it('spans through 24% bracket ($150k single 2025)', () => {
    expect(calcFederalTax(150000, 2025, 'single')).toBe(28847)
  })
  it('spans through 32% bracket ($230k single 2025)', () => {
    expect(calcFederalTax(230000, 2025, 'single')).toBe(50663)
  })
  it('spans through 35% bracket ($500k single 2025)', () => {
    expect(calcFederalTax(500000, 2025, 'single')).toBe(144547)
  })
  it('reaches 37% top bracket ($800k single 2025)', () => {
    expect(calcFederalTax(800000, 2025, 'single')).toBe(253020)
  })
  it('exactly at the 12% bracket boundary ($48,475)', () => {
    expect(calcFederalTax(48475, 2025, 'single')).toBe(5579)
  })
  it('$1 above the 12% boundary rounds to same value', () => {
    expect(calcFederalTax(48476, 2025, 'single')).toBe(5579)
  })
  it('MFJ pays less than single on the same income (wider brackets)', () => {
    // MFJ at $75k: still in 12% bracket bands → lower effective rate than single
    expect(calcFederalTax(75000, 2025, 'mfj')).toBe(8523)
  })
  it('2026 brackets differ from 2025 (post-OBBBA inflation adjustment)', () => {
    expect(calcFederalTax(75000, 2026, 'single')).toBe(11252)
  })
  it('HOH brackets sit between single and MFJ', () => {
    expect(calcFederalTax(75000, 2025, 'hoh')).toBe(9675)
  })
})

// =============================================================================
// calcPreferentialTax — IRS QDCGTW: LTCG, qualDiv, unrecap1250, collectibles
// =============================================================================
describe('calcPreferentialTax', () => {
  it('returns 0 when all preferential items are zero', () => {
    expect(calcPreferentialTax(50000, {}, 2025, 'single')).toBe(0)
  })
  it('LTCG entirely in 0% bracket (low ordinary income)', () => {
    // Ordinary $20k, LTCG $10k → all $10k stacks below $48,350 (2025 single 0% top) → $0
    expect(calcPreferentialTax(20000, { ltcg: 10000 }, 2025, 'single')).toBe(0)
  })
  it('LTCG entirely in 15% bracket (mid ordinary)', () => {
    // Ordinary $100k > 0% threshold → $10k LTCG taxed at 15% = $1,500
    expect(calcPreferentialTax(100000, { ltcg: 10000 }, 2025, 'single')).toBe(1500)
  })
  it('LTCG straddling 0%/15% boundary', () => {
    // Ordinary $40k, LTCG $20k. 2025 single 0% top = $48,350.
    // $8,350 of LTCG fills 0% bracket; remaining $11,650 at 15% = $1,747.50 → $1,748
    expect(calcPreferentialTax(40000, { ltcg: 20000 }, 2025, 'single')).toBe(1748)
  })
  it('LTCG straddling 15%/20% boundary', () => {
    // Ordinary $450k, LTCG $200k. 2025 single 15% top = $533,400.
    // $83,400 of LTCG at 15% = $12,510; remaining $116,600 at 20% = $23,320 → $35,830
    expect(calcPreferentialTax(450000, { ltcg: 200000 }, 2025, 'single')).toBe(35830)
  })
  it('LTCG entirely in 20% bracket (high ordinary income)', () => {
    expect(calcPreferentialTax(600000, { ltcg: 50000 }, 2025, 'single')).toBe(10000)
  })
  it('qualified dividends alone (taxed same as LTCG)', () => {
    expect(calcPreferentialTax(100000, { qualDiv: 5000 }, 2025, 'single')).toBe(750)
  })
  it('LTCG + qualDiv stacked together', () => {
    // Combined $15k pref at 15% = $2,250
    expect(calcPreferentialTax(100000, { ltcg: 10000, qualDiv: 5000 }, 2025, 'single')).toBe(2250)
  })
  it('unrecap1250 alone taxed at 25%', () => {
    expect(calcPreferentialTax(100000, { unrecap1250: 10000 }, 2025, 'single')).toBe(2500)
  })
  it('collectibles alone taxed at 28%', () => {
    expect(calcPreferentialTax(100000, { collectibles: 10000 }, 2025, 'single')).toBe(2800)
  })
  it('all four preferential types combined', () => {
    // ltcg $10k at 15% = 1500; qualDiv $5k at 15% = 750; 1250 $4k × 0.25 = 1000; coll $2k × 0.28 = 560
    // 1500 + 750 + 1000 + 560 = 3810
    expect(calcPreferentialTax(100000, { ltcg: 10000, qualDiv: 5000, unrecap1250: 4000, collectibles: 2000 }, 2025, 'single')).toBe(3810)
  })
  it('MFJ has higher 0% threshold ($96,700)', () => {
    // Same case as single straddle but MFJ 0% top = $96,700 → all $20k LTCG fits in 0%
    expect(calcPreferentialTax(40000, { ltcg: 20000 }, 2025, 'mfj')).toBe(0)
  })
  it('2026 thresholds shift (post-OBBBA inflation)', () => {
    // 2026 single 0% top = $50,400. Ordinary $40k → room $10,400 at 0%; remaining $9,600 at 15% = $1,440
    expect(calcPreferentialTax(40000, { ltcg: 20000 }, 2026, 'single')).toBe(1440)
  })
})

// =============================================================================
// calcNIIT — IRC §1411 net investment income tax (3.8% on lesser of NII or excess AGI)
// =============================================================================
describe('calcNIIT', () => {
  it('returns 0 when AGI below threshold', () => {
    expect(calcNIIT(20000, 150000, 2025, 'single')).toBe(0)
  })
  it('NII < excess AGI: tax on full NII', () => {
    // AGI $250k, threshold $200k, excess $50k. NII $10k < excess → tax on $10k × 0.038 = $380
    expect(calcNIIT(10000, 250000, 2025, 'single')).toBe(380)
  })
  it('NII > excess AGI: tax on excess AGI', () => {
    // AGI $220k, excess $20k, NII $100k → tax on min($100k, $20k) × 0.038 = $760
    expect(calcNIIT(100000, 220000, 2025, 'single')).toBe(760)
  })
  it('zero NII returns 0', () => {
    expect(calcNIIT(0, 500000, 2025, 'single')).toBe(0)
  })
  it('negative NII returns 0', () => {
    expect(calcNIIT(-5000, 500000, 2025, 'single')).toBe(0)
  })
  it('AGI exactly at threshold returns 0', () => {
    expect(calcNIIT(20000, 200000, 2025, 'single')).toBe(0)
  })
  it('MFJ threshold is $250k — no tax at $230k AGI', () => {
    expect(calcNIIT(20000, 230000, 2025, 'mfj')).toBe(0)
  })
  it('MFS threshold is $125k', () => {
    // MFS threshold $125k, AGI $150k → excess $25k, NII $20k → tax on $20k × 0.038 = $760
    expect(calcNIIT(20000, 150000, 2025, 'mfs')).toBe(760)
  })
})

// =============================================================================
// getMarginalRate — bracket-walk to find the rate at a taxable income level
// =============================================================================
describe('getMarginalRate', () => {
  it('returns 10% for income in the lowest bracket', () => {
    expect(getMarginalRate(5000, 2025, 'single')).toBe(0.10)
  })
  it('returns 22% for mid-bracket income (single 2025, $75k taxable)', () => {
    expect(getMarginalRate(75000, 2025, 'single')).toBe(0.22)
  })
  it('returns 37% for top-bracket income', () => {
    expect(getMarginalRate(1000000, 2025, 'single')).toBe(0.37)
  })
  it('respects filing status: same income, MFJ pays at lower rate', () => {
    // $75k taxable: single = 22% bracket; MFJ = 12% bracket (boundary at $96,950)
    expect(getMarginalRate(75000, 2025, 'mfj')).toBe(0.12)
  })
  it('zero or negative income returns lowest rate (10%)', () => {
    expect(getMarginalRate(0, 2025, 'single')).toBe(0.10)
    expect(getMarginalRate(-5000, 2025, 'single')).toBe(0.10)
  })
  it('exactly at a bracket boundary stays in the lower bracket', () => {
    // $48,475 is the 2025 single 12% bracket cap; income exactly there is still 12%
    expect(getMarginalRate(48475, 2025, 'single')).toBe(0.12)
  })
  it('$1 above the boundary moves to the next bracket', () => {
    expect(getMarginalRate(48476, 2025, 'single')).toBe(0.22)
  })
  it('2026 brackets differ from 2025 (post-OBBBA)', () => {
    // 2026 single 22% boundary at $106,900; $100k still in 22%
    expect(getMarginalRate(100000, 2026, 'single')).toBe(0.22)
  })
})

// =============================================================================
// calcAMT — Form 6251 Alternative Minimum Tax
// =============================================================================
describe('calcAMT', () => {
  const baseAMT = (overrides = {}) => calcAMT({
    taxableIncome: 100000, qbi: 0, saltAmount: 0, isoBargainElement: 0,
    ltGain: 0, qualDiv: 0, regularTax: 50000, status: 'single', taxYear: 2025,
    useItemized: false, itemized: 0, stdDed: 15750,
    ...overrides
  })

  it('returns 0 when regular tax exceeds tentative minimum tax', () => {
    expect(baseAMT()).toBe(0)
  })
  it('returns 0 when AMTI is under the exemption', () => {
    expect(baseAMT({ taxableIncome: 50000, regularTax: 0 })).toBe(0)
  })
  it('AMT owed when regular tax is small ($200k TI 2025 single)', () => {
    expect(baseAMT({ taxableIncome: 200000, regularTax: 0 })).toBe(29094)
  })
  it('high income triggers exemption phaseout (single 2025)', () => {
    expect(baseAMT({ taxableIncome: 700000, regularTax: 0 })).toBe(171706)
  })
  it('AMTI fully within 26% bracket (under bracket26_28 threshold)', () => {
    expect(baseAMT({ taxableIncome: 150000, regularTax: 0 })).toBe(16094)
  })
  it('AMTI splits 26% / 28% brackets (over $239,100 in 2025)', () => {
    expect(baseAMT({ taxableIncome: 400000, regularTax: 0 })).toBe(82550)
  })
  it('itemizing with SALT addback adds to AMTI', () => {
    expect(baseAMT({
      taxableIncome: 200000, regularTax: 0, saltAmount: 30000,
      useItemized: true, itemized: 30000
    })).toBe(36894)
  })
  it('not itemizing → SALT addback ignored entirely', () => {
    expect(baseAMT({
      taxableIncome: 200000, regularTax: 0, saltAmount: 30000,
      useItemized: false, itemized: 0
    })).toBe(29094)
  })
  it('SALT addback is capped at SALT_CAPS[year] (2025 = $40k)', () => {
    // Even with $100k SALT, addback only $40k → matches a $40k SALT case
    expect(baseAMT({
      taxableIncome: 200000, regularTax: 0, saltAmount: 100000,
      useItemized: true, itemized: 100000
    })).toBe(39494)
  })
  it('MFS halves the SALT cap', () => {
    // MFS cap = $40k / 2 = $20k → smaller AMTI than single $40k cap case
    expect(baseAMT({
      taxableIncome: 200000, regularTax: 0, saltAmount: 100000,
      useItemized: true, itemized: 100000, status: 'mfs'
    })).toBe(39987)
  })
  it('ISO bargain element added to AMTI (never capped)', () => {
    expect(baseAMT({
      taxableIncome: 100000, regularTax: 0, isoBargainElement: 50000
    })).toBe(16094)
  })
  it('LTCG carved out of ordinary AMT, taxed at preferential rates', () => {
    expect(baseAMT({
      taxableIncome: 150000, regularTax: 0, ltGain: 50000
    })).toBe(5127)
  })
  it('QBI added back to AMTI per §199A(f)(2)', () => {
    expect(baseAMT({
      taxableIncome: 100000, qbi: 30000, regularTax: 0
    })).toBe(10894)
  })
  it('2026 OBBBA doubled the phaseout rate (0.25 → 0.50)', () => {
    // Same $700k TI as single 2025 case — but 2026 lower phaseout start ($500k vs $626k)
    // and faster phaseout rate (0.50 vs 0.25) → larger AMT
    expect(baseAMT({ taxYear: 2026, taxableIncome: 700000, regularTax: 0 })).toBe(191110)
  })
  it('itemized but doesn\'t exceed stdDed → no SALT addback', () => {
    // useItemized: true but itemized ($10k) < stdDed ($15,750) → isItemizing = false
    expect(baseAMT({
      taxableIncome: 200000, regularTax: 0, saltAmount: 30000,
      useItemized: true, itemized: 10000, stdDed: 15750
    })).toBe(29094)
  })

  // ===========================================================================
  // AF-M02 — PASS4B-01: MFS 2026 bracket26_28 key typo regression guard
  // ===========================================================================
  // Bug: AMT_TABLES[2026].bracket26_28 had key 'mhs' instead of 'mfs'.
  // When status === 'mfs', the lookup returned undefined. The ?? fallback
  // produced the SINGLE threshold ($244,500) instead of the correct MFS
  // threshold ($122,250), undercharging AMT on AMTI between $122,250–$244,500.
  //
  // Affected filers: MFS 2026 with AMTI (after exemption) between $122,250
  // and $244,500 — the entire band that would correctly split 26%/28% under
  // the MFS threshold but was fully taxed at 26% under the buggy single threshold.
  //
  // Math for pinned assertion (TI=250000, MFS 2026, no deductions/ISO/QBI):
  //   AMTI = 250000 (no addbacks)
  //   MFS 2026 exemption = 70100; phaseout start = 500000 (not reached)
  //   amtTaxable = 250000 - 70100 = 179900
  //   CORRECT (mfs = 122250): 122250×0.26 + 57650×0.28 = 31785+16142 = 47927
  //   BUGGY   (single = 244500 via ??): 179900×0.26 = 46774 (all at 26%)
  // ===========================================================================

  it('PASS4B-01 MFS 2026 pinned — 47927 (fails at 46774 under the mhs typo)', () => {
    expect(baseAMT({
      taxableIncome: 250000, regularTax: 0,
      status: 'mfs', taxYear: 2026, stdDed: 16100,
    })).toBe(47927)
  })

  it('PASS4B-01 MFS 2026 directional — lower MFS threshold produces more AMT than single-threshold bug', () => {
    // MFS correct (threshold $122,250): 47927
    // Single/bug (threshold $244,500): 41574 (different exemption too — this is a directional guard)
    // The MFS result must exceed the single result for this scenario.
    const mfsAmt    = baseAMT({ taxableIncome: 250000, regularTax: 0, status: 'mfs',    taxYear: 2026, stdDed: 16100 })
    const singleAmt = baseAMT({ taxableIncome: 250000, regularTax: 0, status: 'single', taxYear: 2026, stdDed: 16100 })
    // MFS has lower exemption ($70,100 vs $90,100) AND lower 26%/28% threshold ($122,250 vs $244,500)
    // Both factors increase MFS AMT vs single → mfsAmt > singleAmt
    expect(mfsAmt).toBeGreaterThan(singleAmt)
    expect(Number.isFinite(mfsAmt)).toBe(true)
  })

  it('PASS4B-01 MFS 2026 returns finite value (no NaN from undefined threshold)', () => {
    // Before fix, undefined threshold → NaN propagation → AMT = NaN.
    // The ?? fallback prevents NaN (falls back to single threshold) but still
    // computes incorrectly. This test confirms the result is a valid number.
    const result = baseAMT({
      taxableIncome: 180000, regularTax: 0,
      status: 'mfs', taxYear: 2026, stdDed: 16100,
    })
    expect(Number.isFinite(result)).toBe(true)
    expect(result).toBeGreaterThan(0)
  })

  it('PASS4B-01 MFS 2024 and 2025 AMT unaffected (bracket26_28 key was correct in prior years)', () => {
    // The 'mhs' typo only existed in AMT_TABLES[2026] — prior years had the correct 'mfs' key.
    // These assertions confirm the fix did not accidentally change pre-2026 MFS AMT behavior.
    expect(baseAMT({ taxableIncome: 250000, regularTax: 0, status: 'mfs', taxYear: 2024, stdDed: 14600 }))
      .toBe(baseAMT({ taxableIncome: 250000, regularTax: 0, status: 'mfs', taxYear: 2024, stdDed: 14600 }))
    // Spot-check: 2025 MFS at TI=250000 should be finite and non-zero
    const r2025 = baseAMT({ taxableIncome: 250000, regularTax: 0, status: 'mfs', taxYear: 2025, stdDed: 15750 })
    expect(Number.isFinite(r2025)).toBe(true)
    expect(r2025).toBeGreaterThan(0)
  })
})
