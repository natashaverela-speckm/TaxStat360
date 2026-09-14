// src/lib/taxCalc-se-wage-base-mfj-attribution.test.js
//
// FOURTH READ R-2 (14 Sep 2026) — MFJ Schedule SE wage-base coordination via spouse
// attribution (`w2OwnForSE`).
//
// Test labels (ARCHITECTURE §6): SPEC = hand-computed from the statute before the engine
// was run; CHAR = freezes current behavior.
//
// Background. LIMITATION SE-MFJ-WAGEBASE: `w2` is the household's combined W-2 figure and
// Schedule SE is filed per spouse (IRC §1402(b)), so the engine refused to net ANY W-2
// against the wage base on a joint return. Exact for a dual-earner household; overstated
// SE tax for a single business owner filing jointly who also has a day job — verified live
// 14 Sep 2026: MFJ W-2 $200,000 + $80,000 partnership SE income showed $11,304 of SE tax
// where single / HOH / QSS with identical inputs showed $2,143.
//
// The fix adds `w2OwnForSE`: the portion of `w2` earned by the self-employed spouse. The
// engine nets that amount (clamped to `w2`) against the Social Security wage base for MFJ.
// Blank / 0 reproduces the conservative uncoordinated computation byte-for-byte.
//
// Arithmetic (2025 tables: SS wage base $176,100):
//   SE earnings subject = $80,000 × 0.9235 = $73,880
//   uncoordinated       = 73,880 × 12.4% + 73,880 × 2.9% = 9,161.12 + 2,142.52 = $11,303.64 → $11,304
//   own W-2 $200,000    → room max(0, 176,100 − 200,000) = 0 → SE = 2,142.52 → $2,143
//   own W-2 $150,000    → room 26,100 → 26,100 × 12.4% + 2,142.52 = 3,236.40 + 2,142.52 = $5,378.92 → $5,379

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

const partner = (k1) => ({ type: 'Partnership / LLC', own: 100, k1 })
const run = (overrides = {}) => calcTaxReturn({
  taxYear: 2025, status: 'mfj', dependents: 0,
  w2: 200000, k1Total: 80000, entities: [partner(80000)],
  ...overrides,
})

describe('R-2 — MFJ Schedule SE coordination on the attributed W-2 (IRC §1402(b))', () => {

  it('SPEC: blank attribution keeps the conservative uncoordinated figure — SE tax 11,304 (LIMITATION SE-MFJ-WAGEBASE, unchanged default)', () => {
    const r = run()
    expect(r.seTax).toBe(11304)
    expect(r.seWageBaseW2).toBe(0)
    expect(r.ssWageBaseRoom).toBe(176100)
  })

  it('SPEC: attributing the whole $200,000 W-2 to the self-employed spouse zeroes the OASDI room — SE tax 2,143, identical to the single-filer figure', () => {
    const mfj = run({ w2OwnForSE: 200000 })
    const single = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 200000, k1Total: 80000, entities: [partner(80000)] })
    expect(mfj.seTax).toBe(2143)
    expect(mfj.seTax).toBe(single.seTax)
    expect(mfj.ssWageBaseRoom).toBe(0)
    expect(mfj.seWageBaseW2).toBe(200000)
  })

  it('SPEC: partial attribution — own W-2 150,000 of a 200,000 household total → room 26,100 → SE tax 5,379', () => {
    const r = run({ w2OwnForSE: 150000 })
    expect(r.ssWageBaseRoom).toBe(26100)
    expect(r.seTax).toBe(5379)
  })

  it('CHAR: attribution is clamped to the household W-2 total (cannot exceed w2)', () => {
    const r = run({ w2OwnForSE: 500000 })
    expect(r.w2OwnForSE).toBe(200000)
    expect(r.seWageBaseW2).toBe(200000)
    expect(r.seTax).toBe(2143)
  })

  it('CHAR: negative / garbage attribution is treated as 0', () => {
    expect(run({ w2OwnForSE: -5000 }).seTax).toBe(11304)
    expect(run({ w2OwnForSE: 'abc' }).seTax).toBe(11304)
  })

  it('SPEC: one-person returns ignore the field — single / HOH / QSS / MFS coordinate on the whole W-2 regardless', () => {
    for (const status of ['single', 'hoh', 'qss', 'mfs']) {
      const a = calcTaxReturn({ taxYear: 2025, status, w2: 200000, k1Total: 80000, entities: [partner(80000)] })
      const b = calcTaxReturn({ taxYear: 2025, status, w2: 200000, k1Total: 80000, entities: [partner(80000)], w2OwnForSE: 50000 })
      expect(a.seTax).toBe(2143)
      expect(b.seTax).toBe(2143)
      expect(b.seWageBaseW2).toBe(200000)
    }
  })

  it('SPEC: Additional Medicare Tax is unaffected — the MFJ threshold is a household figure (§3101(b)(2)(A)): 0.9% × (200,000 + 73,880 − 250,000) = 215 either way', () => {
    expect(run().additionalMedicare).toBe(215)
    expect(run({ w2OwnForSE: 200000 }).additionalMedicare).toBe(215)
  })

  it('SPEC: the attributed W-2 also nets an S-Corp officer salary that is part of w2 — MFJ, officer W-2 100,000 + other W-2 100,000 all the owner\'s, Sch C 80,000 → room 0 → SE tax 2,143', () => {
    const r = calcTaxReturn({
      taxYear: 2025, status: 'mfj',
      w2: 200000,               // TaxReturn.jsx: w2Total = other W-2 100,000 + officer W-2 100,000
      w2OwnForSE: 200000,
      k1Total: 80000 + 40000,
      entities: [
        { type: 'S Corporation', own: 100, k1: 40000, officerW2: 100000 },
        { type: 'Sole Proprietor / SMLLC', own: 100, k1: 80000 },
      ],
    })
    expect(r.seNetIncome).toBe(80000)
    expect(r.seTax).toBe(2143)
  })

  it('CHAR: 2026 tables — wage base 184,500; own W-2 184,500 → room 0; own W-2 100,000 → room 84,500', () => {
    const a = run({ taxYear: 2026, w2OwnForSE: 184500 })
    const b = run({ taxYear: 2026, w2OwnForSE: 100000 })
    expect(a.ssWageBaseRoom).toBe(0)
    expect(b.ssWageBaseRoom).toBe(84500)
    // 73,880 × 12.4% = 9,161.12 (all within the 84,500 room) + 2,142.52 = 11,303.64 → 11,304
    expect(b.seTax).toBe(11304)
  })
})
