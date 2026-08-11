// EXT-1 (external accuracy audit, Aug 2026) — Finding 1: >2% S-Corp shareholder
// self-employed health insurance (SEHI) premiums must be included in Box 1 W-2
// wages (IRC §1372 / Rev. Rul. 91-26) before the offsetting Schedule 1, Line 17
// deduction is taken. Prior to the ORIGINAL fix, `selfEmpHealthDed` reduced AGI
// with no corresponding wage inclusion anywhere in the engine — audit observed
// a $12,000 SEHI entry reduce AGI (and tax) by the full $12,000 with zero
// offsetting income, live in the deployed app.
//
// EXT-1 FOLLOW-UP (independent fresh-eyes re-audit, Aug 2026) — Finding 1
// regression: the original fix grossed wages up by the DEDUCTION amount
// (already capped), not the FULL premium, so it silently dropped any excess
// premium above the officer-wage-base cap from AGI entirely (re-audit case:
// $80,000 wages / $120,000 premium — AGI understated by $40,000, confirmed
// live in production). Test 3 below was WRONG under the old formula (it
// asserted the bug's own output as correct) and has been corrected here to
// assert the true §1372 treatment. Test 5 is new: it covers the mixed-source
// fallback (S-corp + independent SE income in the same return) documented in
// KNOWN_LIMITATIONS.md → SEHI-MIXED-SOURCE.
//
// This file is the SPEC test suite for `sehiScorpWageGrossUp` (taxCalc.js,
// search "EXT-1"). Values are hand-computed from the statute; NOT taken from
// the app's own (buggy, pre-fix) output.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'
import { CURRENT_TAX_YEAR } from './constants.js'

const scorp = (over = {}) => ({
  name: 'SC', type: 'S Corporation', own: '100',
  officerW2: '', k1: '',
  ...over,
})

const run = (entities, extra = {}) => calcTaxReturn({
  taxYear: CURRENT_TAX_YEAR, status: 'single', dependents: 0,
  entities, w2: 0, k1Total: 0, w2Withheld: 0, estPaid: 0,
  ...extra,
})

