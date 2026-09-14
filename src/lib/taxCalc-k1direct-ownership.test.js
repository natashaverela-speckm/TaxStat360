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

//
// Consistency-audit follow-up (Aug 2026): 2 of 6 tests in this file were still
// unlabeled — the ARCHITECTURE §6 tail left over from the Aug 2026 Module C
// backfill (that pass covered the 8 fully-unlabeled taxCalc-* files; this one
// was already mostly labeled, so it wasn't in scope for that batch). Now fully
// CHAR: labeled. None promoted to SPEC — that requires independently
// re-verifying each expected value against its cited authority.

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

  it('CHAR: a 60%-owned K-1-direct partner is taxed on the full $132,000 Box 1 share, not $79,200', () => {
    const sixty   = call([k1DirectPartner(60, 132000)])
    const hundred = call([k1DirectPartner(100, 132000)])
    expect(sixty.seNetIncome).toBe(132000)
    expect(sixty.seNetIncome).toBe(hundred.seNetIncome) // Ownership % must not matter once Box 1 is the allocated share
    expect(sixty.agi).toBe(hundred.agi)
    expect(sixty.agi).toBeCloseTo(132000 - sixty.halfSE, 0) // sanity: full $132k reaches AGI, not $79.2k
  })
  it('CHAR: QBI basis also reflects the unscaled $132,000, not $79,200', () => {
    const r = call([k1DirectPartner(60, 132000)])
    // qbiCaps.qbi = 20% of (net SE earnings less half-SE-tax), per Section 199A(c)(3)(B) --
    // NOT a bare 20% of $132,000, and (this is the regression guard) nowhere near the
    // old bug's 20% of the double-prorated $79,200 (= $15,840).
    const expected = (132000 - r.halfSE) * 0.20
    expect(r.qbiCaps.qbi).toBeCloseTo(expected, 0)
    expect(r.qbiCaps.qbi).toBeGreaterThan(79200 * 0.20)
  })
})

// ─── FOURTH READ R-4 (14 Sep 2026): synced entities always scale by Ownership % ────────
//
// An entity whose P&L was pulled from accounting software (connectedId set) holds the
// ENTITY's books. If a stale `k1` override (loaded record) or `k1DirectMode: true` (manual
// K-1 entry made before the sync) survives on that object, the resolver used to treat the
// whole net as the owner's share. Verified live: a FreshBooks S-Corp at 50% ownership flowed
// 100% of its −$481,660 loss into Step 2 ($441,660 suspended against $40,000 of basis
// instead of $200,830). Both leftovers are ignored for a synced entity, and the sync path in
// CalculateTaxInner strips them.

describe('R-4 -- getEntityK1Share() ignores stale share shortcuts on a synced entity', () => {
  const synced = (extra = {}) => ({
    type: 'S Corporation', own: 50, connectedId: 'freshbooks', isManual: false,
    pnl: { grossRevenue: 7642, totalExpenses: 489302, netProfit: -481660 },
    ...extra,
  })

  it('SPEC: synced entity at 50% → half the net (§1366(a)(1): pro rata share)', () => {
    expect(getEntityK1Share(synced())).toBe(-240830)
  })

  it('SPEC: a leftover k1DirectMode flag does not stop the scaling once the entity is synced', () => {
    expect(getEntityK1Share(synced({ k1DirectMode: true }))).toBe(-240830)
  })

  it('SPEC: an explicit k1 on a synced entity is HONORED — it is the engine\'s own §1366(d) basis-limited figure (second pass, review finding 1)', () => {
    expect(getEntityK1Share(synced({ k1: -40000 }))).toBe(-40000)
  })

  it('SPEC: end-to-end — a synced S-Corp loss with $0 basis is fully suspended and the QBI/SE bases see the LIMITED loss, exactly as an unsynced entity', () => {
    const mk = (extra) => [
      { type: 'S Corporation', own: 50, pnl: { netProfit: -481660 }, ...extra },
      { type: 'Sole Proprietor / SMLLC', own: 100, pnl: { netProfit: 200000 } },
    ]
    const run = (extra) => calcTaxReturn({ taxYear: 2025, status: 'single', w2: 0, assumeZeroBasisOnLoss: true,
      k1Total: sumK1FlowThrough(mk(extra)), entities: mk(extra) })
    const synced = run({ connectedId: 'freshbooks', isManual: false })
    const manual = run({})
    expect(synced.totalSuspendedLoss).toBe(240830)
    expect(synced.totalTax).toBe(manual.totalTax)
    expect(synced.qbiBasis).toBe(manual.qbiBasis)
    expect(synced.seNetIncome).toBe(200000)
  })

  it('CHAR: manual K-1-direct entities keep the Finding-2 contract (Box 1 is already the share)', () => {
    expect(getEntityK1Share({ type: 'Partnership / LLC', own: 60, k1DirectMode: true, pnl: { netProfit: 132000 } })).toBe(132000)
    expect(getEntityK1Share({ type: 'Partnership / LLC', own: 60, k1: 132000, pnl: { netProfit: 220000 } })).toBe(132000)
  })

  it('SPEC: end-to-end — the §1366(d) limitation sees the owner\'s share, not the entity total', () => {
    const r = calcTaxReturn({
      taxYear: 2026, status: 'single', w2: 150000,
      k1Total: sumK1FlowThrough([synced({ k1DirectMode: true, stockBasis: 40000 })]),
      entities: [synced({ k1DirectMode: true, stockBasis: 40000 })],
      assumeZeroBasisOnLoss: true,
    })
    // owner's share −240,830; basis 40,000 → 40,000 deducted, 200,830 suspended
    expect(r.totalSuspendedLoss).toBe(200830)
    expect(r.agi).toBe(110000)
  })
})
