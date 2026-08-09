// src/lib/taxCalc-k1direct-ownership.test.js
//
// Independent audit, Aug 2026 -- Finding 2: K-1 direct-entry mode double-prorated
// Ownership % on top of an already-allocated K-1 Box 1 amount.
//
// The ManualEntryPanel's "Have a K-1? Enter Box 1 directly" toggle (FINDING-1 FIX)
// tells the user to enter Box 1 "exactly as shown... already scaled by your
// ownership percentage on the K-1" and sets entity.k1DirectMode = true. Every call
// site that resolved an entity's K-1 share used to re-inline
// `nf(e.k1) || Math.round(netProfit * ownPct(e.own) / 100)`, which does not know
// about k1DirectMode and multiplies the already-allocated figure by Ownership % a
// second time. Live-tested example: a 60%-owned partner's real K-1 Box 1 of
// $132,000 was displayed and taxed as $79,200 ($132,000 x 60%).
//
// Fix: getEntityK1Share() (src/utils/entityPredicates.js) is now the single source
// for this resolution, and every affected call site in taxCalc.js (SE tax, QBI,
// the basis waterfall, distributions, the reasonable-comp alert, and the entity
// income breakdown) uses it instead of the inline formula.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn, sumK1FlowThrough } from './taxCalc.js'
import { getEntityK1Share } from '../utils/entityPredicates.js'

const base = { status: 'single', taxYear: 2025, w2: 0 }
const k1DirectPartner = (own, netProfit) => ({
  type: 'Partnership / LLC', own, k1DirectMode: true,
  pnl: { netProfit, grossRevenue: 0, totalExpenses: 0 },
})

describe('Finding 2 -- getEntityK1Share() unit contract', () => {
  it('SPEC: k1DirectMode entity returns the Box 1 figure unscaled, regardless of Ownership %', () => {
    expect(getEntityK1Share(k1DirectPartner(60, 132000))).toBe(132000)
    expect(getEntityK1Share(k1DirectPartner(100, 132000))).toBe(132000)
    expect(getEntityK1Share(k1DirectPartner(1, 132000))).toBe(132000)
  })
  it('SPEC: gross-receipts / P&L mode (no k1DirectMode) still scales by Ownership %', () => {
    const e = { type: 'Partnership / LLC', own: 60, pnl: { netProfit: 220000, grossRevenue: 220000, totalExpenses: 0 } }
    expect(getEntityK1Share(e)).toBe(132000) // 220000 * 60%
  })
  it('SPEC: an explicit e.k1 override always wins, including 0 (F3 -- Section 199A x Section 1366(d))', () => {
    expect(getEntityK1Share({ type: 'S Corporation', own: 50, k1: 0, pnl: { netProfit: 999999 } })).toBe(0)
    expect(getEntityK1Share({ type: 'S Corporation', own: 50, k1: 75000, pnl: { netProfit: 999999 } })).toBe(75000)
  })
  it('SPEC: legacy pre-pnl records (top-level e.netProfit, no e.pnl) still resolve correctly', () => {
    expect(getEntityK1Share({ type: 'Partnership / LLC', own: 50, netProfit: 100000 })).toBe(50000)
  })
})

describe('Finding 2 -- end-to-end via calcTaxReturn (regression, live-tested facts)', () => {
  // Live-tested composite scenario: 60%-owned partner, K-1 Box 1 entered directly
  // as $132,000 (the field's own instructions: enter your ALREADY-allocated share).
  // calcTaxReturn takes k1Total as an explicit input (persistStep1 computes it via
  // sumK1FlowThrough before calling the engine, per ARCHITECTURE.md) -- tests call
  // sumK1FlowThrough the same way so k1Total and seNetIncome/QBI are derived from
  // the SAME entities array and cannot silently drift apart.
  const call = (entities) => calcTaxReturn({ ...base, entities, k1Total: sumK1FlowThrough(entities) })

  it('a 60%-owned K-1-direct partner is taxed on the full $132,000 Box 1 share, not $79,200', () => {
    const sixty   = call([k1DirectPartner(60, 132000)])
    const hundred = call([k1DirectPartner(100, 132000)])
    expect(sixty.seNetIncome).toBe(132000)
    expect(sixty.seNetIncome).toBe(hundred.seNetIncome) // Ownership % must not matter once Box 1 is the allocated share
    expect(sixty.agi).toBe(hundred.agi)
    expect(sixty.agi).toBeCloseTo(132000 - sixty.halfSE, 0) // sanity: full $132k reaches AGI, not $79.2k
  })
  it('QBI basis also reflects the unscaled $132,000, not $79,200', () => {
    const r = call([k1DirectPartner(60, 132000)])
    // qbiCaps.qbi = 20% of (net SE earnings less half-SE-tax), per Section 199A(c)(3)(B) --
    // NOT a bare 20% of $132,000, and (this is the regression guard) nowhere near the
    // old bug's 20% of the double-prorated $79,200 (= $15,840).
    const expected = (132000 - r.halfSE) * 0.20
    expect(r.qbiCaps.qbi).toBeCloseTo(expected, 0)
    expect(r.qbiCaps.qbi).toBeGreaterThan(79200 * 0.20)
  })
})
