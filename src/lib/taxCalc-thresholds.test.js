// src/lib/taxCalc-thresholds.test.js
//
// M6 (audit F-6, Aug 2026) — ARCHITECTURE.md §6 requires a test file for every
// exported function in taxCalc.js. getLTCGThresholds, getNIITThreshold,
// getAddlMedicareThreshold, and calcFICAOnWages were exported and consumed in
// production (aiAnalysisTaxMath.js, AIAnalysis.jsx, scenarioCompare.js) but had
// no test file that referenced them by name — only incidental coverage through
// calcTaxReturn()'s broader integration tests, which would not isolate a
// transcription error in one of these getters if another term happened to
// offset it. This file closes that gap.
//
// Labels per ARCHITECTURE §6: SPEC = value independently verified against a
// primary source; CHAR = pins current behavior as a refactor guard, not proof
// of correctness.

import { describe, it, expect } from 'vitest'
import { getLTCGThresholds, getNIITThreshold, getAddlMedicareThreshold, calcFICAOnWages, getTable } from './taxCalc.js'
import { FICA_SS_RATE, FICA_MEDICARE_RATE } from './constants.js'

describe('getLTCGThresholds — IRC §1(h) 0%/15%/20% breakpoints', () => {
  it('SPEC: §1(h)(1) — 2024 single ($47,025 / $518,900, Rev. Proc. 2023-34)', () => {
    expect(getLTCGThresholds(2024, 'single')).toEqual([47025, 518900])
  })

  it('SPEC: §1(h)(1) — 2024 MFJ ($94,050 / $583,750, Rev. Proc. 2023-34)', () => {
    expect(getLTCGThresholds(2024, 'mfj')).toEqual([94050, 583750])
  })

  it('SPEC: §1(h)(1) — 2025 single ($48,350 / $533,400, Rev. Proc. 2024-40)', () => {
    expect(getLTCGThresholds(2025, 'single')).toEqual([48350, 533400])
  })

  it('SPEC: §1(h)(1) — 2025 MFJ ($96,700 / $600,050, Rev. Proc. 2024-40)', () => {
    expect(getLTCGThresholds(2025, 'mfj')).toEqual([96700, 600050])
  })

  it('CHAR: 2026 single — pins TAX_TABLES[2026].ltcg.single (Rev. Proc. 2025-32 figures not independently re-verified here)', () => {
    // NOTE: unlike the 2024/2025 cases above, this test was not independently
    // hand-verified against the primary source — it pins whatever TAX_TABLES
    // already declares, so a transcription error here would need to be caught
    // by comparing this value against Rev. Proc. 2025-32 directly. Flagging
    // this honestly (CHAR, not SPEC) rather than overclaiming verification.
    expect(getLTCGThresholds(2026, 'single')).toEqual(getTable(2026).ltcg.single)
  })

  it('CHAR: unknown filing status falls back to single’s thresholds', () => {
    expect(getLTCGThresholds(2025, 'nonexistent-status')).toEqual(getLTCGThresholds(2025, 'single'))
  })
})

describe('getNIITThreshold — IRC §1411(b) MAGI thresholds (statutory, not inflation-adjusted)', () => {
  it('SPEC: §1411(b)(3) — single/HOH $200,000', () => {
    expect(getNIITThreshold(2025, 'single')).toBe(200000)
    expect(getNIITThreshold(2025, 'hoh')).toBe(200000)
  })

  it('SPEC: §1411(b)(1) — MFJ/QSS $250,000', () => {
    expect(getNIITThreshold(2025, 'mfj')).toBe(250000)
    expect(getNIITThreshold(2025, 'qss')).toBe(250000)
  })

  it('SPEC: §1411(b)(2) — MFS $125,000 (half of MFJ)', () => {
    expect(getNIITThreshold(2025, 'mfs')).toBe(125000)
  })

  it('SPEC: thresholds are fixed by statute — identical across supported years', () => {
    expect(getNIITThreshold(2024, 'single')).toBe(getNIITThreshold(2026, 'single'))
    expect(getNIITThreshold(2024, 'mfj')).toBe(getNIITThreshold(2026, 'mfj'))
  })
})

