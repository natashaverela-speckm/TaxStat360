// src/lib/aiAnalysis-record-revenue.test.js
//
// AUDIT (Sep 2026) — recEntityRevenue returned ONE entity's revenue, not the
// record's.
//
// The old implementation preferred rec.biz.grossRevenue whenever it was above
// zero. rec.biz is not a total: AIAnalysis.getRecord() builds it from the single
// "primary" entity it picks for the simulator. So a multi-entity record reported
// whichever entity happened to be primary, and every revenue-gated surface in
// Step 3 read that understated figure.
//
// The symptom was an ABSENCE, which is why it survived a visual pass — no wrong
// number appeared on screen; correct guidance simply never rendered. The §179
// equipment card is gated on revenue > 30,000, so three entities at 15,000 each
// (45,000 in total) produced no card at all.
//
// These tests pin the aggregation and, specifically, the gate the bug suppressed.

import { describe, it, expect } from 'vitest'
import { recEntityRevenue } from './aiAnalysisTaxMath.js'

const ent = (grossRevenue, extra = {}) => ({
  type: 'S Corporation',
  pnl: { grossRevenue, ...extra },
})

// The threshold the §179 equipment card is gated on in AIAnalysis.TaxOptimization.
const SEC179_CARD_GATE = 30000
// The threshold the Risk Scan's depreciation finding is gated on.
const DEPRECIATION_FINDING_GATE = 50000

describe('recEntityRevenue — aggregates across every entity', () => {
  it('sums a multi-entity record instead of reporting the primary entity', () => {
    const rec = {
      // biz mirrors the PRIMARY entity only — this is what the old code returned.
      biz: { grossRevenue: 15000 },
      entities: [ent(15000), ent(15000), ent(15000)],
    }
    expect(recEntityRevenue(rec)).toBe(45000)
  })

  it('is not capped by the biz summary when the summary is smaller', () => {
    const rec = { biz: { grossRevenue: 100000 }, entities: [ent(100000), ent(250000)] }
    expect(recEntityRevenue(rec)).toBe(350000)
  })

  it('handles a single-entity record identically to before', () => {
    const rec = { biz: { grossRevenue: 90000 }, entities: [ent(90000)] }
    expect(recEntityRevenue(rec)).toBe(90000)
  })

  it('ignores entities that carry no revenue rather than treating them as gaps', () => {
    const rec = { biz: { grossRevenue: 40000 }, entities: [ent(40000), ent(0), ent(undefined)] }
    expect(recEntityRevenue(rec)).toBe(40000)
  })
})

describe('recEntityRevenue — falls back to the biz summary', () => {
  it('uses biz for a legacy record saved before the entities array existed', () => {
    expect(recEntityRevenue({ biz: { grossRevenue: 120000 } })).toBe(120000)
  })

  it('uses biz when the entities exist but carry no revenue', () => {
    const rec = { biz: { grossRevenue: 75000 }, entities: [ent(0), ent(null)] }
    expect(recEntityRevenue(rec)).toBe(75000)
  })

  it('returns 0 rather than NaN for an empty or malformed record', () => {
    expect(recEntityRevenue(null)).toBe(0)
    expect(recEntityRevenue(undefined)).toBe(0)
    expect(recEntityRevenue({})).toBe(0)
    expect(recEntityRevenue({ entities: 'not-an-array' })).toBe(0)
    expect(recEntityRevenue({ entities: [null, undefined, {}] })).toBe(0)
  })

  it('coerces string revenue the way the rest of the app does', () => {
    const rec = { entities: [ent('20000'), ent('25000')] }
    expect(recEntityRevenue(rec)).toBe(45000)
  })
})

describe('the gates the bug suppressed', () => {
  // This is the regression that matters: not the number, but the guidance.
  const threeEntities = {
    biz: { grossRevenue: 15000 },
    entities: [ent(15000), ent(15000), ent(15000)],
  }

  it('a 45,000 record now clears the §179 equipment card gate', () => {
    expect(recEntityRevenue(threeEntities)).toBeGreaterThan(SEC179_CARD_GATE)
  })

  it('the old primary-entity-only behaviour would NOT have cleared it', () => {
    // Pinning the defect explicitly so a future "optimisation" back to
    // rec.biz.grossRevenue fails here with an explanation attached.
    expect(nfLike(threeEntities.biz.grossRevenue)).toBeLessThan(SEC179_CARD_GATE)
  })

  it('a 60,000 three-entity record clears the depreciation finding gate', () => {
    const rec = { biz: { grossRevenue: 20000 }, entities: [ent(20000), ent(20000), ent(20000)] }
    expect(recEntityRevenue(rec)).toBeGreaterThan(DEPRECIATION_FINDING_GATE)
    expect(nfLike(rec.biz.grossRevenue)).toBeLessThan(DEPRECIATION_FINDING_GATE)
  })
})

function nfLike(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