describe('EXT-1 — §1372 SEHI wage grossup (sehiScorpWageGrossUp)', () => {
  it('SPEC: §1372/Rev. Rul. 91-26 — SEHI fully covered by S-corp officer wages nets to zero AGI effect', () => {
    // Officer wage base $40,000 (entity.officerW2) mirrors the $40,000 passed as
    // top-level w2 (as TaxReturn.jsx would sum it in). SEHI entered: $12,000.
    const withSehi    = run([scorp({ officerW2: '40000', k1: '340000' })], { w2: 40000, k1Total: 340000, selfEmpHealthIns: 12000 })
    const withoutSehi  = run([scorp({ officerW2: '40000', k1: '340000' })], { w2: 40000, k1Total: 340000, selfEmpHealthIns: 0 })

    expect(withSehi.selfEmpHealthDed).toBe(12000)
    expect(withSehi.sehiScorpWageGrossUp).toBe(12000)      // fully covered by the $40,000 officer wage base
    // AGI is UNCHANGED vs. the no-SEHI baseline — the wage grossup and the
    // deduction net to zero, matching the real §1372 mechanic.
    expect(withSehi.agi).toBe(withoutSehi.agi)
    expect(withSehi.grossIncome).toBe(withoutSehi.grossIncome + 12000)
  })

  it('SPEC: §1372 — grossup does not increase FICA wages or Additional Medicare Tax (Notice 2008-1 FICA exemption)', () => {
    const withSehi   = run([scorp({ officerW2: '40000', k1: '340000' })], { w2: 40000, k1Total: 340000, selfEmpHealthIns: 12000 })
    const withoutSehi = run([scorp({ officerW2: '40000', k1: '340000' })], { w2: 40000, k1Total: 340000, selfEmpHealthIns: 0 })

    // totalW2ForFICA and additionalMedicare must read the RAW w2, never the grossed-up figure.
    // (Consistency review, Aug 2026: also assert grossIncome/agi here, not just the FICA-side
    // figures — without that, this test alone would still pass against a broken engine that
    // computed `sehiScorpWageGrossUp` correctly but never wired it into `grossIncomeBeforeNOL`.)
    expect(withSehi.totalW2ForFICA).toBe(withoutSehi.totalW2ForFICA)
    expect(withSehi.additionalMedicare).toBe(withoutSehi.additionalMedicare)
    expect(withSehi.grossIncome).toBe(withoutSehi.grossIncome + 12000)
    expect(withSehi.agi).toBe(withoutSehi.agi)
  })

  it('SPEC: §162(l)(5)(A)/§1372 — SEHI exceeding the officer wage base grosses up wages by the FULL premium; only the DEDUCTION is capped, so the excess increases AGI', () => {
    // Officer wage base only $10,000; SEHI entered $12,000; no other SE income (SE-earned
    // leg of sehiLimit is 0, so the S-corp leg is unambiguous). The deduction itself is
    // still correctly capped at $10,000 (§162(l)(5)(A)) — that part was always right.
    // But the FULL $12,000 premium must hit Box 1 wages (Notice 2008-1 / Rev. Rul. 91-26),
    // regardless of the deduction cap. Net AGI effect: +$12,000 wages - $10,000 deduction
    // = +$2,000 (the un-deducted excess), NOT zero.
    const withSehi    = run([scorp({ officerW2: '10000', k1: '340000' })], { w2: 10000, k1Total: 340000, selfEmpHealthIns: 12000 })
    const withoutSehi = run([scorp({ officerW2: '10000', k1: '340000' })], { w2: 10000, k1Total: 340000, selfEmpHealthIns: 0 })
    expect(withSehi.selfEmpHealthDed).toBe(10000)
    expect(withSehi.sehiClamped).toBe(true)
    expect(withSehi.sehiScorpWageGrossUp).toBe(12000)
    expect(withSehi.grossIncome).toBe(withoutSehi.grossIncome + 12000)
    // The $2,000 excess premium (entered but not deductible) correctly raises AGI —
    // this is the exact case the original EXT-1 fix got wrong (it asserted `agi` unchanged).
    expect(withSehi.agi).toBe(withoutSehi.agi + 2000)
  })

  it('SPEC: fresh-eyes re-audit reproduction — $80,000 officer wages / $120,000 premium must raise AGI by the $40,000 excess, not net to zero', () => {
    // This is the exact scenario the independent re-audit tested live against production
    // and found AGI unchanged ($320,000) across $0/$50,000/$120,000 SEHI entries — proving
    // the excess was silently dropped. Correct AGI delta for the $120,000 case: +$40,000.
    const withSehi    = run([scorp({ officerW2: '80000', k1: '240000' })], { w2: 80000, k1Total: 240000, selfEmpHealthIns: 120000 })
    const withoutSehi = run([scorp({ officerW2: '80000', k1: '240000' })], { w2: 80000, k1Total: 240000, selfEmpHealthIns: 0 })
    expect(withSehi.selfEmpHealthDed).toBe(80000)
    expect(withSehi.sehiScorpWageGrossUp).toBe(120000)
    expect(withSehi.grossIncome).toBe(withoutSehi.grossIncome + 120000)
    expect(withSehi.agi).toBe(withoutSehi.agi + 40000)
  })

  it('SPEC: sole proprietor SEHI (no S-corp entity) — grossUp is zero; behaves as a pure above-the-line deduction, unchanged from pre-fix', () => {
    const soleProp = { name: 'SP', type: 'Sole Proprietor / SMLLC', own: '100', k1: '150000' }
    const withSehi    = run([soleProp], { w2: 0, k1Total: 150000, selfEmpHealthIns: 8000 })
    const withoutSehi = run([soleProp], { w2: 0, k1Total: 150000, selfEmpHealthIns: 0 })

    expect(withSehi.sehiScorpWageGrossUp).toBe(0)
    // Sole-prop SEHI was never "wages" — a straight deduction is the correct, unchanged result.
    // (Consistency review, Aug 2026: this assertion on grossIncome makes the "no grossup
    // happened" claim explicit, rather than inferring it only from grossUp === 0.)
    expect(withSehi.grossIncome).toBe(withoutSehi.grossIncome)
    expect(withSehi.agi).toBe(withoutSehi.agi - withSehi.selfEmpHealthDed)
  })

  it('SPEC: KNOWN_LIMITATIONS.md SEHI-MIXED-SOURCE — S-corp + independent SE income in the same return falls back to the capped (pre-follow-up-fix) grossup, since the combined entry cannot be attributed', () => {
    // S-corp officer wage base $10,000 AND a separate sole-prop business with substantial
    // net profit, so _seEarnedForSEHI > 0 -- the mixed-source case where the engine cannot
    // tell how much of the single combined `selfEmpHealthIns` entry is S-corp-sourced.
    const entities = [
      scorp({ officerW2: '10000', k1: '90000' }),
      { name: 'SP', type: 'Sole Proprietor / SMLLC', own: '100', k1: '100000' },
    ]
    const withSehi    = run(entities, { w2: 10000, k1Total: 190000, selfEmpHealthIns: 12000 })
    const withoutSehi = run(entities, { w2: 10000, k1Total: 190000, selfEmpHealthIns: 0 })

    // sehiLimit is large (officer W-2 + substantial SE-earned leg), so the full $12,000
    // premium is deductible -- the §162(l) cap doesn't bind here at all.
    expect(withSehi.selfEmpHealthDed).toBe(12000)
    expect(withSehi.sehiClamped).toBe(false)
    // But the wage grossup still falls back to the pre-follow-up-fix formula (capped at the
    // officer wage base, $10,000) rather than the full $12,000, because the engine cannot
    // safely attribute the combined entry between the S-corp and sole-prop legs.
    expect(withSehi.sehiScorpWageGrossUp).toBe(10000)
    expect(withSehi.grossIncome).toBe(withoutSehi.grossIncome + 10000)
    expect(withSehi.agi).toBe(withoutSehi.agi - 2000)
    // Independent review, Aug 2026: sehiMixedSourceFallback must be true here so the UI can
    // warn even though sehiClamped is false (the deduction itself wasn't capped, only the
    // wage-attribution is approximate).
    expect(withSehi.sehiMixedSourceFallback).toBe(true)
  })

  it('SPEC: sehiMixedSourceFallback is false for the unambiguous single-source cases', () => {
    const scorpOnly = run([scorp({ officerW2: '80000', k1: '240000' })], { w2: 80000, k1Total: 240000, selfEmpHealthIns: 120000 })
    expect(scorpOnly.sehiMixedSourceFallback).toBe(false)

    const soleProp = { name: 'SP', type: 'Sole Proprietor / SMLLC', own: '100', k1: '150000' }
    const soleOnly = run([soleProp], { w2: 0, k1Total: 150000, selfEmpHealthIns: 8000 })
    expect(soleOnly.sehiMixedSourceFallback).toBe(false)

    const noSehi = run([scorp({ officerW2: '80000', k1: '240000' })], { w2: 80000, k1Total: 240000, selfEmpHealthIns: 0 })
    expect(noSehi.sehiMixedSourceFallback).toBe(false)
  })
})
