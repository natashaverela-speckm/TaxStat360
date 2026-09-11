// src/lib/taxCalc-scorp-basis-audit.test.js
//
// S-CORP BASIS AUDIT (11 Sep 2026). Third live-scenario pass, after the personal-1040 and
// C-Corp passes. Nine shareholder-basis fact patterns computed by hand from §1366(d),
// §1367, §1368 and Reg. §1.1367-1(f) (income up, distributions down, then losses), then
// compared to the engine and, for the defect, to the production site.
//
// Seven of nine matched to the dollar. The two that did not share one cause: the
// §1366(d)(2) carryover release measured "beginning stock basis + income" and ignored the
// year's distributions and a fully-allowed current-year loss, so it released more prior
// loss than the shareholder had basis for. Fixed in calcTaxReturn; pinned here.
//
// Test labels (ARCHITECTURE §6): SPEC — verified against the cited authority.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

const sc  = (k1, extra) => ({ type: 'S Corporation', own: 100, k1, box17V_wages: 0, box17V_ubia: 0, ...extra })
const run = (k1, entity, personal) => calcTaxReturn({
  taxYear: 2025, status: 'single', k1Total: k1, entities: [sc(k1, entity)], assumeZeroBasisOnLoss: true, ...personal,
})

describe('§1367 / §1368 ordering — income raises basis, distributions reduce it, losses come last', () => {
  it('SPEC: stock basis 50,000 · K-1 +80,000 · distributions 100,000 — no gain, 18,827', () => {
    // Basis for distributions 130,000 (Reg. §1.1367-1(f): income first); 100,000 comes out tax-free.
    // W-2 60,000 + K-1 80,000 = AGI 140,000; QBI 16,000; taxable 108,250 → 18,827.
    const r = run(80000, { stockBasis: '50000', distributions: '100000' }, { w2: 60000 })
    expect(r.distributionCapGain).toBe(0)
    expect(r.qbi).toBe(16000)
    expect(r.totalTax).toBe(18827)
  })

  it('SPEC: distribution in excess of basis is §1368(b)(2) capital gain — 14,429', () => {
    // Basis 20,000 + 30,000 income = 50,000; 80,000 distributed → 30,000 gain. AGI 120,000;
    // QBI 6,000 (income limit 20% × (104,250 − 30,000) does not bind); ordinary 68,250 → 9,929; 30,000 × 15% = 4,500.
    const r = run(30000, { stockBasis: '20000', distributions: '80000' }, { w2: 60000 })
    expect(r.distributionCapGain).toBe(30000)
    expect(r.agi).toBe(120000)
    expect(r.totalTax).toBe(14429)
  })

  it('SPEC: §1366(d)(1) — loss limited to stock basis plus debt basis; the rest is suspended', () => {
    // Stock 10,000 + debt 15,000 = 25,000 of a 40,000 loss allowed; 15,000 suspended. AGI 75,000 → 7,949.
    const r = run(-40000, { stockBasis: '10000', debtBasis: '15000' }, { w2: 100000 })
    expect(r.entityBasisResults[0].k1Allowed).toBe(-25000)
    expect(r.entityBasisResults[0].suspended).toBe(15000)
    expect(r.totalSuspendedLoss).toBe(15000)
    expect(r.agi).toBe(75000)
    expect(r.totalTax).toBe(7949)
  })

  it('SPEC: distributions reduce basis BEFORE the loss is tested (Reg. §1.1368-1(e)) — 11,249', () => {
    // Stock 60,000; a 30,000 loss never raises basis; 50,000 distributed leaves 10,000; only 10,000 of loss
    // allowed, 20,000 suspended, no distribution gain. AGI 90,000 → 11,249.
    const r = run(-30000, { stockBasis: '60000', distributions: '50000' }, { w2: 100000 })
    expect(r.distributionCapGain).toBe(0)
    expect(r.entityBasisResults[0].k1Allowed).toBe(-10000)
    expect(r.entityBasisResults[0].suspended).toBe(20000)
    expect(r.totalTax).toBe(11249)
  })

  it('SPEC: §1368(c) with accumulated E&P — AAA first, then dividends to the extent of E&P, then §1368(b) again', () => {
    // Stock 30,000; AAA 20,000 + 10,000 income = 30,000 (tier 1, basis → 10,000); E&P dividend 15,000 (tier 2,
    // qualified, basis untouched); tier 3 15,000 takes the last 10,000 of basis and 5,000 is gain.
    // AGI 80,000 + 10,000 + 15,000 + 5,000 = 110,000; QBI 2,000; taxable 92,250; 20,000 pref × 15%; total 13,809.
    const r = run(10000, { stockBasis: '30000', beginningAAA: '20000', accumulatedEP: '15000', distributions: '60000' }, { w2: 80000 })
    expect(r.entityBasisResults[0].epDividend).toBe(15000)
    expect(r.distributionCapGain).toBe(5000)
    expect(r.agi).toBe(110000)
    expect(r.totalTax).toBe(13809)
  })

  it('SPEC: no basis entered — the conservative default suspends the whole loss', () => {
    const r = run(-40000, {}, { w2: 100000 })
    expect(r.entityBasisResults[0].basisAssumedZero).toBe(true)
    expect(r.totalSuspendedLoss).toBe(40000)
    expect(r.agi).toBe(100000)
  })
})

