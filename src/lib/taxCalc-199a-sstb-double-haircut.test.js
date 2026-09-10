// src/lib/taxCalc-199a-sstb-double-haircut.test.js
//
// AUDIT C1 (second launch audit, Sep 2026) — the §199A SSTB reduction was applied TWICE.
//
// calcTaxReturn scaled each SSTB entity's K-1 by the applicable percentage when it built
// qbiBasis (taxCalc.js, inside nonSEk1), then handed that already-reduced figure to
// calcQBI — which computed the SSTB reduction again, from the GROSS K-1 share. The
// deduction collapsed to zero, and where other businesses were present it consumed their
// QBI too before clamping at zero.
//
// Only the non-SE path carried the scale. A Schedule C SSTB reaches the basis through
// seK1AfterAdjustments, which never had it, so sole props were always single-counted —
// which is why the defect survived a year of audits.
//
// Test labels (ARCHITECTURE §6):
//   SPEC — expected value independently verified against the cited authority.
//   CHAR — freezes current behaviour.
//
// Authority: IRC §199A(d)(3)(A); Treas. Reg. §1.199A-1(d)(2)(ii)-(iii). The applicable
// percentage reduces QBI, W-2 wages and UBIA ONCE; §199A(b)(2) and the phase-in reduction
// then run on those reduced amounts.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { calcTaxReturn } from './taxCalc.js'

const mk = (o = {}) => ({ type: 'S Corporation', own: 100, box17V_ubia: 0, box11_12: 0, box12_13: 0, ...o })
const sstb  = (k1, wages) => mk({ box17V_sstb: true,  netProfit: k1, k1, box17V_wages: wages })
const clean = (k1, wages) => mk({ box17V_sstb: false, netProfit: k1, k1, box17V_wages: wages })

describe('C1 — the deduction is no longer double-reduced', () => {
  // SPEC: single, TY2026, one SSTB S-Corp. K-1 255,350; entity W-2 wages 200,000.
  // Taxable income before QBI 239,250. Threshold 201,750, phase-in range 75,000, so
  // phase 50% and applicable percentage 50%.
  //   applicable-% QBI  = 255,350 × 50% = 127,675 → component 25,535
  //   applicable-% W-2  = 200,000 × 50% = 100,000 → wage limit 50,000
  //   overall cap       = 20% × 239,250 = 47,850
  //   deduction         = min(25,535, 50,000, 47,850) = 25,535
  it('SPEC: §1.199A-1(d)(2) — mid phase-in SSTB deducts 25,535, not 0', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', k1Total: 255350, entities: [sstb(255350, 200000)] })
    expect(r.taxableBeforeQBI).toBe(239250)
    expect(r.qbi).toBe(25535)
    // Before the fix: qbi 0 and fedTax 53,016 — $8,171 of overstated tax.
    expect(r.fedTax).toBe(44845)
  })

  // SPEC: MFJ, TY2026. A fully phased-out SSTB (K-1 400,000) alongside an UNRELATED
  // non-SSTB S-Corp (K-1 200,000, wages 150,000). Taxable income before QBI 567,800,
  // above 403,500 + 150,000, so the SSTB's applicable percentage is 0 and it is excluded
  // entirely. The other business is untouched by that exclusion:
  //   component  = 200,000 × 20% = 40,000
  //   wage limit = 150,000 × 50% = 75,000
  //   overall    = 20% × 567,800 = 113,560
  //   deduction  = 40,000
  it('SPEC: §199A(d)(3) — a phased-out SSTB does not consume an unrelated business QBI', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'mfj', k1Total: 600000, entities: [sstb(400000, 300000), clean(200000, 150000)] })
    expect(r.taxableBeforeQBI).toBe(567800)
    expect(r.qbi).toBe(40000)
    // Before the fix: qbi 0 and fedTax 136,269 — $14,000 of overstated tax.
    expect(r.fedTax).toBe(122269)
  })

  it('SPEC: removing the legitimate entity no longer RAISES the deduction', () => {
    // The inversion that identified the defect: with the double subtraction, deleting a
    // perfectly valid business from the return increased the deduction from 0 to 40,000.
    const both = calcTaxReturn({ taxYear: 2026, status: 'mfj', k1Total: 600000, entities: [sstb(400000, 300000), clean(200000, 150000)] })
    const onlyClean = calcTaxReturn({ taxYear: 2026, status: 'mfj', k1Total: 600000, entities: [clean(200000, 150000)] })
    expect(both.taxableBeforeQBI).toBe(onlyClean.taxableBeforeQBI)
    expect(both.qbi).toBe(onlyClean.qbi)
  })

  it('CHAR: a below-threshold SSTB is unaffected — full 20% still applies', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', k1Total: 80000, entities: [sstb(80000, 40000)] })
    expect(r.qbi).toBeGreaterThan(0)
  })

  it('CHAR: a non-SSTB entity is untouched by any of this', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', k1Total: 255350, entities: [clean(255350, 200000)] })
    expect(r.qbi).toBeGreaterThan(0)
  })
})