describe('getAddlMedicareThreshold — IRC §3101(b)(2) thresholds (statutory, not inflation-adjusted)', () => {
  it('SPEC: §3101(b)(2)(C) — single/HOH $200,000', () => {
    expect(getAddlMedicareThreshold(2025, 'single')).toBe(200000)
    expect(getAddlMedicareThreshold(2025, 'hoh')).toBe(200000)
  })

  it('SPEC: §3101(b)(2)(A) — MFJ $250,000', () => {
    expect(getAddlMedicareThreshold(2025, 'mfj')).toBe(250000)
  })

  it('SPEC: §3101(b)(2)(B) — MFS $125,000', () => {
    expect(getAddlMedicareThreshold(2025, 'mfs')).toBe(125000)
  })

  it('SPEC: §3101(b)(2)(C) — qualifying surviving spouse is $200,000, NOT $250,000', () => {
    // QSS does not file a joint return (it borrows the MFJ rate schedule under §2(a)),
    // so §3101(b)(2)(A)'s $250,000 "joint return" threshold does not apply to it —
    // §3101(b)(2)(C)'s $200,000 "any other case" threshold does (Form 8959 instructions
    // confirm: Single $200,000 / HOH $200,000 / QSS $200,000 / MFJ $250,000 / MFS
    // $125,000). This is the ONE place Additional Medicare Tax and NIIT diverge — NIIT's
    // own QSS threshold IS $250,000, because IRC §1411(b)(1) explicitly groups "a joint
    // return or a surviving spouse" with MFJ, unlike §3101(b)(2).
    expect(getAddlMedicareThreshold(2025, 'qss')).toBe(200000)
  })

  it('SPEC: thresholds are fixed by statute — identical across supported years', () => {
    expect(getAddlMedicareThreshold(2024, 'single')).toBe(getAddlMedicareThreshold(2026, 'single'))
  })
})

describe('calcFICAOnWages — combined employer + employee FICA on a W-2 salary (IRC §3101/§3111)', () => {
  it('SPEC: §3101(a)/§3111(a) + §3101(b)/§3111(b) — salary under the SS wage base', () => {
    const year = 2025
    const salary = 100000
    const ssWageBase = getTable(year).ssWageBase
    const expected = Math.round(
      Math.min(salary, ssWageBase) * FICA_SS_RATE * 2 + salary * FICA_MEDICARE_RATE * 2
    )
    expect(calcFICAOnWages(salary, year)).toBe(expected)
    // Concretely: 100,000 is under the 2025 wage base, so SS applies to the
    // full salary. 100,000 * 6.2% * 2 (both sides) + 100,000 * 1.45% * 2 = 15,300.
    expect(calcFICAOnWages(salary, year)).toBe(15300)
  })

  it('SPEC: salary above the SS wage base — SS caps, Medicare does not (no wage base ceiling on Medicare)', () => {
    const year = 2025
    const salary = 250000
    const ssWageBase = getTable(year).ssWageBase // 176,100
    const expected = Math.round(
      Math.min(salary, ssWageBase) * FICA_SS_RATE * 2 + salary * FICA_MEDICARE_RATE * 2
    )
    expect(calcFICAOnWages(salary, year)).toBe(expected)
    expect(calcFICAOnWages(salary, year)).toBe(29086)
  })

  it('CHAR: zero salary produces zero FICA', () => {
    expect(calcFICAOnWages(0, 2025)).toBe(0)
  })

  it('SPEC: uses the year-specific SS wage base — same salary, different years can differ', () => {
    const salary = 200000
    const r2024 = calcFICAOnWages(salary, 2024) // ssWageBase 168,600
    const r2025 = calcFICAOnWages(salary, 2025) // ssWageBase 176,100
    expect(r2024).not.toBe(r2025)
    expect(r2025).toBeGreaterThan(r2024) // higher wage base → more SS tax collected before the cap
  })
})
