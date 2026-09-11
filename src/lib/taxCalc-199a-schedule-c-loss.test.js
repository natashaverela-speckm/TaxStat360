// src/lib/taxCalc-199a-schedule-c-loss.test.js
//
// FRESH-EYES F-5 (second-opinion review, 11 Sep 2026) — A SCHEDULE C LOSS NEVER
// REACHED THE §199A COMPUTATION, AND A PHASED-OUT SSTB LOSS STILL ATE OTHER QBI.
//
// seNetIncome is floored at zero for SE-tax purposes (correct — there is no negative
// SE tax). seK1AfterAdjustments, the QBI base for SE-subject entities, was derived from
// that floored figure, so a net Schedule C loss was silently dropped from §199A:
//
//   • §199A(c)(2), first sentence — it did not net against the taxpayer's other QBI in
//     the same year. S-Corp +200,000 with Sch C −50,000 gave qbiBasis 200,000.
//   • §199A(c)(2), second sentence — it did not carry forward. −100,000 in an S-Corp
//     carried 100,000; the identical loss on Schedule C carried 0.
//
// Separately, _calcQBI's sstbEntityQBI floored each SSTB share at zero, so a phased-out
// SSTB running a LOSS was excluded from the applicable-percentage haircut and its loss
// kept reducing other qualified income — the opposite of §199A(d)(3), under which none of
// a fully phased-out SSTB's items are taken into account.
//
// And the C1 carryforward quantity (`sstbNonSEQbiReduction`, now `sstbQbiReduction`)
// skipped SE_SUBJECT_TYPES, so §199A(d)(3)'s exclusion of a phased-out SSTB loss from the
// carryforward applied to S-Corps and not to sole proprietorships.
//
// Test labels (ARCHITECTURE §6): SPEC — independently verified against the cited
// authority. CHAR — freezes current behaviour.
//
// Authority: IRC §199A(c)(2); §199A(d)(3)(A); Treas. Reg. §1.199A-1(d)(2)(iii)(A);
// Form 8995 line 3 / Form 8995-A Schedule C (Loss Netting and Carryforward).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { calcTaxReturn } from './taxCalc.js'

const mk    = (o = {}) => ({ type: 'S Corporation', own: 100, box17V_ubia: 0, box11_12: 0, box12_13: 0, ...o })
const sstb  = (k1, w) => mk({ box17V_sstb: true,  netProfit: k1, k1, box17V_wages: w })
const clean = (k1, w) => mk({ box17V_sstb: false, netProfit: k1, k1, box17V_wages: w })
const schC  = (k1, s = false) => mk({ type: 'Sole Proprietorship', box17V_sstb: s, netProfit: k1, k1, box17V_wages: 0 })

describe('F-5 — a Schedule C loss carries forward exactly as the same loss in an S-Corp does', () => {
  it('SPEC: §199A(c)(2) — a non-SSTB Schedule C loss above the threshold carries forward in full', () => {
    const r = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 400000, k1Total: -100000, entities: [schC(-100000)] })
    expect(r.qbiCarryforward).toBe(100000)   // was 0
    expect(r.seTax).toBe(0)                  // SE tax is untouched — still floored at zero
  })

  it('SPEC: the Schedule C and S-Corp answers are identical for the same loss', () => {
    const c = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 400000, k1Total: -100000, entities: [schC(-100000)] })
    const s = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 400000, k1Total: -100000, entities: [clean(-100000, 0)] })
    expect(c.qbiCarryforward).toBe(s.qbiCarryforward)
  })

  it('SPEC: §199A(d)(3) — a fully phased-out Schedule C SSTB loss does NOT carry forward', () => {
    const r = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 400000, k1Total: -100000, entities: [schC(-100000, true)] })
    expect(r.qbiCarryforward).toBe(0)
  })

  it('SPEC: a partially phased-out Schedule C SSTB loss carries forward its applicable share — same as the S-Corp case', () => {
    const c = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 350000, k1Total: -100000, entities: [schC(-100000, true)] })
    const s = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 350000, k1Total: -100000, entities: [sstb(-100000, 0)] })
    expect(c.qbiCarryforward).toBeGreaterThan(20000)
    expect(c.qbiCarryforward).toBeLessThan(40000)
    expect(c.qbiCarryforward).toBe(s.qbiCarryforward)
  })
})

