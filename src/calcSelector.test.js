// @vitest-environment jsdom
// src/utils/calcSelector.test.js
//
// PHASE 2.2 — the shared calculation selector.
//
// The load-bearing guarantee is the INVARIANT: a selector summary equals a
// direct engine call on the same translated input, by construction — the same
// proof style the SIM-1 repair used for the What-If Simulator. Plus the R-2
// demonstration: the figure class the old AIAnalysis local sums got wrong.

import { describe, it, expect, beforeEach } from 'vitest'
import { summarizeRecord, selectTaxSummary, buildRecordEngineInput } from './calcSelector.js'
import { calcTaxReturn } from '../taxCalc.js'
import { writePersonalContext, writeStep1State, normalizeF1040 } from './sessionState.js'

const lossYearRecord = {
  // Single filer, $200K W-2, $80,000 LT capital loss — the Pass-6 probe profile.
  f1040: { filingStatus: 'single', taxYear: '2026', w2Income: '200000', capitalGains: '-80000' },
  entities: [],
}

const multiEntityRecord = {
  f1040: { filingStatus: 'mfj', taxYear: 2026, w2Income: 90000, interest: 1200, qualDividends: 3000, dividends: 3000 },
  entities: [
    { name: 'Ops LLC', type: 'S-Corp', own: 100, k1: 120000, netProfit: 120000, officerW2: 60000 },
    { name: 'Duplex',  type: 'Real Estate', own: 100, k1: 0, netProfit: -12000 },
  ],
}

describe('selector — engine-equality invariant (SIM-1 proof style)', () => {
  it('SPEC-style invariant: summarizeRecord figures equal a direct calcTaxReturn on the same input', () => {
    const summary = summarizeRecord(multiEntityRecord)
    const direct = calcTaxReturn(buildRecordEngineInput(multiEntityRecord))
    expect(summary.ok).toBe(true)
    for (const k of ['fedTax', 'totalTax', 'agi', 'taxableIncome', 'qbi', 'seTax', 'niitAmount', 'marginalRate']) {
      expect(summary[k], k).toBe(direct[k])
    }
  })

  it('CHAR: officer W-2 and Box 17K from EVERY entity aggregate (entityIdx = -1, whole return)', () => {
    const input = buildRecordEngineInput(multiEntityRecord)
    expect(input.w2).toBe(90000 + 60000)   // personal + S-Corp officer salary
    expect(input.entities).toHaveLength(2)
  })

  it('CHAR: the summary is frozen — a selector, not a mutation channel', () => {
    const s = summarizeRecord(multiEntityRecord)
    expect(Object.isFrozen(s)).toBe(true)
  })
})

describe('selector — R-2 cure: engine-true AGI where the local card sums went wrong', () => {
  it('SPEC: §1211(b) — loss-year AGI is 197,000 per the engine; the retired local formula said 200,000', () => {
    const s = summarizeRecord(lossYearRecord)
    expect(s.ok).toBe(true)
    expect(s.agi).toBe(197000)                       // 200,000 − 3,000 allowed loss
    expect(s.capLossCarryoverLT).toBe(77000)
    // The formula the AIAnalysis cards used before Phase 2.2 — pinned as the
    // documented wrong answer this module retires: the local sum deducts the
    // FULL loss (no §1211(b) clamp), yielding 120,000 vs the lawful 197,000.
    const pc = normalizeF1040(lossYearRecord.f1040)
    const oldLocalAgi = Math.max(0, pc.w2Income + pc.capitalGains)
    expect(oldLocalAgi).toBe(120000)
    expect(oldLocalAgi).not.toBe(s.agi)
  })

  it('CHAR: §1212(b) carryforward inputs (Phase 2.1 fields) flow through the selector to the engine', () => {
    const withCarry = summarizeRecord({
      f1040: { filingStatus: 'single', taxYear: 2026, w2Income: 100000, capitalGains: 8000, capLossCarryforwardST: 5000 },
      entities: [],
    })
    expect(withCarry.ok).toBe(true)
    expect(withCarry.capitalGainNetIncluded).toBe(3000)   // 8,000 gain − 5,000 ST carryforward
    expect(withCarry.agi).toBe(103000)
  })
})

