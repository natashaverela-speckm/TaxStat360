// src/taxCalc-sec179.test.js
//
// M3 (audit F-03 / F-04, Jul 2026) — §179 business-income limitation and
// flow-through K-1 aggregation, extracted from components into the engine.
//
// Labels (ARCHITECTURE §6):
//   SPEC: <citation> — value independently verified against the cited authority.
//   CHAR             — freezes current behavior. Every CHAR expectation below was
//                      HAND-COMPUTED by executing the ORIGINAL inline formulas
//                      (AIAnalysis.jsx ~159–166 and CalculateTaxInner.jsx k1Total
//                      reduces, pre-extraction) on the fixture — so a green run
//                      proves the extraction is verbatim-equivalent.

import { describe, it, expect } from 'vitest'
import { calc179Limitation, sumK1FlowThrough } from './taxCalc.js'
import { getEntityPnlNet, getEntityPnlNetShare } from '../utils/entityPredicates.js'

// ─── getEntityPnlNet / getEntityPnlNetShare (audit F-04) ───────────────────────

describe('getEntityPnlNet — the P&L derivation rule (single source)', () => {

  it('stored netProfit wins over derivation (CHAR)', () => {
    expect(getEntityPnlNet({ pnl: { netProfit: '80000', grossRevenue: '300000', totalExpenses: '100000' } }))
      .toBe(80000)
  })

  it('derives grossRevenue − totalExpenses when netProfit absent (CHAR)', () => {
    expect(getEntityPnlNet({ pnl: { grossRevenue: '300000', totalExpenses: '100000' } }))
      .toBe(200000)
  })

  it('comma-formatted strings parse fully — nf(), not parseFloat (CHAR)', () => {
    // parseFloat('1,250,000') === 1 — the drift hazard the inline copies avoided
    // by using nf(); the helper must preserve that.
    expect(getEntityPnlNet({ pnl: { netProfit: '1,250,000' } })).toBe(1250000)
    expect(getEntityPnlNet({ pnl: { grossRevenue: '1,000,000', totalExpenses: '250,000' } })).toBe(750000)
  })

  it('missing pnl → 0; does NOT read legacy e.netProfit (CHAR)', () => {
    // The inline expression this replaces read only e.pnl — a legacy top-level
    // netProfit is getEntityNetProfit()'s concern, not this rule's.
    expect(getEntityPnlNet({})).toBe(0)
    expect(getEntityPnlNet(null)).toBe(0)
    expect(getEntityPnlNet({ netProfit: 50000 })).toBe(0)
  })

  it('negative derived net (loss) flows through (CHAR)', () => {
    expect(getEntityPnlNet({ pnl: { grossRevenue: '40000', totalExpenses: '90000' } })).toBe(-50000)
  })
})

describe('getEntityPnlNetShare — rounded ownership share', () => {

  it('Math.round(net × own% / 100), identical to the inline pattern (CHAR)', () => {
    const e = { own: '50', pnl: { netProfit: '100001' } }
    expect(getEntityPnlNetShare(e)).toBe(50001)   // round(50000.5) = 50001
  })

  it('missing ownership defaults to 100%; explicit 0% stays 0 (F-M02) (CHAR)', () => {
    expect(getEntityPnlNetShare({ pnl: { netProfit: '80000' } })).toBe(80000)
    expect(getEntityPnlNetShare({ own: '0', pnl: { netProfit: '80000' } })).toBe(0)
  })
})

// ─── sumK1FlowThrough (audit F-04 — was 3 copies in CalculateTaxInner) ─────────

describe('sumK1FlowThrough — flow-through k1Total rule', () => {

  const entities = [
    { type: 'S Corp', own: '100', box11_12: '20000', box12_13: '5000',
      pnl: { netProfit: '150000' } },
    { type: 'Partnership / LLC', own: '50', box11_12: '0',
      pnl: { grossRevenue: '200000', totalExpenses: '80000' } },
    { type: 'C Corp', own: '100', pnl: { netProfit: '999999' } },   // must be skipped
  ]

  it('sums owner shares net of §179, skipping C-Corps (CHAR)', () => {
    // Hand-computed from the original inline reduce:
    //   S Corp:      round(150000 × 1.0) − 20000 = 130000
    //   Partnership: round(120000 × 0.5) − 0     =  60000
    //   C Corp:      skipped
    expect(sumK1FlowThrough(entities)).toBe(190000)
  })

  it('charitable (box12_13) is NOT netted — Schedule A item (SPEC: audit F-13; §702(a)/§1366(a)(1)(A) separately-stated treatment)', () => {
    const withCharity    = [{ type: 'S Corp', own: '100', box12_13: '10000', pnl: { netProfit: '100000' } }]
    const withoutCharity = [{ type: 'S Corp', own: '100',                    pnl: { netProfit: '100000' } }]
    expect(sumK1FlowThrough(withCharity)).toBe(sumK1FlowThrough(withoutCharity))
  })

  it('null entities are skipped; empty/invalid input → 0 (CHAR + hardening)', () => {
    expect(sumK1FlowThrough([null, { type: 'S Corp', own: '100', pnl: { netProfit: '50000' } }])).toBe(50000)
    expect(sumK1FlowThrough([])).toBe(0)
    expect(sumK1FlowThrough(undefined)).toBe(0)
  })
})