describe('F-5 — a Schedule C loss nets against other QBI in the same year', () => {
  const scorp = clean(200000, 80000)

  it('SPEC: §199A(c)(2) — S-Corp +200,000 with Schedule C −50,000 gives a QBI base of 150,000', () => {
    const alone = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 150000, k1Total: 200000, entities: [scorp] })
    const both  = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 150000, k1Total: 150000, entities: [scorp, schC(-50000)] })
    expect(alone.qbiBasis).toBe(200000)
    expect(both.qbiBasis).toBe(150000)      // was 200,000
    // 20% × 150,000 = 30,000 binds below the 50%-of-wages limit (40,000).
    expect(both.qbi).toBe(30000)
    expect(alone.qbi).toBe(40000)
  })

  it('CHAR: a positive Schedule C is unchanged — base is net of ½SE, SEHI and retirement', () => {
    const r = calcTaxReturn({ taxYear: 2025, status: 'single', k1Total: 120000, entities: [schC(120000)] })
    expect(r.qbiBasis).toBeGreaterThan(105000)
    expect(r.qbiBasis).toBeLessThan(120000)
    expect(r.seTax).toBeGreaterThan(0)
  })

  it('SPEC: §1402 — guaranteed payments net inside the SE figure but are removed from QBI in both signs', () => {
    // −100,000 distributive share + 60,000 GP: NESE −40,000 (SE tax 0); QBI loss −100,000.
    const p = mk({ type: 'Partnership / LLC', box17V_sstb: false, netProfit: -100000, k1: -100000, box17V_wages: 0, guaranteedPayments: 60000 })
    const r = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 400000, k1Total: -100000, entities: [p] })
    expect(r.seTax).toBe(0)
    expect(r.qbiCarryforward).toBe(100000)
  })
})

describe('F-5 — a phased-out SSTB LOSS no longer reduces the other businesses\' QBI', () => {
  it('SPEC: §199A(d)(3) — clean S-Corp +200,000 with a fully phased-out SSTB S-Corp −100,000 deducts 40,000', () => {
    const both  = calcTaxReturn({ taxYear: 2026, status: 'mfj', w2: 600000, k1Total: 100000, entities: [clean(200000, 150000), sstb(-100000, 0)] })
    const alone = calcTaxReturn({ taxYear: 2026, status: 'mfj', w2: 600000, k1Total: 100000, entities: [clean(200000, 150000)] })
    expect(both.qbi).toBe(40000)            // was 20,000
    expect(both.qbi).toBe(alone.qbi)
  })
})

describe('F-5 — the C1 spec cases still hold (regression)', () => {
  it('SPEC: mid phase-in SSTB still deducts 25,535', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', k1Total: 255350, entities: [sstb(255350, 200000)] })
    expect(r.qbi).toBe(25535)
    expect(r.fedTax).toBe(44845)
  })
  it('SPEC: phased-out SSTB beside an unrelated business still deducts 40,000', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'mfj', k1Total: 600000, entities: [sstb(400000, 300000), clean(200000, 150000)] })
    expect(r.qbi).toBe(40000)
    expect(r.fedTax).toBe(122269)
  })
})

describe('F-5 — the defect cannot be reintroduced silently', () => {
  const strip = (code) => code.replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '')
  const src = () => strip(readFileSync(new URL('./taxCalc.js', import.meta.url), 'utf8'))

  it('the SE QBI base is not derived solely from the floored seNetIncome', () => {
    const s = src()
    expect(s).toMatch(/const _seQbiAggregate = seNetIncomeAggregate \+ guaranteedPaymentsTotal/)
    expect(s).toMatch(/const seK1AfterAdjustments = _seQbiAggregate >= 0/)
    expect(s).not.toMatch(/const seK1AfterAdjustments = Math\.max\(0, seNetIncome/)
  })
  it('the SSTB carryforward reduction no longer skips SE-subject entities', () => {
    const s = src()
    const start = s.indexOf('const sstbQbiReduction = entitiesLimited.reduce')
    const body = s.slice(start, s.indexOf('}, 0)', start))
    expect(body).not.toMatch(/SE_SUBJECT_TYPES\.includes\(e\?\.type\)\)\s*return sum/)
  })
  it('_calcQBI does not floor the SSTB share at zero', () => {
    const s = src()
    const start = s.indexOf('const sstbEntityQBI = entityQbiData.reduce')
    const body = s.slice(start, s.indexOf('}, 0)', start))
    expect(body).not.toMatch(/Math\.max\(0,\s*k1Income\)/)
  })
})
