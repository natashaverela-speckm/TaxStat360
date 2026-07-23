// src/taxCalc-amt-preferential.test.js
//
// F-AMT (audit re-review #2, Jul 2026): AMT must not charge preferential-rate income
// (qualified dividends / LTCG) for the standard/SALT deduction that the AMT exemption
// already absorbs. Before the fix, a taxpayer living on qualified dividends was charged
// ~$2,415 of AMT (= 15% × the $16,100 standard deduction added back) even though the
// correct AMT is $0. Form 6251 Part III caps the preferential income at the AMT base.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './lib/taxCalc.js'

const base = { taxYear: 2026, status: 'single', entities: [], k1Total: 0, w2: 0 }

describe('AMT — preferential income must not generate phantom AMT', () => {
  it('SPEC: a single filer living on qualified dividends owes $0 AMT (any amount above the exemption)', () => {
    for (const qd of [120000, 200000, 400000]) {
      const r = calcTaxReturn({ ...base, qualDiv: qd, divInc: qd })
      expect(r.amt, `QD ${qd}`).toBe(0)
    }
  })
  it('SPEC: a single filer living on long-term capital gains owes $0 AMT', () => {
    for (const lt of [120000, 250000]) {
      const r = calcTaxReturn({ ...base, ltGain: lt })
      expect(r.amt, `LTCG ${lt}`).toBe(0)
    }
  })
  it('CHAR: ordinary-income wages generate no AMT (unchanged)', () => {
    expect(calcTaxReturn({ ...base, w2: 120000 }).amt).toBe(0)
  })
  it('GUARD: a large ISO bargain element still triggers AMT (fix does not neuter real AMT)', () => {
    const r = calcTaxReturn({ ...base, w2: 100000, hasISO: true, isoBargainElement: 300000 })
    expect(r.amt).toBeGreaterThan(0)
  })
})
