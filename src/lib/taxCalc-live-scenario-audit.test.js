// src/lib/taxCalc-live-scenario-audit.test.js
//
// LIVE-SCENARIO AUDIT (11 Sep 2026). Scenarios were entered through the production site
// as a customer would and compared, line by line, to figures computed by hand from the
// Code and the published 2025/2026 IRS numbers. Ten of eleven matched to the dollar; the
// eleventh exposed an input-hygiene gap, and a table audit found two MFS-only errors (a third
// suspected one was checked against the Revenue Procedure and was correct as shipped).
// Every figure below is a hand computation, independent of the engine.
//
// Test labels (ARCHITECTURE §6): SPEC — verified against the cited authority.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn, getTable } from './taxCalc.js'

const scorp = (k1, wages) => ({ type: 'S Corporation', own: 100, k1, netProfit: k1, box17V_wages: wages, officerW2: wages, box17V_ubia: 0, box11_12: 0, box12_13: 0 })

describe('Live scenarios reproduced — the production site and the hand computation agree', () => {
  it('SPEC: MFJ, S-Corp K-1 120,000 + officer W-2 80,000, two children — 17,218', () => {
    // Std 31,500; taxable before QBI 168,500; QBI 24,000; taxable 144,500; tax 21,618; CTC 4,400.
    const r = calcTaxReturn({ taxYear: 2025, status: 'mfj', dependents: 2, w2: 80000, k1Total: 120000, entities: [scorp(120000, 80000)] })
    expect(r.qbi).toBe(24000)
    expect(r.fedTax).toBe(21618)
    expect(r.childCredit).toBe(4400)
    expect(r.totalTax).toBe(17218)
  })

  it('SPEC: same return + LTCG 60,000 + qualified dividends 10,000 — 28,478 (§1(h) stacking, NIIT, §199A(b)(2) cap)', () => {
    // AGI 270,000; taxable 214,500; ordinary 144,500 -> 21,618; 70,000 pref @15% = 10,500; NIIT 3.8% × 20,000 = 760.
    const r = calcTaxReturn({ taxYear: 2025, status: 'mfj', dependents: 2, w2: 80000, k1Total: 120000, ltGain: 60000, divInc: 10000, qualDiv: 10000, entities: [scorp(120000, 80000)] })
    expect(r.fedTax).toBe(32118)
    expect(r.niitAmount).toBe(760)
    expect(r.totalTax).toBe(28478)
  })

  it('SPEC: single, S-Corp K-1 300,000 + officer W-2 30,000 — §199A wage limit binds at 15,000; 74,285', () => {
    const r = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 30000, k1Total: 300000, entities: [scorp(300000, 30000)] })
    expect(r.qbi).toBe(15000)
    expect(r.totalTax).toBe(74285)
  })

  it('SPEC: single sole proprietor, net profit 120,000 — 28,725', () => {
    // SE 16,955; ½SE 8,478; AGI 111,522; QBI 20% × 111,522 capped at 20% × 95,772 = 19,154; tax 11,770.
    const r = calcTaxReturn({ taxYear: 2025, status: 'single', k1Total: 120000, entities: [{ type: 'Sole Proprietor / SMLLC', own: 100, pnl: { netProfit: 120000, grossRevenue: 120000, totalExpenses: 0 } }] })
    expect(r.seTax).toBe(16955)
    expect(r.qbi).toBe(19154)
    expect(r.fedTax).toBe(11770)
    expect(r.totalTax).toBe(28725)
  })

  it('SPEC: OBBBA SALT phase-down, MFJ 2025 MAGI 550,000 — cap 40,000 − 30% × 50,000 = 25,000', () => {
    const r = calcTaxReturn({ taxYear: 2025, status: 'mfj', w2: 550000, useItemized: true, itemizedAmt: 65000, saltAmount: 45000, entities: [] })
    expect(r.itemized).toBe(45000)
    expect(r.totalTax).toBe(118545)
  })

  it('SPEC: ISO/AMT single 2025, W-2 200,000 + spread 300,000 — TMT 110,550', () => {
    const r = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 200000, hasISO: true, isoBargainElement: 300000, entities: [] })
    expect(r.fedTax).toBe(37067)
    expect(r.amt).toBe(73483)
    expect(r.totalTax).toBe(110550)
  })

  it('SPEC: CTC phase-out MFJ 2025, AGI 430,000, three children — 6,600 − 1,500 = 5,100', () => {
    const r = calcTaxReturn({ taxYear: 2025, status: 'mfj', w2: 430000, dependents: 3, entities: [] })
    expect(r.childCredit).toBe(5100)
    expect(r.totalTax).toBe(78166)
  })

  it('SPEC: 2026 tables (Rev. Proc. 2025-32) — single sole proprietor 150,000: 37,607', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', k1Total: 150000, entities: [{ type: 'Sole Proprietor / SMLLC', own: 100, pnl: { netProfit: 150000, grossRevenue: 150000, totalExpenses: 0 } }] })
    expect(r.seTax).toBe(21194)
    expect(r.qbi).toBe(24661)
    expect(r.totalTax).toBe(37607)
  })
})

