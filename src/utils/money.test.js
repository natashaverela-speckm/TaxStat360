// src/utils/money.test.js
//
// PHASE 3.3 (UX F15) — effRateLabel: the single-sourced effective-rate display
// wording. A rate against non-positive AGI is not "0%" and not "—" — the
// honest label says why, identically on every surface (Dashboard cards,
// TaxReturn header, TaxReturn summary).

import { describe, it, expect } from 'vitest'
import { effRateLabel } from './money.js'

describe('Phase 3.3 (UX F15) — effRateLabel', () => {
  it('positive AGI renders the percentage; non-positive AGI renders the honest label', () => {
    expect(effRateLabel(36014, 197000)).toMatch(/%$/)
    expect(effRateLabel(0, -110525)).toBe('n/a (loss year)')
    expect(effRateLabel(0, 0)).toBe('n/a (loss year)')
    expect(effRateLabel('0', '-5')).toBe('n/a (loss year)')
  })
})
