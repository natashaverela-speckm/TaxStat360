// EXT-1 (external accuracy audit, Aug 2026) — Finding 1: >2% S-Corp shareholder
// self-employed health insurance (SEHI) premiums must be included in Box 1 W-2
// wages (IRC §1372 / Rev. Rul. 91-26) before the offsetting Schedule 1, Line 17
// deduction is taken. Prior to this fix, `selfEmpHealthDed` (see the F-7
// §162(l)(5)(A) cap in taxCalc-reasonable-comp / this file's sibling) reduced
// AGI with no corresponding wage inclusion anywhere in the engine — audit
// observed a $12,000 SEHI entry reduce AGI (and tax) by the full $12,000 with
// zero offsetting income, live in the deployed app.
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

  it('SPEC: §162(l)(5)(A) — SEHI exceeding the officer wage base only grosses up to the wage base; the remainder is a pure deduction (sole-prop/partner leg of sehiLimit)', () => {
    // Officer wage base only $10,000; SEHI entered $12,000. sehiLimit = officerW2 (10,000)
    // + SE-earned leg. With no other SE income, the SE-earned leg is 0, so the deduction
    // itself is capped at $10,000 too (F-7) — grossUp equals the full (capped) deduction.
    const withSehi    = run([scorp({ officerW2: '10000', k1: '340000' })], { w2: 10000, k1Total: 340000, selfEmpHealthIns: 12000 })
    const withoutSehi = run([scorp({ officerW2: '10000', k1: '340000' })], { w2: 10000, k1Total: 340000, selfEmpHealthIns: 0 })
    expect(withSehi.selfEmpHealthDed).toBe(10000)
    expect(withSehi.sehiClamped).toBe(true)
    expect(withSehi.sehiScorpWageGrossUp).toBe(10000)
    // Consistency review, Aug 2026: assert the actual AGI effect, not just the intermediate
    // variable — the $10,000 deduction is fully offset by the $10,000 grossup (net zero AGI
    // effect), even though $2,000 of the entered $12,000 premium got no deduction at all
    // (§162(l)(5)(A) cap) and correspondingly no grossup either.
    expect(withSehi.agi).toBe(withoutSehi.agi)
    expect(withSehi.grossIncome).toBe(withoutSehi.grossIncome + 10000)
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
})