describe('selector — session variant and guard behavior', () => {
  beforeEach(() => sessionStorage.clear())

  it('CHAR: selectTaxSummary reads the live session and matches a record summary of the same data', () => {
    writePersonalContext(normalizeF1040(lossYearRecord.f1040))
    writeStep1State({ entities: [], k1Total: 0 })
    const live = selectTaxSummary()
    const rec = summarizeRecord(lossYearRecord)
    expect(live.ok).toBe(true)
    expect(live.fedTax).toBe(rec.fedTax)
    expect(live.agi).toBe(197000)
  })

  it('CHAR: a guard rejection returns { ok:false, error } instead of throwing into a card renderer', () => {
    const s = summarizeRecord({ f1040: { filingStatus: 'single', taxYear: 'not-a-year' }, entities: [] })
    // normalizeF1040 coerces taxYear, so force a genuinely invalid engine input:
    const bad = (() => {
      try {
        return summarizeRecord({ f1040: { filingStatus: 'single', w2Income: Infinity }, entities: [] })
      } catch (e) { return { threw: true } }
    })()
    expect(bad.threw).toBeUndefined()
    expect(typeof bad.ok).toBe('boolean')
    if (!bad.ok) expect(String(bad.error).length).toBeGreaterThan(0)
    expect(s.ok).toBe(true)   // coerced year is valid — guard accepts it
  })
})

describe('selector — F1/F3 cure: pass-through K-1 reaches the engine (audit Jul 2026)', () => {
  // The audit's live scenario: single-filer S-Corp, $400K receipts, $100K opex,
  // $70K officer W-2 → $230K K-1 distributions ($300K total). Before the k1Total
  // fix the selector summarized this as a $70K return (12% rate, ~$1,243/qtr) — the
  // engine ingests K-1 via top-level k1Total, which _wholeReturnExtras had omitted.
  const auditScorp = {
    f1040: { filingStatus: 'single', taxYear: 2025, w2Income: 0 },
    entities: [{ name: 'Consulting S-Corp', type: 'S-Corp', own: 100,
      pnl: { grossRevenue: 400000, totalExpenses: 100000, officerSalary: 70000, netProfit: 230000 } }],
  }
  it('SPEC: §61/§199A — gross income includes the $230K K-1 (total $300K), not W-2 alone', () => {
    const s = summarizeRecord(auditScorp)
    expect(s.ok).toBe(true)
    expect(s.grossIncome).toBe(300000)     // 70,000 W-2 + 230,000 K-1 — NOT 70,000
    expect(s.qbi).toBe(35000)              // §199A limited to 50% of $70K W-2 wages
    expect(s.taxableAfterQBI).toBe(249250) // 300,000 − 15,750 std − 35,000 QBI
  })
  it('SPEC: 2025 single brackets — federal income tax is $56,823 and the marginal rate is 32%', () => {
    const s = summarizeRecord(auditScorp)
    expect(s.fedTax).toBe(56823)           // independently verified vs. IRS 2025 single brackets
    expect(s.marginalRate).toBe(0.32)      // $249,250 is in the 32% bracket — never 12%
  })
  it('CHAR: quarterly recommendation reconciles with the liability (not ~1/10th of it)', () => {
    const s = summarizeRecord(auditScorp)
    expect(s.quarterlyRecommended).toBeGreaterThan(s.fedTax / 5)  // ≈ 14,206, i.e. ~fedTax/4
  })
  it('CHAR: still equals a direct engine call (selector adds no math of its own)', () => {
    const s = summarizeRecord(auditScorp)
    const direct = calcTaxReturn(buildRecordEngineInput(auditScorp))
    for (const k of ['grossIncome','taxableAfterQBI','qbi','fedTax','marginalRate','quarterlyRecommended'])
      expect(s[k], k).toBe(direct[k])
  })
})
