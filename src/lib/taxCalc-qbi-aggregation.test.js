// src/taxCalc-qbi-aggregation.test.js
//
// F6 (independent audit, Jul 2026) — §199A AGGREGATION IS OPT-IN (Reg. §1.199A-4).
//
// The app previously POOLED W-2 wages across all entities automatically above the
// threshold, which can OVERSTATE the deduction when a wage-paying entity subsidizes a
// zero-wage entity. Aggregation actually requires an affirmative, consistent election
// on Form 8995-A, Sch. B. The engine now defaults to PER-BUSINESS wage limits and pools
// only when electQbiAggregation is set.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

const base = { filingStatus: 'mfj', year: 2026, w2: 0 }
// Above the ceiling: a wage-paying S-corp + a zero-wage partnership, equal QBI.
const entities = [
  { type: 'S Corporation',    own: 100, k1: 400000, box17V_wages: 200000 },
  { type: 'Partnership / LLC', own: 100, k1: 400000, box17V_wages: 0 },
]
const def = calcTaxReturn({ ...base, k1Total: 800000, entities })
const agg = calcTaxReturn({ ...base, k1Total: 800000, entities, electQbiAggregation: true })

describe('F6 — §199A aggregation opt-in', () => {
  it('defaults to per-business (no election assumed)', () => {
    expect(def.qbiAggregationApplied).toBe(false)
    expect(def.qbi).toBe(78320)   // S-corp QBI-bound; zero-wage partnership contributes $0
  })

  it('electing aggregation pools W-2 wages across entities', () => {
    expect(agg.qbiAggregationApplied).toBe(true)
    expect(agg.qbi).toBe(100000)  // 50% × $200k pooled wages
  })

  it('the default never exceeds the elected (aggregation can only help)', () => {
    expect(def.qbi).toBeLessThan(agg.qbi)
  })

  it('single entity: election makes no difference (nothing to aggregate)', () => {
    const one = [{ type: 'S Corporation', own: 100, k1: 400000, box17V_wages: 200000 }]
    const s1 = calcTaxReturn({ ...base, k1Total: 400000, entities: one })
    const s2 = calcTaxReturn({ ...base, k1Total: 400000, entities: one, electQbiAggregation: true })
    expect(s1.qbi).toBe(s2.qbi)
  })
})
