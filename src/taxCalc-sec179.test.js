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
import { getEntityPnlNet, getEntityPnlNetShare } from './utils/entityPredicates.js'

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