// ─── calc179Limitation (audit F-03 — was inline in AIAnalysis.jsx) ─────────────

describe('calc179Limitation — §179(b)(3) business-income limitation', () => {

  it('§179 fully allowed when active business income covers it (CHAR)', () => {
    // Original inline formula, hand-executed:
    //   totalSec179 = 30000; totalBox12_13 = 0
    //   k1ActiveIncome = 100000 + 30000 + 0 = 130000
    //   totalOfficerSalary = 60000
    //   activeBusinessIncome = max(0, 130000 + 50000 + 60000) = 240000
    //   sec179Allowed = min(30000, 240000) = 30000; disallowed = 0
    //   k1Capped = 130000 − 30000 − 0 = 100000
    const r = calc179Limitation({
      k1NonPassive: 100000,
      w2Income: 50000,
      entities: [{ type: 'S Corp', box11_12: '30000', pnl: { officerSalary: '60000' } }],
    })
    expect(r.totalSec179).toBe(30000)
    expect(r.activeBusinessIncome).toBe(240000)
    expect(r.sec179Allowed).toBe(30000)
    expect(r.sec179Disallowed).toBe(0)
    expect(r.k1Capped).toBe(100000)
  })

  it('§179 limited by low active business income; excess carries (SPEC: §179(b)(3)(A)–(B))', () => {
    // K-1 loss year: k1NonPassive = −40000 (already net of the 50000 §179)
    //   k1ActiveIncome = −40000 + 50000 + 0 = 10000
    //   activeBusinessIncome = max(0, 10000 + 0 + 0) = 10000
    //   sec179Allowed = min(50000, 10000) = 10000; disallowed = 40000
    //   k1Capped = 10000 − 10000 − 0 = 0  (= k1NonPassive + disallowed)
    const r = calc179Limitation({
      k1NonPassive: -40000,
      w2Income: 0,
      entities: [{ type: 'Partnership / LLC', box11_12: '50000' }],
    })
    expect(r.sec179Allowed).toBe(10000)
    expect(r.sec179Disallowed).toBe(40000)
    expect(r.k1Capped).toBe(0)
    expect(r.k1Capped).toBe(-40000 + r.sec179Disallowed)   // invariant per §179(b)(3)(B)
  })

  it('W-2 wages count toward the income limit (SPEC: §179(b)(3)(A); Treas. Reg. §1.179-2(c)(6)(iv) — employee wages are active-conduct income)', () => {
    const noW2   = calc179Limitation({ k1NonPassive: -40000, w2Income: 0,
      entities: [{ box11_12: '50000' }] })
    const withW2 = calc179Limitation({ k1NonPassive: -40000, w2Income: 100000,
      entities: [{ box11_12: '50000' }] })
    expect(noW2.sec179Allowed).toBe(10000)
    expect(withW2.sec179Allowed).toBe(50000)   // fully allowed once wages lift the limit
    expect(withW2.sec179Disallowed).toBe(0)
  })

  it('charitable add-back is a wash in k1Capped but raises the income proxy (CHAR)', () => {
    //   totalSec179 = 20000; totalBox12_13 = 15000
    //   k1ActiveIncome = 0 + 20000 + 15000 = 35000
    //   activeBusinessIncome = 35000 → allowed = 20000, disallowed = 0
    //   k1Capped = 35000 − 20000 − 15000 = 0 (= k1NonPassive)
    const r = calc179Limitation({
      k1NonPassive: 0, w2Income: 0,
      entities: [{ box11_12: '20000', box12_13: '15000' }],
    })
    expect(r.sec179Allowed).toBe(20000)
    expect(r.k1Capped).toBe(0)
  })

  it('zero active business income disallows all §179 (CHAR)', () => {
    //   k1ActiveIncome = −60000 + 30000 = −30000; ABI = max(0, −30000) = 0
    //   allowed = 0; disallowed = 30000; k1Capped = −30000 − 0 − 0 = −30000
    const r = calc179Limitation({
      k1NonPassive: -60000, w2Income: 0,
      entities: [{ box11_12: '30000' }],
    })
    expect(r.activeBusinessIncome).toBe(0)
    expect(r.sec179Allowed).toBe(0)
    expect(r.sec179Disallowed).toBe(30000)
    expect(r.k1Capped).toBe(-30000)
  })

  it('null entities and empty input are safe (hardening — inline formula would have thrown)', () => {
    const r = calc179Limitation({ k1NonPassive: 5000, entities: [null, { box11_12: '1000' }] })
    expect(r.totalSec179).toBe(1000)
    expect(calc179Limitation().k1Capped).toBe(0)
  })
})

