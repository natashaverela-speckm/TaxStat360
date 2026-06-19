// @vitest-environment jsdom
//
// Storage consolidation guard: §469(c)(7)(B) REP hours must live ONLY on the rental
// entities (entity.repHoursRE / entity.repHoursTotal). The legacy personal-context copy
// (the old F-11 repHoursRE / repHoursTotal in ts360_f1040) was retired so no future
// code can read a stale copy and gate the REP aggregation differently from the filed
// return. These tests fail if either field is ever re-introduced into personal context.
import { describe, it, expect, beforeEach } from 'vitest'
import { writePersonalContext, readPersonalContext, normalizeF1040 } from './sessionState.js'

describe('sessionState — legacy personal-context REP hours are retired', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('readPersonalContext does not expose repHoursRE / repHoursTotal', () => {
    writePersonalContext({ isREP: true })
    const ctx = readPersonalContext()
    expect('repHoursRE' in ctx).toBe(false)
    expect('repHoursTotal' in ctx).toBe(false)
    // A normal personal-context field still round-trips (harness sanity check).
    expect(ctx.isREP).toBe(true)
  })

  it('writePersonalContext does not serialize hours even if passed extraneously', () => {
    writePersonalContext({ isREP: true, repHoursRE: 800, repHoursTotal: 3000 })
    const raw = JSON.parse(sessionStorage.getItem('ts360_f1040'))
    expect('repHoursRE' in raw).toBe(false)
    expect('repHoursTotal' in raw).toBe(false)
  })

  it('a stale blob that still contains hours does not surface them on read', () => {
    // Simulate pre-consolidation sessionStorage written by an older build.
    sessionStorage.setItem('ts360_f1040', JSON.stringify({
      filingStatus: 'single', isREP: true, repHoursRE: 800, repHoursTotal: 3000,
    }))
    const ctx = readPersonalContext()
    expect('repHoursRE' in ctx).toBe(false)
    expect('repHoursTotal' in ctx).toBe(false)
  })

  it('normalizeF1040 does not carry hours either', () => {
    const out = normalizeF1040({ isREP: true, repHoursRE: 800, repHoursTotal: 3000 })
    expect('repHoursRE' in out).toBe(false)
    expect('repHoursTotal' in out).toBe(false)
  })
})