describe('Input hygiene — qualified dividends are a subset of ordinary dividends', () => {
  // Form 1040 line 3a (qualified) can never exceed line 3b (ordinary). The live site let a
  // user fill only the Qualified box, then taxed that amount at 15% without ever adding it
  // to income — $700 understated on 10,000. Clamped to the ordinary-dividend figure.
  const base = { taxYear: 2025, status: 'mfj', dependents: 2, w2: 80000, k1Total: 120000, ltGain: 60000, entities: [scorp(120000, 80000)] }

  it('SPEC: qualified entered with no ordinary dividends is ignored, not carved out at 15%', () => {
    const inconsistent = calcTaxReturn({ ...base, divInc: 0, qualDiv: 10000 })
    const ltcgOnly     = calcTaxReturn({ ...base, divInc: 0, qualDiv: 0 })
    expect(inconsistent.totalTax).toBe(ltcgOnly.totalTax)
    expect(inconsistent.totalTax).toBe(26598)      // was 25,898 on the live site
  })

  it('SPEC: qualified capped at ordinary when it exceeds it', () => {
    const r = calcTaxReturn({ ...base, divInc: 4000, qualDiv: 10000 })
    const s = calcTaxReturn({ ...base, divInc: 4000, qualDiv: 4000 })
    expect(r.totalTax).toBe(s.totalTax)
  })

  it('SPEC: a consistent entry is unchanged — 28,478', () => {
    expect(calcTaxReturn({ ...base, divInc: 10000, qualDiv: 10000 }).totalTax).toBe(28478)
  })
})

describe('Table audit — MFS figures checked against the Revenue Procedures', () => {
  it('SPEC: 2025 MFS 35% bracket ends at 375,800 (Rev. Proc. 2024-40 §3.01), not 313,200', () => {
    const mfs = getTable(2025).brackets.mfs
    expect(mfs.find(([, rate]) => rate === 0.35)[0]).toBe(375800)
    // Taxable 350,000: 57,231 + 35% × 99,475 = 92,047. Under the old table the top 36,800 was taxed at 37%.
    const r = calcTaxReturn({ taxYear: 2025, status: 'mfs', w2: 365750, entities: [] })
    expect(r.fedTax).toBe(92047)
  })

  it('SPEC: 2025 MFS AMT exemption is 68,500 (Rev. Proc. 2024-40 §3.11)', () => {
    expect(getTable(2025).amt.exemption.mfs).toBe(68500)
  })

  it('SPEC: 2026 MFS §199A threshold is 201,775 — checked against Rev. Proc. 2025-32 itself', () => {
    // Questioned during this audit as a transposition of the 24% bracket top; the Revenue
    // Procedure was then read directly and it does list MFS separately at $201,775.
    // Left as a pinned SPEC so the next reader does not repeat the same doubt.
    expect(getTable(2026).qbi.threshold.mfs).toBe(201775)
  })

  it('SPEC: the MFS figures that were already right stay right', () => {
    expect(getTable(2026).brackets.mfs.find(([, rate]) => rate === 0.35)[0]).toBe(384350)
    expect(getTable(2026).amt.exemption.mfs).toBe(70100)
    expect(getTable(2025).ltcg.mfs).toEqual([48350, 300000])
  })
})
