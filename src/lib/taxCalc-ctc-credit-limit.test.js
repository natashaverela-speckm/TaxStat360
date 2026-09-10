// src/lib/taxCalc-ctc-credit-limit.test.js
//
// AUDIT H1 (second launch audit, Sep 2026) — THE CTC CEILING WAS THE WRONG TAX.
//
// The nonrefundable child tax credit was limited to:
//     fedTax + additionalMedicare + niitAmount
//
// Two errors, running in OPPOSITE directions, so they do not reliably cancel:
//
//   1. NIIT and Additional Medicare Tax were IN the ceiling. IRC §26(a)(1) limits the
//      nonrefundable personal credits to "regular tax liability"; §26(b)(1) defines that
//      as tax imposed by CHAPTER 1. §1411 NIIT is chapter 2A; §1401(b)(2) and
//      §3101(b)(2) Additional Medicare Tax are chapters 2 and 21. Including them
//      UNDERSTATES tax.
//   2. AMT was OUT of it. §26(a)(2) expressly adds "the tax imposed by section 55(a)".
//      Omitting it OVERSTATES tax — for the ISO-exercise population above all.
//
// Schedule 8812's Credit Limit Worksheet A is the cross-check: it starts from Form 1040
// line 18 (line 16 regular tax + Schedule 2 PART I, which is AMT and excess APTC) and
// deliberately excludes Schedule 2 Part II, where NIIT, Additional Medicare Tax and SE
// tax live.
//
// Test labels (ARCHITECTURE §6): SPEC — verified against the cited authority.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

describe('H1 — NIIT and Additional Medicare Tax are not offsettable by the CTC', () => {
  // SPEC: §26(b)(1) — chapter 2A NIIT is not "regular tax liability".
  // MFJ, TY2026, 2 dependents, $300,000 interest, $288,000 itemized.
  //   AGI 300,000; taxable 12,000; fedTax 1,200; AMT 0; NIIT 1,900.
  //   Ceiling = 1,200 + 0. CTC allowed = 1,200. Total tax = 1,900 (the NIIT stands).
  const niitCase = () => calcTaxReturn({
    taxYear: 2026, status: 'mfj', dependents: 2, intInc: 300000,
    useItemized: true, itemizedAmt: 288000, entities: [],
  })

  it('SPEC: the CTC no longer wipes out the NIIT', () => {
    const r = niitCase()
    expect(r.fedTax).toBe(1200)
    expect(r.amt).toBe(0)
    expect(r.niitAmount).toBe(1900)
    expect(r.childCredit).toBe(1200)
    // Before the fix: childCredit 3,100 and totalTax 0 — the whole NIIT vanished.
    expect(r.totalTax).toBe(1900)
  })

  it('SPEC: the credit is still capped at the regular tax, not at ctcRaw', () => {
    const r = niitCase()
    expect(r.ctcRaw).toBe(4400)
    expect(r.childCredit).toBeLessThan(r.ctcRaw)
    expect(r.childCredit).toBe(Math.min(r.ctcRaw, r.fedTax + r.amt))
  })

  it('SPEC: ACTC still picks up the unused portion where earned income supports it', () => {
    // The refundable leg is unaffected by the ceiling change; it keys off unusedCTC,
    // which grows when the nonrefundable ceiling correctly shrinks.
    const r = calcTaxReturn({ taxYear: 2026, status: 'mfj', dependents: 2, w2: 30000, entities: [] })
    expect(r.actc).toBeGreaterThan(0)
    expect(r.unusedCTC).toBe(Math.max(0, r.ctcRaw - r.childCredit))
  })
})

describe('H1 — AMT is offsettable by the CTC', () => {
  // SPEC: §26(a)(2) — "the tax imposed by section 55(a)" is part of the limitation.
  // A modest wage with a large ISO spread: regular tax is small, AMT is large. Before the
  // fix the ceiling was the regular tax alone, so most of the credit was thrown away.
  const isoCase = (w2, iso) => calcTaxReturn({
    taxYear: 2026, status: 'mfj', dependents: 2, w2,
    hasISO: true, isoBargainElement: iso, entities: [],
  })

  it('SPEC: $30k wage + $400k ISO spread — full credit now allowed against AMT', () => {
    const r = isoCase(30000, 400000)
    expect(r.fedTax).toBe(0)
    expect(r.amt).toBeGreaterThan(0)
    // Old ceiling was fedTax + niit + addlMed = 0, so the credit was entirely lost.
    expect(Math.max(0, r.fedTax + r.additionalMedicare + r.niitAmount)).toBe(0)
    expect(r.childCredit).toBe(4400)
  })

  it('SPEC: $40k wage + $300k ISO spread — credit was capped at $780, now $4,400', () => {
    const r = isoCase(40000, 300000)
    expect(r.fedTax).toBe(780)
    expect(r.amt).toBeGreaterThan(0)
    expect(r.childCredit).toBe(4400)
  })

  it('the ceiling is exactly regular tax plus AMT', () => {
    const r = isoCase(60000, 500000)
    expect(r.childCredit).toBe(Math.min(r.ctcRaw, r.fedTax + r.amt))
  })
})

describe('H1 — the ordinary case is untouched', () => {
  it('a wage earner with no AMT, no NIIT and ample regular tax is unchanged', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'mfj', dependents: 2, w2: 120000, entities: [] })
    expect(r.amt).toBe(0)
    expect(r.niitAmount).toBe(0)
    expect(r.childCredit).toBe(4400)
    expect(r.totalTax).toBe(5640)
  })

  it('SE tax is still outside the ceiling — chapter 2, same reasoning as NIIT', () => {
    const r = calcTaxReturn({
      taxYear: 2026, status: 'single', dependents: 1, w2: 0,
      entities: [{ type: 'Sole Proprietor / Schedule C', own: 100, netProfit: 12000, k1: 12000 }],
      k1Total: 12000,
    })
    expect(r.seTax).toBeGreaterThan(0)
    expect(r.childCredit).toBeLessThanOrEqual(Math.max(0, r.fedTax + r.amt))
  })
})

describe('H1 — the defect cannot come back quietly', () => {
  it('the ceiling names only regular tax and AMT', () => {
    // Guard the formula itself: this is a one-line change that is easy to "simplify"
    // back, and no other test in the suite pins the base.
    const src = readSource()
    expect(src).toMatch(/const childCredit\s+= Math\.min\(ctcRaw, Math\.max\(0, fedTax \+ amt\)\)/)
    expect(src).not.toMatch(/Math\.min\(ctcRaw, Math\.max\(0, fedTax \+ additionalMedicare \+ niitAmount\)\)/)
  })

  it('childCredit is computed after amt exists', () => {
    const src = readSource()
    expect(src.indexOf('const amt = calcAMT(')).toBeLessThan(src.indexOf('const childCredit   ='))
  })
})

function readSource() {
  // eslint-disable-next-line no-undef
  const { readFileSync } = require('node:fs')
  return readFileSync(new URL('./taxCalc.js', import.meta.url), 'utf8')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}
