// AUDIT F2 REGRESSION TEST (second root cause) — the seam the unit suite missed.
//
// scenarioCompare.test.js exercises compareEntityScenarios with ENGINE-vocabulary
// inputs (status, w2, intInc…), so it stayed green while the live modal fed the
// engine SESSION-vocabulary keys from readPersonalContext() (filingStatus,
// w2Income, interest…) and every scenario's totalTax came back null → rendered
// as "$0" on all three cards. This test pins the translation layer:
//   session context → toEngineContext() → compareEntityScenarios → finite totals.
import { describe, it, expect } from 'vitest'
import { toEngineContext } from './EntityCompareModal.jsx'
import { compareEntityScenarios } from '../lib/scenarioCompare.js'

const sCorpEntity = {
  type: 'S Corporation', own: '100', k1: 170000, netProfit: 170000,
  officerW2: 80000,
  pnl: { grossRevenue: 500000, totalExpenses: 330000, officerSalary: 80000, netProfit: 170000 },
}

// What readPersonalContext() actually returns (session vocabulary, string-ish values).
const sessionContext = {
  filingStatus: 'single', taxYear: 2025, dependents: '2',
  w2Income: '50,000', w2Withheld: '20,000', estPaid: '10,000',
  interest: '', dividends: '', qualDividends: '', qualifiedDividends: '',
  capitalGains: '', stGain: '', form4797: '',
  isREP: false, useItemized: false, itemizedAmt: '',
}

describe('toEngineContext translation (AUDIT F2, second root cause)', () => {
  it('maps session keys to the engine vocabulary', () => {
    const e = toEngineContext(sessionContext, [sCorpEntity], 0)
    expect(e.status).toBe('single')
    expect(e.w2).toBe(50000)              // compared entity's officer W-2 excluded (per-scenario)
    expect(e.dependents).toBe(2)
    expect(e.w2Withheld).toBe(20000)
    expect(e.ytdFactor).toBe(1)
  })

  it('adds OTHER entities\' officer W-2 to the base wage, not the compared entity\'s', () => {
    const otherSCorp = { ...sCorpEntity, officerW2: 30000, pnl: { ...sCorpEntity.pnl, officerSalary: 30000 } }
    const e = toEngineContext(sessionContext, [sCorpEntity, otherSCorp], 0)
    expect(e.w2).toBe(80000)              // 50,000 typed + 30,000 from the other entity
  })

  it('annualizes on the same YTD basis as the filed return', () => {
    const e = toEngineContext({ ...sessionContext, ytdMode: true, ytdMonth: 3 }, [sCorpEntity], 0)
    expect(e.ytdFactor).toBe(4)
  })

  it('session-vocabulary context yields finite, non-zero totals for all three scenarios', () => {
    const result = compareEntityScenarios({
      personalContext: toEngineContext(sessionContext, [sCorpEntity], 0),
      entities: [sCorpEntity],
      entityIdx: 0,
      netProfitShare: 250000,
    })
    expect(result.scenarios).toHaveLength(3)
    for (const s of result.scenarios) {
      expect(Number.isFinite(s.totalTax)).toBe(true)
      expect(s.totalTax).toBeGreaterThan(0)
    }
    // Ranking sanity for this profile: the S-Corp beats sole prop (SE-tax savings).
    const byKey = Object.fromEntries(result.scenarios.map(s => [s.key, s.totalTax]))
    expect(byKey.sCorp).toBeLessThan(byKey.soleProp)
  })

  it('raw session context degrades gracefully (post-hardening) but still loses its inputs — translation remains required', () => {
    // AUDIT HARDENING UPDATE (Jul 2026): the engine previously produced NaN totals when
    // fed untranslated session keys, because calcAMT indexed exemption/phaseoutStart by
    // an undefined `status`. The engine now defaults status='single' and calcAMT falls
    // back per filing status, so totals are FINITE even for untranslated context — the
    // failure mode this test documented no longer exists. What is still true, and what
    // this test now documents: untranslated context silently DROPS its inputs (w2Income
    // is not w2, filingStatus is not status), so the numbers are wrong — translation
    // through toEngineContext is still required for correctness, just no longer for
    // finiteness.
    const raw = compareEntityScenarios({
      personalContext: sessionContext,   // deliberately untranslated
      entities: [sCorpEntity],
      entityIdx: 0,
      netProfitShare: 250000,
    })
    raw.scenarios.forEach(s => expect(Number.isFinite(s.totalTax)).toBe(true))
    const translated = compareEntityScenarios({
      personalContext: toEngineContext(sessionContext, [sCorpEntity], 0),
      entities: [sCorpEntity],
      entityIdx: 0,
      netProfitShare: 250000,
    })
    // The untranslated run ignored the $50,000 W-2 (w2Income key) — totals must differ.
    expect(raw.scenarios[0].totalTax).not.toBe(translated.scenarios[0].totalTax)
  })
})

// ─── Third pass (14 Sep 2026, live check): the comparison must run on the SELECTED year ──
describe('toEngineContext — tax year (third pass, 14 Sep 2026)', () => {
  it('SPEC: a 2025 Schedule C $100,000 single baseline compares at $22,629 (2025 tables), not $22,365 (2026 tables)', () => {
    const schC = { type: 'Sole Proprietor / SMLLC', own: '100', pnl: { grossRevenue: 100000, totalExpenses: 0, officerSalary: 0, netProfit: 100000 } }
    const ctx25 = toEngineContext({ filingStatus: 'single', taxYear: 2025 }, [schC], 0)
    expect(ctx25.taxYear).toBe(2025)
    const r25 = compareEntityScenarios({ personalContext: ctx25, entities: [schC], entityIdx: 0, netProfitShare: 100000, officerSalary: 30000 })
    const sp25 = (r25.scenarios || r25).find ? (r25.scenarios || r25).find(s => /sole/i.test(s.label || s.type || s.name || '')) : null
    // 2025: SE 14,130; AGI 92,935; TI before QBI 77,185; QBI capped at 20% × 77,185 = 15,437; TI 61,748; tax 8,499 → 22,629
    const total25 = sp25 ? (sp25.totalTax ?? sp25.total) : null
    expect(total25).toBe(22629)
    const ctx26 = toEngineContext({ filingStatus: 'single', taxYear: 2026 }, [schC], 0)
    const r26 = compareEntityScenarios({ personalContext: ctx26, entities: [schC], entityIdx: 0, netProfitShare: 100000, officerSalary: 30000 })
    const sp26 = (r26.scenarios || r26).find(s => /sole/i.test(s.label || s.type || s.name || ''))
    expect(sp26.totalTax ?? sp26.total).toBe(22365)
  })
})