// ═══ T-3 (owner-approved Jul 8 2026): §179(b)(1)/(b)(2) DOLLAR LIMITATION ═══
// SPEC tests — every expected value hand-computed from the cited primary source.
describe('SPEC §179(b)(1)/(b)(2) — annual dollar limitation and phase-out', () => {
  const ample = { k1NonPassive: 9_000_000, w2Income: 0 }
  const ent = (sec179) => [{ box11_12: sec179, pnl: {} }]

  it('SPEC-179D-1 [Rev. Proc. 2025-32]: 2026 elected $3.0M, ample income → allowed $2,560,000; $440,000 disallowed', () => {
    const r = calc179Limitation({ ...ample, entities: ent(3_000_000), taxYear: 2026 })
    expect(r.sec179DollarLimit).toBe(2_560_000)
    expect(r.sec179Allowed).toBe(2_560_000)
    expect(r.sec179Disallowed).toBe(440_000)
  })

  it('SPEC-179D-2 [§179(b)(2)]: 2026 elected $4.3M → reduction $210K → limit $2,350,000', () => {
    const r = calc179Limitation({ ...ample, entities: ent(4_300_000), taxYear: 2026 })
    expect(r.phaseOutReduction).toBe(210_000)   // 4,300,000 − 4,090,000
    expect(r.sec179DollarLimit).toBe(2_350_000) // 2,560,000 − 210,000
    expect(r.sec179Allowed).toBe(2_350_000)
  })

  it('SPEC-179D-3 [§179(b)(2)]: 2026 elected $6.65M → limit fully phased out to $0', () => {
    const r = calc179Limitation({ ...ample, entities: ent(6_650_000), taxYear: 2026 })
    expect(r.phaseOutReduction).toBe(2_560_000)
    expect(r.sec179DollarLimit).toBe(0)
    expect(r.sec179Allowed).toBe(0)
    expect(r.sec179Disallowed).toBe(6_650_000)
  })

  it('SPEC-179D-4 [interaction]: below the cap the (b)(3) income limit still governs — elected $500K, pre-§179 income $400K → allowed $400K', () => {
    // Contract note: k1NonPassive arrives NET of §179 (the function adds the
    // election back). Pre-§179 active income of $400K with a $500K election
    // therefore means k1NonPassive = 400,000 − 500,000 = −100,000.
    const r = calc179Limitation({ k1NonPassive: -100_000, w2Income: 0, entities: ent(500_000), taxYear: 2026 })
    expect(r.sec179DollarLimit).toBe(2_560_000)
    expect(r.sec179Allowed).toBe(400_000)       // income limit binds, not the dollar limit
    expect(r.sec179Disallowed).toBe(100_000)    // carries forward per §179(b)(3)(B)
  })

  it('SPEC-179D-5 [P.L. 119-21 §70306]: 2025 statutory reset — elected $2.6M → allowed $2,500,000', () => {
    const r = calc179Limitation({ ...ample, entities: ent(2_600_000), taxYear: 2025 })
    expect(r.sec179Allowed).toBe(2_500_000)
  })

  it('SPEC-179D-6 [Rev. Proc. 2023-34]: 2024 — elected $1.3M → allowed $1,220,000', () => {
    const r = calc179Limitation({ ...ample, entities: ent(1_300_000), taxYear: 2024 })
    expect(r.sec179Allowed).toBe(1_220_000)
  })

  it('SPEC-179D-7 [regression]: under-cap elections are untouched — the pre-T-3 contract holds exactly', () => {
    const r = calc179Limitation({ k1NonPassive: 300_000, w2Income: 80_000, entities: ent(50_000), taxYear: 2026 })
    expect(r.sec179Allowed).toBe(50_000)
    expect(r.sec179Disallowed).toBe(0)
  })
})
