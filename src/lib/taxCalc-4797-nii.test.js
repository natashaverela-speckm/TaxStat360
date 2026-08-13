// Phase 4 (Aug 2026) — LIMITATION 4797-NII fix. IRC §1411(c)(1)(A)(iii) / Treas. Reg.
// §1.1411-4(d)(4)(i) exclude gain on disposition of property held in an active
// (materially-participated, non-trading) trade or business from net investment income.
// `f4797MateriallyParticipated` is an opt-in attestation (default false — conservative,
// NII-inclusive, matching this app's general posture for unmodeled facts) that excludes
// the Form 4797 gain from the NIIT base only; it does not touch AGI, the preferential-rate
// gain, or the §461(l) excess-business-loss calculation, which already treat this figure
// as business gain independently of NII. This file is the SPEC test suite for that gate.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'
import { CURRENT_TAX_YEAR } from './constants.js'

// NIIT is Math.min(nii, magiExcess) × 3.8% — to isolate the exclusion's effect on `nii`,
// the scenario needs `nii` itself (not MAGI) to be the BINDING constraint, or excluding
// the Form 4797 gain from `nii` alone won't move the answer (MAGI would still cap it the
// same either way). Large W-2 wages push AGI/MAGI comfortably over the $200,000 single
// threshold WITHOUT counting toward NII (wages aren't investment income), while a smaller
// Form 4797 gain keeps `nii` well under that MAGI excess — exactly the shape where the
// exclusion is the moving part.
const run = (extra = {}) => calcTaxReturn({
  taxYear: CURRENT_TAX_YEAR, status: 'single', dependents: 0,
  entities: [], w2: 300000, k1Total: 0, w2Withheld: 0, estPaid: 0,
  ...extra,
})

describe('Phase 4 — 4797-NII: f4797MateriallyParticipated NII exclusion', () => {
  it('CHAR: default (flag omitted/false) — a Form 4797 GAIN is included in NII, matching pre-Phase-4 behavior', () => {
    const withGain    = run({ f4797Inc: 50000 })
    const withoutGain = run({ f4797Inc: 0 })
    expect(withGain.nii).toBe(50000)
    expect(withoutGain.nii).toBe(0)
    // nii ($50,000) is the binding constraint here (well under the $150,000 MAGI excess
    // once the gain is included in AGI too), so niitAmount moves with the gain 1:1.
    expect(withGain.niitAmount).toBe(Math.round(50000 * 0.038))
    expect(withoutGain.niitAmount).toBe(0)
  })

  it('SPEC: f4797MateriallyParticipated: true — the SAME gain is excluded from NII (nii and niitAmount both drop to what a $0 gain would produce)', () => {
    const withFlag    = run({ f4797Inc: 50000, f4797MateriallyParticipated: true })
    const noGainAtAll = run({ f4797Inc: 0 })
    expect(withFlag.nii).toBe(0)
    expect(withFlag.niitAmount).toBe(noGainAtAll.niitAmount)
    expect(withFlag.niitAmount).toBe(0)
  })

  it('SPEC: the flag does NOT change AGI, gross income, or total tax before NIIT — only the NII base itself', () => {
    const flagOff = run({ f4797Inc: 50000, f4797MateriallyParticipated: false })
    const flagOn  = run({ f4797Inc: 50000, f4797MateriallyParticipated: true })
    // Same gain, same AGI/gross income either way — the flag is NII-scoped only.
    expect(flagOn.agi).toBe(flagOff.agi)
    expect(flagOn.grossIncome).toBe(flagOff.grossIncome)
    // The only downstream difference is NIIT (and therefore totalTax/balance).
    expect(flagOn.niitAmount).toBeLessThan(flagOff.niitAmount)
    expect(flagOn.totalTax).toBeLessThan(flagOff.totalTax)
  })

  it('SPEC: a §1231 LOSS (negative f4797Inc) is unaffected by the flag either way — it never contributed to NII in the first place', () => {
    const flagOff = run({ f4797Inc: -50000, f4797MateriallyParticipated: false })
    const flagOn  = run({ f4797Inc: -50000, f4797MateriallyParticipated: true })
    expect(flagOn.niitAmount).toBe(flagOff.niitAmount)
  })

  it('SPEC: flag true with NO Form 4797 entry at all has no effect (nothing to exclude)', () => {
    const flagOff = run({ f4797Inc: 0, f4797MateriallyParticipated: false })
    const flagOn  = run({ f4797Inc: 0, f4797MateriallyParticipated: true })
    expect(flagOn.niitAmount).toBe(flagOff.niitAmount)
  })
})
