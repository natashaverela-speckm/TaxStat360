// @vitest-environment jsdom
// src/aiAnalysis-sep-limited-partner.test.js
//
// Finding 1 FOLLOW-UP (independent pre-launch audit, Jul 2026) — the AI Analysis
// SEP-IRA / Solo 401(k) card recommended a contribution ("~$11,152 of net
// self-employment income") on a LIMITED-PARTNER K-1, contradicting the Tax
// Tracker, which correctly treats that same income as SE-EXEMPT under
// IRC §1402(a)(13). Root cause: the card sized its base from the raw K-1 total.
//
// The fix derives the SE-ELIGIBLE K-1 from the entities (excluding S-corp/C-corp
// K-1, rental, and a limited partner's §1402(a)(13) share) and feeds THAT to the
// SEP base. This suite pins the exported helper so the erroneous card can never
// come back: if the SE-eligible base is 0, the SEP contribution base is 0.
//
// Self-contained: imports only from AIAnalysis.jsx (no selector/engine wiring),
// so applying the single component file is sufficient.
//
// Numbers (2026): a limited partner's $60k share → SE-eligible 0; an active
// partner / sole prop's $60k → SE-eligible 60,000.

import { describe, it, expect } from 'vitest'
import { seEligibleK1FromEntities, hasLimitedPartnerInterest } from './AIAnalysis.jsx'

const K1 = 60000

describe('Finding 1 follow-up — SE-eligible K-1 excludes SE-exempt income', () => {
  it('ACTIVE partnership → full K-1 is SE-eligible (SEP room exists)', () => {
    expect(seEligibleK1FromEntities([{ type: 'Partnership / LLC', own: 100, k1: K1 }])).toBe(K1)
  })

  it('LIMITED PARTNER → $0 SE-eligible (§1402(a)(13)); no SEP base', () => {
    expect(seEligibleK1FromEntities([
      { type: 'Partnership / LLC', own: 100, k1: K1, limitedPartner: true },
    ])).toBe(0)
  })

  it('SOLE PROPRIETOR → full net is SE-eligible', () => {
    expect(seEligibleK1FromEntities([{ type: 'Sole Proprietor / SMLLC', own: 100, k1: K1 }])).toBe(K1)
  })

  it('S-CORP K-1 → excluded (SEP is officer-W-2 based, handled separately)', () => {
    expect(seEligibleK1FromEntities([{ type: 'S-Corp', own: 100, k1: K1 }])).toBe(0)
  })

  it('RENTAL (Schedule E) → excluded (not a trade-or-business K-1)', () => {
    expect(seEligibleK1FromEntities([{ type: 'Real Estate (Schedule E)', own: 100, k1: K1 }])).toBe(0)
  })

  it('MIX: active partner +60k and limited partner +60k → only the active 60k counts', () => {
    expect(seEligibleK1FromEntities([
      { type: 'Partnership / LLC', own: 100, k1: K1 },
      { type: 'Partnership / LLC', own: 100, k1: K1, limitedPartner: true },
    ])).toBe(K1)
  })

  it('owner share is applied when K-1 is not explicit (50% of net profit)', () => {
    expect(seEligibleK1FromEntities([
      { type: 'Partnership / LLC', own: 50, pnl: { netProfit: K1 } },
    ])).toBe(30000)
  })
})

describe('Finding 1 follow-up — limited-partner detection (drives the explainer card)', () => {
  it('flags a limited-partner interest', () => {
    expect(hasLimitedPartnerInterest([
      { type: 'Partnership / LLC', own: 100, k1: K1, limitedPartner: true },
    ])).toBe(true)
  })

  it('does not flag an active partner', () => {
    expect(hasLimitedPartnerInterest([{ type: 'Partnership / LLC', own: 100, k1: K1 }])).toBe(false)
  })

  it('does not treat an S-corp as a limited partner', () => {
    expect(hasLimitedPartnerInterest([
      { type: 'S-Corp', own: 100, k1: K1, limitedPartner: true },
    ])).toBe(false)
  })
})
