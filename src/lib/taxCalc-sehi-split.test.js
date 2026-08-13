// B4 (Audit Synthesis, Phase 2, Aug 2026) — split SEHI entry into an S-corp leg and an
// "other business" leg (`selfEmpHealthInsScorp` / `selfEmpHealthInsOther`) so a taxpayer
// with BOTH an S-corp and independent SE-earned income (the SEHI-MIXED-SOURCE case) can
// tell TaxStat360 exactly which business paid the premium, instead of relying on the
// approximate combined-field heuristic. See KNOWN_LIMITATIONS.md -> SEHI-MIXED-SOURCE
// ("RESOLVED for split-entry filers — Aug 12 2026").
//
// This file is the SPEC test suite for `sehiSplitEngaged` and the split-aware SEHI
// formulas in taxCalc.js. Values are either hand-computed from the statute (per-leg
// capping is deterministic once the leg's own cap base is known) or read from the
// engine's own PRE-EXISTING (unrelated, already-tested) `sehiLimit` output to derive
// the other business's earned-income capacity without hand-computing SE tax — see the
// comment on `otherLegCapacityProbe` below.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'
import { CURRENT_TAX_YEAR } from './constants.js'

const scorp = (over = {}) => ({
  name: 'SC', type: 'S Corporation', own: '100',
  officerW2: '', k1: '',
  ...over,
})
const soleProp = (over = {}) => ({
  name: 'SP', type: 'Sole Proprietor / SMLLC', own: '100', k1: '',
  ...over,
})

const run = (entities, extra = {}) => calcTaxReturn({
  taxYear: CURRENT_TAX_YEAR, status: 'single', dependents: 0,
  entities, w2: 0, k1Total: 0, w2Withheld: 0, estPaid: 0,
  ...extra,
})

// Standard mixed-source household reused across this file: S-corp with a $10,000
// officer wage base, plus a separate sole prop with substantial ($100,000) net profit —
// the same fixture used by the pre-existing SEHI-MIXED-SOURCE test in
// taxCalc-sehi-scorp-grossup.test.js, so results are directly comparable.
const mixedEntities = () => [
  scorp({ officerW2: '10000', k1: '90000' }),
  soleProp({ k1: '100000' }),
]
const mixedBase = { w2: 10000, k1Total: 190000 }

describe('B4 — sehiSplitEngaged detection', () => {
  it('SPEC: false when both split fields are zero/omitted', () => {
    const r = run(mixedEntities(), { ...mixedBase, selfEmpHealthIns: 12000 })
    expect(r.sehiSplitEngaged).toBe(false)
  })
  it('SPEC: true when only the S-corp leg is entered', () => {
    const r = run(mixedEntities(), { ...mixedBase, selfEmpHealthInsScorp: 5000 })
    expect(r.sehiSplitEngaged).toBe(true)
  })
  it('SPEC: true when only the other-business leg is entered', () => {
    const r = run(mixedEntities(), { ...mixedBase, selfEmpHealthInsOther: 500 })
    expect(r.sehiSplitEngaged).toBe(true)
  })
})

describe('B4 — backward compatibility (split fields blank)', () => {
  it('CHAR: pins the exact pre-B4 combined-field mixed-source behavior when split fields are left blank', () => {
    // Identical fixture/entry to the pre-existing "KNOWN_LIMITATIONS.md SEHI-MIXED-SOURCE"
    // test in taxCalc-sehi-scorp-grossup.test.js — asserting the SAME numbers confirms B4
    // introduced no change in behavior for records that don't use the new fields.
    const r = run(mixedEntities(), { ...mixedBase, selfEmpHealthIns: 12000 })
    expect(r.sehiSplitEngaged).toBe(false)
    expect(r.selfEmpHealthDed).toBe(12000)
    expect(r.sehiClamped).toBe(false)
    expect(r.sehiScorpWageGrossUp).toBe(10000)
    expect(r.sehiMixedSourceFallback).toBe(true)
    expect(r.scorpSEHIQbiReduction).toBe(0)
    expect(r.sehiUnambiguousForQBI).toBe(false)
  })

  it('CHAR: single-source (S-corp only) records are unaffected by B4 — split leg fields stay at 0', () => {
    const r = run([scorp({ officerW2: '80000', k1: '240000' })], { w2: 80000, k1Total: 240000, selfEmpHealthIns: 120000 })
    expect(r.sehiSplitEngaged).toBe(false)
    expect(r.selfEmpHealthDed).toBe(80000)
    expect(r.sehiScorpWageGrossUp).toBe(120000)
    expect(r.sehiScorpLegDed).toBe(0)
    expect(r.sehiOtherLegDed).toBe(0)
  })
})