describe('C1 — the two consumers that legitimately want the post-SSTB figure still get it', () => {
  // §199A(d)(3) excludes a phased-out SSTB from being qualified income at all, so its
  // LOSS must not carry forward as a QBI loss. Before C1 this came for free because the
  // basis was pre-scaled; now qbiBasisAfterSstb states it explicitly. These three pin it.
  const lossSSTB  = (k1) => mk({ box17V_sstb: true,  k1, netProfit: k1, box17V_wages: 0 })
  const lossClean = (k1) => mk({ box17V_sstb: false, k1, netProfit: k1, box17V_wages: 0 })

  it('SPEC: a fully phased-out SSTB loss does not carry forward', () => {
    const r = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 400000, k1Total: -100000, entities: [lossSSTB(-100000)] })
    expect(r.qbiCarryforward).toBe(0)
  })

  it('SPEC: a partially phased-out SSTB loss carries forward only its applicable share', () => {
    const r = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 350000, k1Total: -100000, entities: [lossSSTB(-100000)] })
    expect(r.qbiCarryforward).toBeGreaterThan(20000)
    expect(r.qbiCarryforward).toBeLessThan(40000)
  })

  it('SPEC: a non-SSTB loss above the threshold still carries forward in full', () => {
    const r = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 350000, k1Total: -100000, entities: [lossClean(-100000)] })
    expect(r.qbiCarryforward).toBe(100000)
  })

  it('SPEC: §199A(i) — a fully phased-out SSTB does not clear the active-QBI floor gate', () => {
    // It must not collect the $400 minimum on income that produces $0 of QBI, and it
    // must report "no qualifying business income" rather than "no limit binds" — Aria
    // renders those two labels as opposite sentences.
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 0, k1Total: 500000, entities: [sstb(500000, 0)] })
    expect(r.qbi).toBe(0)
    expect(r.qbiLimitApplied).toBe('none')
    expect(r.qbiCaps.min400).toBeUndefined()
  })

})

describe('C1 — the defect cannot be reintroduced silently', () => {
  // Comments in taxCalc.js quote the removed line verbatim so the next reader knows what
  // not to do; strip them or the guard matches its own explanation.
  const stripComments = (code) =>
    code.replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '')
  const src = () => stripComments(readFileSync(new URL('./taxCalc.js', import.meta.url), 'utf8'))

  it('nonSEk1 does not scale the K-1 by the SSTB applicable percentage', () => {
    // The single line that caused this. If someone "restores" it, the deduction silently
    // returns to zero for every SSTB S-Corp owner and no other test necessarily fails.
    const s = src()
    const start = s.indexOf('const nonSEk1 = entitiesLimited.reduce')
    const body = s.slice(start, s.indexOf('}, 0)', start))
    expect(body).not.toMatch(/box17V_sstb\s*\?\s*sstbApplicablePct/)
    expect(body).toMatch(/return sum \+ k1\s*$/m)
  })

  it('the post-SSTB figure is computed once, separately, and used only where it belongs', () => {
    const s = src()
    expect(s).toMatch(/const sstbNonSEQbiReduction = entitiesLimited\.reduce/)
    expect(s).toMatch(/const qbiBasisAfterSstb\s+= qbiBasis - sstbNonSEQbiReduction/)
    expect(s).toMatch(/qbiCarryforward\s+= qbiBasisAfterSstb < 0/)
    // The basis handed to calcQBI must be the UNSCALED one.
    expect(s).toMatch(/calcQBI\(qbiBasis, taxableBeforeQBI, prefIncome/)
  })
})
