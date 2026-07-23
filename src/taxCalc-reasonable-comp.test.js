// src/taxCalc-reasonable-comp.test.js
//
// D-10 (dead-code & duplication audit, Jul 2026) — the S-Corp reasonable-
// compensation numeric rule, extracted from two divergent copies (engine +
// Dashboard scenario card) into calcReasonableCompCore().
//
// Labels per ARCHITECTURE §6. Every CHAR expectation was hand-computed by
// executing the ORIGINAL inline formulas (both copies agreed on the numbers;
// only their message wording differed — see OBS-7).

import { describe, it, expect } from 'vitest'
import { calcReasonableCompCore, calcTaxReturn } from './lib/taxCalc.js'
import { SCORP_REASONABLE_COMP_RATIO_THRESHOLD, SCORP_REASONABLE_COMP_MIN_TOTAL, CURRENT_TAX_YEAR } from './lib/constants.js'

describe('calcReasonableCompCore — numeric rule', () => {

  it('CHAR: below the $20,000 total-comp floor → not applicable, never triggers', () => {
    // Original: totalComp < 20000 → { triggered:false, ratio:100 } on both surfaces
    const r = calcReasonableCompCore(5000, 14999)   // total 19,999
    expect(r.applicable).toBe(false)
    expect(r.triggered).toBe(false)
    expect(r.ratioPct).toBe(100)
  })

  it('CHAR: exactly at the floor → applicable (strict less-than in the original)', () => {
    const r = calcReasonableCompCore(8000, 12000)   // total 20,000
    expect(r.applicable).toBe(true)
    expect(r.ratioPct).toBe(40)                     // 8000/20000
  })

  it('CHAR: ratio below threshold triggers — 30% salary share', () => {
    // sal 30,000 / total 100,000 → ratio 0.30 < 0.40 → triggered, ratioPct 30
    const r = calcReasonableCompCore(30000, 70000)
    expect(r.triggered).toBe(true)
    expect(r.ratioPct).toBe(30)
  })

  it('CHAR: ratio at the threshold does NOT trigger (strict less-than)', () => {
    // sal 40,000 / total 100,000 → ratio exactly 0.40 → NOT < 0.40
    const r = calcReasonableCompCore(40000, 60000)
    expect(r.triggered).toBe(false)
    expect(r.ratio).toBeCloseTo(SCORP_REASONABLE_COMP_RATIO_THRESHOLD, 10)
  })

  it('CHAR: negative distributions are clamped to zero before the ratio', () => {
    // Both originals did Math.max(0, k1): sal 25,000, k1 −50,000 → total 25,000,
    // ratio 1.0 → not triggered
    const r = calcReasonableCompCore(25000, -50000)
    expect(r.applicable).toBe(true)
    expect(r.triggered).toBe(false)
    expect(r.ratioPct).toBe(100)
  })

  it('CHAR: zero salary with large distributions → 0% ratio, triggered', () => {
    const r = calcReasonableCompCore(0, 200000)
    expect(r.triggered).toBe(true)
    expect(r.ratioPct).toBe(0)
  })

  it('SPEC-note: the threshold is a heuristic, not a statutory figure (Treas. Reg. §1.162-7 facts-and-circumstances; Watson v. Commissioner, 668 F.3d 1008) — constants stay wired', () => {
    // Guards the constants relationship rather than a legal value: the floor and
    // threshold the core consumes are the exported constants, not re-inlined.
    expect(SCORP_REASONABLE_COMP_MIN_TOTAL).toBe(20000)
    expect(SCORP_REASONABLE_COMP_RATIO_THRESHOLD).toBe(0.40)
  })
})

describe('engine reasonableCompAlert — unchanged behavior through the extraction', () => {

  const base = {
    taxYear: CURRENT_TAX_YEAR, status: 'single', w2: 0, k1Total: 0,
  }

  it('CHAR: S-Corp with 25% salary share triggers the filed-return alert', () => {
    const r = calcTaxReturn({
      ...base,
      k1Total: 75000,
      entities: [{ type: 'S Corp', own: '100', pnl: { officerSalary: '25000', netProfit: '75000' } }],
    })
    expect(r.reasonableCompAlert.triggered).toBe(true)
    expect(r.reasonableCompAlert.ratio).toBe(25)
    expect(r.reasonableCompAlert.message).toContain('informational flag')
  })

  it('CHAR: no S-Corp entity → silent alert object', () => {
    const r = calcTaxReturn({
      ...base,
      entities: [{ type: 'Partnership / LLC', own: '100', pnl: { netProfit: '90000' } }],
      k1Total: 90000,
    })
    expect(r.reasonableCompAlert).toEqual({ triggered: false, ratio: 100, message: '' })
  })
})