describe('B4 — independent per-leg §162(l)(2)(A) capping (the core fix)', () => {
  it('SPEC: each leg is capped against its OWN earned-income base, not pooled — an over-cap S-corp entry does not borrow room from the other leg', () => {
    // Probe run (no SEHI at all) to read the engine's own pre-existing `sehiLimit`
    // output, which pools _scorpOfficerW2ForSEHI (known: $10,000, since we set
    // officerW2) + _seEarnedForSEHI (the sole prop's after-halfSE earned income,
    // computed by unrelated, already-tested code). Subtracting the known $10,000
    // isolates _seEarnedForSEHI without hand-computing SE tax.
    const probe = run(mixedEntities(), { ...mixedBase, selfEmpHealthIns: 0 })
    const otherLegCapacity = probe.sehiLimit - 10000
    expect(otherLegCapacity).toBeGreaterThan(500)   // sanity: sole prop nets $100k, capacity is well over $500

    const withSplit = run(mixedEntities(), {
      ...mixedBase,
      selfEmpHealthInsScorp: 15000,   // ABOVE the $10,000 S-corp officer-wage cap
      selfEmpHealthInsOther: 500,     // comfortably under the other leg's own cap
    })

    expect(withSplit.sehiSplitEngaged).toBe(true)
    expect(withSplit.sehiScorpLegDed).toBe(10000)          // capped independently at officer wages
    expect(withSplit.sehiOtherLegDed).toBe(500)            // not capped — well under its own base
    expect(withSplit.selfEmpHealthDed).toBe(10500)         // sum of the two INDEPENDENTLY capped legs
    expect(withSplit.sehiClamped).toBe(true)               // the S-corp leg was clamped
    expect(withSplit.sehiMixedSourceFallback).toBe(false)  // exact attribution now known
  })

  it('SPEC: the full entered S-corp amount grosses up W-2 wages uncapped, even past its own §162(l) deduction cap (Notice 2008-1 / Rev. Rul. 91-26), same principle as the single-source EXT-1-FOLLOW-UP fix', () => {
    const withSplit = run(mixedEntities(), {
      ...mixedBase,
      selfEmpHealthInsScorp: 15000,
      selfEmpHealthInsOther: 500,
    })
    // Deduction is capped at $10,000 but the wage inclusion is the full $15,000 entered —
    // these are deliberately different amounts (the $5,000 excess is taxable wage income
    // with no offsetting deduction).
    expect(withSplit.sehiScorpWageGrossUp).toBe(15000)
    expect(withSplit.selfEmpHealthDed - withSplit.sehiScorpLegDed - withSplit.sehiOtherLegDed).toBe(0)
  })

  it('SPEC: the other-business leg independently caps at its own earned-income base too', () => {
    const probe = run(mixedEntities(), { ...mixedBase, selfEmpHealthIns: 0 })
    const otherLegCapacity = probe.sehiLimit - 10000
    const overCapOther = otherLegCapacity + 5000   // deliberately push past the other leg's own cap

    const withSplit = run(mixedEntities(), {
      ...mixedBase,
      selfEmpHealthInsScorp: 1000,      // comfortably under the S-corp cap
      selfEmpHealthInsOther: overCapOther,
    })
    expect(withSplit.sehiScorpLegDed).toBe(1000)
    expect(withSplit.sehiOtherLegDed).toBe(otherLegCapacity)   // capped at ITS OWN base, not the S-corp's
    expect(withSplit.sehiClamped).toBe(true)
  })
})

describe('B4 — QBI reduction (Treas. Reg. §1.199A-3(b)(1)(vi)) uses the precise split leg', () => {
  it('SPEC: mixed-source QBI reduction is 0 without the split (existing documented limitation) but exact once the S-corp leg is entered', () => {
    const withoutSplit = run(mixedEntities(), { ...mixedBase, selfEmpHealthIns: 8000 })
    const withSplit     = run(mixedEntities(), { ...mixedBase, selfEmpHealthInsScorp: 8000, selfEmpHealthInsOther: 0 })

    // Both premiums are $8,000 and both are fully deductible ($8,000 < either cap) — the
    // ONLY difference between the two runs is whether the split fields attribute it.
    expect(withoutSplit.selfEmpHealthDed).toBe(8000)
    expect(withSplit.selfEmpHealthDed).toBe(8000)

    expect(withoutSplit.sehiUnambiguousForQBI).toBe(false)
    expect(withoutSplit.scorpSEHIQbiReduction).toBe(0)

    expect(withSplit.sehiUnambiguousForQBI).toBe(true)
    expect(withSplit.scorpSEHIQbiReduction).toBe(8000)

    // qbiBasis differs by exactly the $8,000 now-known S-corp-attributable reduction —
    // everything else about the two runs is identical.
    expect(withSplit.qbiBasis).toBe(withoutSplit.qbiBasis - 8000)
  })

  it('SPEC: an other-leg-only split entry does NOT reduce QBI (only the S-corp leg is QBI-relevant — sole prop SEHI was already netted via seK1AfterAdjustments)', () => {
    const withSplit = run(mixedEntities(), { ...mixedBase, selfEmpHealthInsScorp: 0, selfEmpHealthInsOther: 500 })
    expect(withSplit.sehiSplitEngaged).toBe(true)
    expect(withSplit.sehiUnambiguousForQBI).toBe(false)
    expect(withSplit.scorpSEHIQbiReduction).toBe(0)
  })
})
