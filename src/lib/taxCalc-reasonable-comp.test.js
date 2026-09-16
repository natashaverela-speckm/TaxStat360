// src/taxCalc-reasonable-comp.test.js
//
// D-10 (dead-code & duplication audit, Jul 2026) — the S-Corp reasonable-
// compensation numeric rule, extracted from two divergent copies (engine +
// Dashboard scenario card) into calcReasonableCompCore().
//
// Labels per ARCHITECTURE §6. Every CHAR expectation was hand-computed by
// executing the ORIGINAL inline formulas (both copies agreed on the numbers;
// only their message wording differed — see OBS-7).

//
// Consistency-audit follow-up (Aug 2026): 1 of 9 tests (plus a non-standard `SPEC-note:` prefix normalized to `CHAR:` — it guarded a constants-wiring relationship, not an independently-verified statutory figure, so SPEC was the wrong label) in this file were still
// unlabeled — the ARCHITECTURE §6 tail left over from the Aug 2026 Module C
// backfill (that pass covered the 8 fully-unlabeled taxCalc-* files; this one
// was already mostly labeled, so it wasn't in scope for that batch). Now fully
// CHAR: labeled. None promoted to SPEC — that requires independently
// re-verifying each expected value against its cited authority.

import { describe, it, expect } from 'vitest'
import { calcReasonableCompCore, calcTaxReturn } from './taxCalc.js'
import { SCORP_REASONABLE_COMP_RATIO_THRESHOLD, SCORP_REASONABLE_COMP_MIN_TOTAL, CURRENT_TAX_YEAR } from './constants.js'

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

  it('CHAR: the threshold is a heuristic, not a statutory figure (Treas. Reg. §1.162-7 facts-and-circumstances; David E. Watson, P.C. v. United States, 668 F.3d 1008) — constants stay wired', () => {
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
    // FRESH-EYES S-4c (11 Sep 2026): entityName/triggeredCount added by the
    // multi-entity fix below. The three pre-existing keys are unchanged — this
    // toEqual is widened to the new shape, not loosened to a partial match, so it
    // still fails if triggered/ratio/message ever drift.
    expect(r.reasonableCompAlert).toEqual({ triggered: false, ratio: 100, message: '', entityName: '', triggeredCount: 0 })
  })
})

// ── FRESH-EYES S-4c (11 Sep 2026) — multi-entity reasonable comp ─────────────
// The alert used entities.find(...) — the FIRST S-Corp only. Professional covers
// 3 businesses and Enterprise is unlimited and sells a consolidated view, so a
// second S-Corp taking $0 salary against six figures of distributions was
// invisible to every surface in the app. These pin the worst-ratio selection.
//
// CHAR, not SPEC: the 40% threshold is a practitioner heuristic, not a statutory
// figure (Treas. Reg. §1.162-7 is a facts-and-circumstances test with no
// safe harbor), so these characterize the selection logic, not a tax result.
describe('engine reasonableCompAlert — multiple S-Corps (S-4c)', () => {

  const base = { taxYear: CURRENT_TAX_YEAR, status: 'single', w2: 0, k1Total: 0 }

  it('CHAR: reports the WORST S-Corp, not the first — a compliant first entity no longer masks a $0-salary second', () => {
    const r = calcTaxReturn({
      ...base,
      k1Total: 150000,
      entities: [
        // 60% salary share — comfortably above the heuristic, and listed first.
        { type: 'S Corp', name: 'Alpha Consulting', own: '100', pnl: { officerSalary: '90000', netProfit: '60000' } },
        // $0 salary against $90k of distributions — the position at issue.
        { type: 'S Corp', name: 'Beta Holdings',    own: '100', pnl: { officerSalary: '0',     netProfit: '90000' } },
      ],
    })
    expect(r.reasonableCompAlert.triggered).toBe(true)
    expect(r.reasonableCompAlert.ratio).toBe(0)
    expect(r.reasonableCompAlert.entityName).toBe('Beta Holdings')
    expect(r.reasonableCompAlert.triggeredCount).toBe(1)
    // Pre-fix this returned the FIRST entity: triggered false, ratio 60.
  })

  it('CHAR: counts every triggering S-Corp, and still names the worst', () => {
    const r = calcTaxReturn({
      ...base,
      k1Total: 200000,
      entities: [
        { type: 'S Corp', name: 'One',   own: '100', pnl: { officerSalary: '30000', netProfit: '70000' } }, // 30%
        { type: 'S Corp', name: 'Two',   own: '100', pnl: { officerSalary: '10000', netProfit: '90000' } }, // 10%
        { type: 'S Corp', name: 'Three', own: '100', pnl: { officerSalary: '80000', netProfit: '40000' } }, // 66%
      ],
    })
    expect(r.reasonableCompAlert.triggered).toBe(true)
    expect(r.reasonableCompAlert.ratio).toBe(10)
    expect(r.reasonableCompAlert.entityName).toBe('Two')
    expect(r.reasonableCompAlert.triggeredCount).toBe(2)
  })

  it('CHAR: a single S-Corp return is byte-identical to the pre-fix output apart from the two additive keys', () => {
    const entities = [{ type: 'S Corp', own: '100', pnl: { officerSalary: '25000', netProfit: '75000' } }]
    const r = calcTaxReturn({ ...base, k1Total: 75000, entities })
    expect(r.reasonableCompAlert.triggered).toBe(true)
    expect(r.reasonableCompAlert.ratio).toBe(25)
    expect(r.reasonableCompAlert.message).toContain('informational flag')
    expect(r.reasonableCompAlert.triggeredCount).toBe(1)
    // No name on the fixture → the 'Entity' fallback, never undefined.
    expect(r.reasonableCompAlert.entityName).toBe('Entity')
  })

  it('CHAR: entityName is empty when nothing triggers, so no surface can print a name beside a clean result', () => {
    const r = calcTaxReturn({
      ...base,
      k1Total: 60000,
      entities: [
        { type: 'S Corp', name: 'Alpha', own: '100', pnl: { officerSalary: '60000', netProfit: '40000' } },
        { type: 'S Corp', name: 'Beta',  own: '100', pnl: { officerSalary: '50000', netProfit: '20000' } },
      ],
    })
    expect(r.reasonableCompAlert.triggered).toBe(false)
    expect(r.reasonableCompAlert.entityName).toBe('')
    expect(r.reasonableCompAlert.triggeredCount).toBe(0)
  })

  it('CHAR: S-Corps below the $20k noise gate stay silent even in a multi-entity return', () => {
    const r = calcTaxReturn({
      ...base,
      k1Total: 9000,
      entities: [
        { type: 'S Corp', name: 'Tiny One', own: '100', pnl: { officerSalary: '0', netProfit: '5000' } },
        { type: 'S Corp', name: 'Tiny Two', own: '100', pnl: { officerSalary: '0', netProfit: '4000' } },
      ],
    })
    expect(r.reasonableCompAlert).toEqual({ triggered: false, ratio: 100, message: '', entityName: '', triggeredCount: 0 })
  })
})
