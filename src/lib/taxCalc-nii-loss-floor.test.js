// src/lib/taxCalc-nii-loss-floor.test.js
//
// AUDIT FIX (fresh-eyes re-audit, Aug 2026): the nii calculation floored the
// capital-gain/§4797 sub-total at $0 INSIDE ITS OWN BUCKET before adding interest,
// dividends, and rents -- so a §1211(b)-capped capital LOSS (as negative as -$3,000,
// or -$1,500 MFS) was zeroed out before it could offset NII from other sources. Form
// 8960 Line 5a (capital gain/loss, already §1211-limited) is summed together with
// Lines 1-4/7 (interest, dividends, rents, etc.) FIRST; only the FINAL total is
// floored at zero (Form 8960 instructions, Line 13: "If zero or less, enter -0-").
//
// Test labels (ARCHITECTURE §6): SPEC = independently verified against Form 8960's
// summing order; CHAR = freezes current engine behavior for interaction coverage.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'
import { CURRENT_TAX_YEAR } from './constants.js'

const run = (extra = {}) => calcTaxReturn({
  taxYear: CURRENT_TAX_YEAR, status: 'single', dependents: 0,
  entities: [], w2: 0, k1Total: 0, w2Withheld: 0, estPaid: 0,
  ...extra,
})

describe('Phase 5 — NII: capital-loss floor moved to wrap the full sum, not just the capital-gain sub-total', () => {
  // SPEC: a §1211(b)-capped $3,000 loss (single filer) should reduce NII by the full
  // $3,000 when there's other positive NII to absorb it -- not be zeroed out first.
  // $250,000 W-2 (pushes AGI/MAGI over the $200,000 single NIIT threshold without
  // itself counting as NII) + $20,000 interest + an $80,000 LT loss (capped to
  // -$3,000 by §1211(b)) => nii = 20,000 - 3,000 = 17,000, not 20,000.
  it('SPEC: Form 8960 Line 5a — a capped capital loss reduces NII from interest/dividends, it is not zeroed out first', () => {
    const withLoss = run({ w2: 250000, intInc: 20000, ltGain: -80000 })
    const noLoss    = run({ w2: 250000, intInc: 20000, ltGain: 0 })
    expect(withLoss.nii).toBe(17000)
    expect(noLoss.nii).toBe(20000)
    expect(noLoss.nii - withLoss.nii).toBe(3000)
    expect(withLoss.niitAmount).toBe(Math.round(17000 * 0.038))
  })

  // SPEC: the final NII figure still floors at $0 overall when the loss exceeds other
  // NII sources -- Form 8960 Line 13's floor still applies, just at the END of the sum
  // instead of prematurely inside the capital-gain sub-total.
  it('SPEC: NII still floors at $0 when the loss exceeds other NII sources (Form 8960 Line 13)', () => {
    const r = run({ w2: 250000, intInc: 1000, ltGain: -80000 })
    expect(r.nii).toBe(0)
    expect(r.niitAmount).toBe(0)
  })

  // SPEC (regression guard): a GAIN scenario is completely unaffected -- the floor
  // never bound for gains either before or after this fix, since a positive capital
  // gain sub-total was never being zeroed out in the first place.
  it('SPEC: a capital GAIN scenario is unaffected by this fix', () => {
    const r = run({ w2: 250000, intInc: 20000, ltGain: 50000 })
    expect(r.nii).toBe(70000)
  })

  // CHAR (regression guard): the Phase 4 4797-NII material-participation exclusion
  // still composes correctly with this fix -- a materially-participated Form 4797
  // gain is excluded from nii regardless of whether a capital loss is also present.
  it('CHAR: composes correctly with the Phase 4 f4797MateriallyParticipated exclusion', () => {
    const r = run({ w2: 250000, intInc: 20000, ltGain: -80000, f4797Inc: 50000, f4797MateriallyParticipated: true })
    // nii = 20,000 (interest) + (-3,000 capped loss) + 0 (excluded 4797 gain) = 17,000
    expect(r.nii).toBe(17000)
  })

  // CHAR (regression guard): without material participation, the same 4797 gain still
  // flows into nii and combines correctly with the capped loss.
  it('CHAR: composes correctly with an INCLUDED (non-materially-participated) Form 4797 gain', () => {
    const r = run({ w2: 250000, intInc: 20000, ltGain: -80000, f4797Inc: 50000, f4797MateriallyParticipated: false })
    // nii = 20,000 (interest) + (-3,000 capped loss) + 50,000 (included 4797 gain) = 67,000
    expect(r.nii).toBe(67000)
  })
})
