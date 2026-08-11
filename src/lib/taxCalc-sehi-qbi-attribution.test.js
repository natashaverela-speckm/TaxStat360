// EXT-7 (independent fresh-eyes re-audit, Aug 2026 — Round 3): two adjacent gaps flagged by
// the independent reviewer who checked the EXT-1/EXT-1-FOLLOW-UP SEHI wage-grossup fix:
//
//   1. QBI NUMERATOR: Treas. Reg. §1.199A-3(b)(1)(vi) requires QBI to be reduced by the §162(l)
//      SEHI deduction attributable to the trade/business. The sole-prop/partner leg was already
//      netted (seK1AfterAdjustments); the S-corp leg (nonSEk1) never was, overstating a >2%
//      shareholder's QBI deduction by up to 20% of the premium.
//   2. QBI WAGE CAP: §199A(b)(4)'s W-2 wage limitation is the same Box-1/§6051(a)(3) wage
//      concept EXT-1 grossed up. IRS Notice 2018-64 (read with Notice 2008-1) treats SEHI as
//      W-2 wages for §199A purposes too. Leaving the QBI wage base un-grossed-up UNDERSTATES
//      the wage cap and therefore the allowed QBI deduction — the opposite exposure direction
//      from the original AGI bug.
//
// This file is the SPEC test suite for `nonSEk1ForQBI` / `scorpSEHIQbiReduction` /
// `sehiUnambiguousForQBI` and the wage-bump in `qbiEligibleEntitiesForCalc` (taxCalc.js,
// search "EXT-7"). Values are hand-computed from the statute and independently reproduced by
// running the actual engine before being locked in as expectations (not copied from any
// buggy pre-fix output).

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'
import { CURRENT_TAX_YEAR } from './constants.js'

const scorp = (over = {}) => ({ name: 'SC', type: 'S Corporation', own: '100', officerW2: '', k1: '', ...over })
const run = (entities, extra = {}) => calcTaxReturn({
  taxYear: CURRENT_TAX_YEAR, status: 'single', dependents: 0,
  entities, w2: 0, k1Total: 0, w2Withheld: 0, estPaid: 0, ...extra,
})

describe('EXT-7 — SEHI attribution reaches the QBI base and the QBI wage cap', () => {
  it('SPEC: §1.199A-3(b)(1)(vi) — S-corp SEHI reduces the QBI numerator (isolated: wages huge enough that the wage cap never binds)', () => {
    // Officer wages $1,000,000 (wage cap never binds at any QBI level tested here); K1 $400,000;
    // SEHI $30,000, unambiguous single S-corp source. QBI numerator should drop by the full
    // $30,000 SEHI deduction, so the 20% QBI deduction drops by exactly $6,000.
    const withSehi = run([scorp({ officerW2: '1000000', k1: '400000' })], { w2: 1000000, k1Total: 400000, selfEmpHealthIns: 30000 })
    const without  = run([scorp({ officerW2: '1000000', k1: '400000' })], { w2: 1000000, k1Total: 400000, selfEmpHealthIns: 0 })
    expect(withSehi.scorpSEHIQbiReduction).toBe(30000)
    expect(withSehi.nonSEk1).toBe(400000)             // display figure (scheduleEK1Income) unaffected
    expect(withSehi.nonSEk1ForQBI).toBe(370000)        // QBI-specific figure IS reduced
    expect(withSehi.qbiBasis).toBe(370000)
    expect(without.qbi).toBe(80000)                    // 400,000 * 20%, no SEHI
    expect(withSehi.qbi).toBe(74000)                   // 370,000 * 20%, SEHI-reduced
  })

  it('SPEC: IRS Notice 2018-64/2008-1 — S-corp SEHI increases the §199A(b)(4) W-2 wage cap (isolated: modest wages, huge K1, wage cap binds)', () => {
    // Officer wages $50,000; K1 $2,000,000 (comfortably above both the QBI-component and
    // taxable-income caps, so the wage cap is the sole binding constraint in both scenarios).
    // Without the fix: wage cap = $50,000 * 50% = $25,000. With the fix: true Box-1 wages
    // are $50,000 + $30,000 SEHI grossup = $80,000, so wage cap = $80,000 * 50% = $40,000.
    const withSehi = run([scorp({ officerW2: '50000', k1: '2000000' })], { w2: 50000, k1Total: 2000000, selfEmpHealthIns: 30000 })
    const without  = run([scorp({ officerW2: '50000', k1: '2000000' })], { w2: 50000, k1Total: 2000000, selfEmpHealthIns: 0 })
    expect(withSehi.sehiScorpWageGrossUp).toBe(30000)
    expect(without.qbiCaps.wage).toBe(25000)
    expect(withSehi.qbiCaps.wage).toBe(40000)
    expect(without.qbi).toBe(25000)
    expect(withSehi.qbi).toBe(40000)
  })

  it('SPEC: SEHI exceeding the officer wage base (still unambiguous, single S-corp) — QBI reduction uses the CAPPED deduction, wage bump uses the FULL premium (deliberately different)', () => {
    // Officer wages $80,000 (huge enough that the wage cap won't bind against the $2,000,000
    // K1 either way), SEHI $120,000 -- premium exceeds the officer wage base, so the §162(l)
    // deduction is capped at $80,000 while the Box-1 wage inclusion is the full $120,000
    // (independent review, Round 3: confirm these two intentionally different figures are each
    // wired to the right consumer -- scorpSEHIQbiReduction to the capped deduction,
    // the wage-bump to the uncapped grossup).
    const withSehi = run([scorp({ officerW2: '80000', k1: '2000000' })], { w2: 80000, k1Total: 2000000, selfEmpHealthIns: 120000 })
    expect(withSehi.selfEmpHealthDed).toBe(80000)
    expect(withSehi.sehiScorpWageGrossUp).toBe(120000)
    expect(withSehi.scorpSEHIQbiReduction).toBe(80000)       // QBI numerator: capped deduction
    // Wage cap: true Box-1 wages = 80,000 + 120,000 = 200,000; 50% = 100,000 -- NOT
    // 80,000 (unbumped) and NOT (80,000+80,000) (deduction-capped, which would be wrong).
    expect(withSehi.qbiCaps.wage).toBe(100000)
  })

  it('SPEC: mixed-source fallback (S-corp + independent SE income) — QBI base and wage cap are BOTH left unadjusted, consistent with the EXT-1-FOLLOW-UP wage-grossup fallback', () => {
    const entities = [
      scorp({ officerW2: '50000', k1: '400000' }),
      { name: 'SP', type: 'Sole Proprietor / SMLLC', own: '100', k1: '100000' },
    ]
    const withSehi = run(entities, { w2: 50000, k1Total: 500000, selfEmpHealthIns: 12000 })
    expect(withSehi.sehiUnambiguousForQBI).toBe(false)
    expect(withSehi.scorpSEHIQbiReduction).toBe(0)
    expect(withSehi.nonSEk1ForQBI).toBe(withSehi.nonSEk1)
  })

  it('SPEC: no S-corp at all (sole proprietor only) — QBI fields are completely unaffected by this pass', () => {
    const soleProp = { name: 'SP', type: 'Sole Proprietor / SMLLC', own: '100', k1: '150000' }
    const withSehi = run([soleProp], { w2: 0, k1Total: 150000, selfEmpHealthIns: 8000 })
    expect(withSehi.sehiUnambiguousForQBI).toBe(false)
    expect(withSehi.scorpSEHIQbiReduction).toBe(0)
    expect(withSehi.nonSEk1ForQBI).toBe(withSehi.nonSEk1)
  })
})
