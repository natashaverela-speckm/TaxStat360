// src/taxCalc-qbi-min400.test.js
//
// AUDIT #3 — OBBBA §199A(i) $400 minimum QBI deduction eligibility.
//
// The minimum applies only to a taxpayer with >= $1,000 of QBI from one or more
// ACTIVE qualified trades or businesses in which they materially participate
// (P.L. 119-21 §70105, effective tax years beginning after 12/31/2025). The engine
// includes POSITIVE passive rental income in the QBI basis, so the floor's
// eligibility figure must be the ACTIVE portion only — otherwise a passive-rental-only
// filer wrongly collects $400 instead of the normal 20% deduction.
//
// SPEC tests below are verified against §199A(i) as amended by OBBBA.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn, calcQBI } from './taxCalc.js'

const BASE = {
  taxYear: 2026, status: 'single', dependents: 0, entities: [],
  w2: 0, k1Total: 0, rentalNet: 0, stGain: 0, ltGain: 0, intInc: 0,
  divInc: 0, qualDiv: 0, f4797Inc: 0, taxableSS: 0, iraIncome: 0,
}

describe('§199A(i) $400 minimum — active-participation gate (audit #3)', () => {
  // SPEC: §199A(i) — a passive rental is not an active trade/business, so the
  // $400 floor may NOT apply; the deduction is the ordinary 20% (20% × 1,500 = 300).
  it('passive rental ($1,500 QBI, non-REP) does NOT get the $400 floor', () => {
    const r = calcTaxReturn({ ...BASE, w2: 40000, rentalNet: 1500, rentalQbiEligible: true, isREP: false })
    expect(r.qbi).toBe(300)
    expect(r.qbiLimitApplied).not.toBe('min400')
  })

  // SPEC: §199A(i) — an active sole proprietorship (material participation) with the
  // same tiny QBI DOES qualify for the $400 minimum.
  it('active sole-prop ($1,500 QBI) DOES get the $400 floor', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 40000,
      entities: [{ type: 'sole-prop', own: 100,
        pnl: { netProfit: 1500, grossRevenue: 1500, totalExpenses: 0, officerSalary: 0 } }],
    })
    expect(r.qbi).toBe(400)
    expect(r.qbiLimitApplied).toBe('min400')
  })

  // SPEC: §199A(i) — a materially-participating real-estate professional's rental
  // IS active, so the floor applies to it.
  it('REP rental with material participation ($1,500 QBI) gets the $400 floor', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 40000, isREP: true, isActiveParticipant: true,
      entities: [{ type: 'real-estate', own: 100, materiallyParticipates: true, qbiEligible: true,
        pnl: { netProfit: 1500, grossRevenue: 1500, totalExpenses: 0, officerSalary: 0 } }],
    })
    expect(r.qbi).toBe(400)
    expect(r.qbiLimitApplied).toBe('min400')
  })

  // Mixed: a passive rental PLUS an active business, each $800 QBI (total $1,600).
  // Only the active $800 counts toward the $1,000 active-QBI gate, so it is BELOW the
  // threshold and the floor must NOT apply — proving the gate uses active QBI, not total.
  it('passive rental + small active business: active QBI under $1,000 blocks the floor', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 40000, rentalNet: 800, rentalQbiEligible: true, isREP: false,
      entities: [{ type: 'sole-prop', own: 100,
        pnl: { netProfit: 800, grossRevenue: 800, totalExpenses: 0, officerSalary: 0 } }],
    })
    // 20% of total $1,600 QBI = $320; floor ($400) must NOT lift it (active QBI $800 < $1,000).
    expect(r.qbiLimitApplied).not.toBe('min400')
  })

  // SPEC: §199A(i) — a PASSIVE partnership interest (limited partner, no material
  // participation) is not an active trade or business, so its QBI cannot make the filer
  // eligible for the floor. (The passive variant is not selectable in the UI today — see
  // KNOWN_LIMITATIONS PASSIVE-PARTNER — so this guards the engine, not a live path.)
  it('passive partnership ($1,500 QBI) does NOT get the $400 floor', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 40000,
      entities: [{ type: 'Partnership / LLC — Passive', own: 100,
        pnl: { netProfit: 1500, grossRevenue: 1500, totalExpenses: 0, officerSalary: 0 } }],
    })
    expect(r.qbi).toBe(300)
    expect(r.qbiLimitApplied).not.toBe('min400')
  })

  // ...while an ACTIVE partnership with the same QBI still qualifies.
  it('active partnership ($1,500 QBI) DOES get the $400 floor', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 40000,
      entities: [{ type: 'Partnership / LLC', own: 100,
        pnl: { netProfit: 1500, grossRevenue: 1500, totalExpenses: 0, officerSalary: 0 } }],
    })
    expect(r.qbiLimitApplied).toBe('min400')
  })

  // Guard the underlying unit contract too: calcQBI must honor activeQbi < $1,000.
  it('calcQBI: passive-only activeQbi below $1,000 yields no floor', () => {
    const r = calcQBI(1500, 60000, 0, { status: 'single', taxYear: 2026, activeQbi: 0 })
    expect(r.deduction).toBe(300)
    expect(r.limitApplied).not.toBe('min400')
  })
})