describe('§1366(d)(2) carryover — released only against the basis left after the current year', () => {
  it('SPEC: carryover alone, no current activity — released up to basis', () => {
    // Stock 25,000; carryover 40,000 → 25,000 released, 15,000 carries again. AGI 75,000 → 7,949.
    const r = run(0, { stockBasis: '25000' }, { w2: 100000, priorSuspendedLoss: 40000 })
    expect(r.priorSuspendedLossApplied).toBe(25000)
    expect(r.priorSuspendedLossRemaining).toBe(15000)
    expect(r.totalTax).toBe(7949)
  })

  it('SPEC: a fully-allowed current loss consumes basis first — the live-site case, 15,649 not 9,049', () => {
    // Stock 40,000; current loss 30,000 allowed in full leaves 10,000; carryover 50,000 → 10,000 released, 40,000 remains.
    // AGI 150,000 − 30,000 − 10,000 = 110,000; taxable 94,250 → 15,649. The site released 40,000 (AGI 80,000, tax 9,049).
    const r = run(-30000, { stockBasis: '40000' }, { w2: 150000, priorSuspendedLoss: 50000 })
    expect(r.entityBasisResults[0].suspended).toBe(0)
    expect(r.priorSuspendedLossApplied).toBe(10000)
    expect(r.priorSuspendedLossRemaining).toBe(40000)
    expect(r.agi).toBe(110000)
    expect(r.totalTax).toBe(15649)
  })

  it('SPEC: distributions in an income year reduce the basis available to the carryover', () => {
    // Stock 50,000 + income 20,000 − distributions 60,000 = 10,000; carryover 40,000 → 10,000 released.
    // AGI 100,000 + 20,000 − 10,000 = 110,000 → 14,769 (QBI 4,000 on the current-year income).
    const r = run(20000, { stockBasis: '50000', distributions: '60000' }, { w2: 100000, priorSuspendedLoss: 40000 })
    expect(r.priorSuspendedLossApplied).toBe(10000)
    expect(r.priorSuspendedLossRemaining).toBe(30000)
    expect(r.agi).toBe(110000)
    expect(r.totalTax).toBe(14769)
  })

  it('SPEC: when the current loss already exhausts basis, nothing is released', () => {
    const r = run(-40000, { stockBasis: '10000', debtBasis: '15000' }, { w2: 100000, priorSuspendedLoss: 20000 })
    expect(r.priorSuspendedLossApplied).toBe(0)
    expect(r.priorSuspendedLossRemaining).toBe(20000)
    expect(r.agi).toBe(75000)
  })
})
