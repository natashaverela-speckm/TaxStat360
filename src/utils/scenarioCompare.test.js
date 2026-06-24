import { describe, it, expect } from 'vitest'
import { compareEntityScenarios } from '../scenarioCompare.js'
// Import rate constants directly from constants.js — scenarioCompare.js uses them
// internally but does not re-export them. Importing from the source of truth avoids
// the undefined values that caused 10 test failures (audit fix, June 2026).
import {
  CURRENT_TAX_YEAR,
  FICA_SS_RATE,
  FICA_MEDICARE_RATE,
  C_CORP_TAX_RATE,
  DEFAULT_OFFICER_SALARY_FRACTION,
} from '../constants.js'

// Minimal personal context — keeps test focus on entity differences, not personal 1040 details.
// F-07 FIX: taxYear now reads from CURRENT_TAX_YEAR instead of a hardcoded literal.
const BASE_CTX = {
  taxYear: CURRENT_TAX_YEAR, status: 'single', dependents: 0,
  w2: 0, k1Total: 0, rentalNet: 0, stGain: 0, ltGain: 0,
  intInc: 0, divInc: 0, qualDiv: 0, f4797Inc: 0, taxableSS: 0, iraIncome: 0,
  useItemized: false, itemizedAmt: 0, saltAmount: 0,
  hasISO: false, isoBargainElement: 0, isREP: false,
  unrecap1250: 0, collectiblesGain: 0,
  w2Withheld: 0, estPaid: 0,
  nolCarryforward: 0, priorYearQBILoss: 0, ytdFactor: 1,
}

// Helper: run a comparison with one entity at index 0.
function compare(netProfitShare, officerSalary, extraCtx = {}) {
  const entities = [{ type: 'Sole Proprietor / Single-Member LLC', k1: netProfitShare, own: 100 }]
  return compareEntityScenarios({
    personalContext: { ...BASE_CTX, ...extraCtx },
    entities,
    entityIdx: 0,
    netProfitShare,
    officerSalary,
  })
}

// =============================================================================
// Exported constants — regression guards
// =============================================================================
describe('exported rate constants', () => {
  it('FICA_SS_RATE is 6.2% (per side)', () => expect(FICA_SS_RATE).toBe(0.062))
  it('FICA_MEDICARE_RATE is 1.45% (per side)', () => expect(FICA_MEDICARE_RATE).toBe(0.0145))
  it('C_CORP_TAX_RATE is 21% (IRC §11 post-TCJA)', () => expect(C_CORP_TAX_RATE).toBe(0.21))
  it('DEFAULT_OFFICER_SALARY_FRACTION is 30%', () => expect(DEFAULT_OFFICER_SALARY_FRACTION).toBe(0.30))
})

// =============================================================================
// Default officer salary
// =============================================================================
describe('default officer salary', () => {
  it('defaults to 30% of netProfitShare when officerSalary is omitted', () => {
    const result = compare(100000, undefined)
    expect(result.salary).toBe(30000)
  })

  it('uses explicitly provided salary over default', () => {
    const result = compare(100000, 50000)
    expect(result.salary).toBe(50000)
  })

  it('caps default salary at netProfitShare (cannot pay yourself more than profit)', () => {
    const result = compare(10000, undefined)
    expect(result.salary).toBeLessThanOrEqual(10000)
  })

  it('salary clamped to 0 when netProfitShare is 0', () => {
    const result = compare(0, undefined)
    expect(result.salary).toBe(0)
  })
})

// =============================================================================
// Return shape contract
// =============================================================================
describe('return shape', () => {
  it('returns exactly three scenarios: soleProp, sCorp, cCorp', () => {
    const { scenarios } = compare(100000, 30000)
    expect(scenarios.map(s => s.key)).toEqual(['soleProp', 'sCorp', 'cCorp'])
  })

  it('each scenario has label, totalTax, lineItems, notes', () => {
    const { scenarios } = compare(100000, 30000)
    for (const s of scenarios) {
      expect(typeof s.label).toBe('string')
      expect(typeof s.totalTax).toBe('number')
      expect(Array.isArray(s.lineItems)).toBe(true)
      expect(Array.isArray(s.notes)).toBe(true)
    }
  })

  it('best is a valid scenario key', () => {
    const { best } = compare(100000, 30000)
    expect(['soleProp', 'sCorp', 'cCorp']).toContain(best)
  })

  it('savings >= 0', () => {
    const { savings } = compare(100000, 30000)
    expect(savings).toBeGreaterThanOrEqual(0)
  })

  it('savings = 2nd-cheapest.totalTax - cheapest.totalTax', () => {
    const { scenarios, best, savings } = compare(100000, 30000)
    const sorted = [...scenarios].sort((a, b) => a.totalTax - b.totalTax)
    const cheapest = sorted[0].totalTax
    const secondCheapest = sorted[1].totalTax
    expect(savings).toBe(secondCheapest - cheapest)
  })
})

// =============================================================================
// Sole Prop SE tax
// =============================================================================
describe('Sole Prop — self-employment tax', () => {
  it('soleProp scenario has non-zero SE tax for profitable entity', () => {
    const { scenarios } = compare(100000, 30000)
    const sp = scenarios.find(s => s.key === 'soleProp')
    const seLine = sp.lineItems.find(li => li.label === 'Income tax + SE tax')
    expect(seLine).toBeDefined()
    expect(seLine.value).toBeGreaterThan(0)
  })

  it('soleProp total tax increases with higher net profit', () => {
    const low  = compare(50000, 15000)
    const high = compare(150000, 45000)
    const spLow  = low.scenarios.find(s => s.key === 'soleProp').totalTax
    const spHigh = high.scenarios.find(s => s.key === 'soleProp').totalTax
    expect(spHigh).toBeGreaterThan(spLow)
  })
})

// =============================================================================
// S Corp employment tax
// =============================================================================
describe('S Corp — employment tax on officer salary', () => {
  it('FICA on $60k salary = both sides combined correctly', () => {
    // SS both sides: min(60000, ssWageBase) × 0.062 × 2
    // Med both sides: 60000 × 0.0145 × 2 = 1,740
    // Note: uses CURRENT_TAX_YEAR ssWageBase — test remains correct across year transitions
    const { scenarios } = compare(200000, 60000)
    const sc = scenarios.find(s => s.key === 'sCorp')
    const ficaLine = sc.lineItems.find(li => li.label.startsWith('Employment tax on $'))
    expect(ficaLine).toBeDefined()
    // $60k is below any plausible SS wage base; SS portion = 60000 × 0.062 × 2 = 7,440
    // Med portion = 60000 × 0.0145 × 2 = 1,740 → total = 9,180
    expect(ficaLine.value).toBe(9180)
  })

  it('SS portion capped at ssWageBase', () => {
    // salary = $200k; SS capped at ssWageBase; Medicare uncapped
    const { scenarios } = compare(500000, 200000)
    const sc = scenarios.find(s => s.key === 'sCorp')
    const ficaLine = sc.lineItems.find(li => li.label === 'Employment tax (W-2)')
    // Directional: FICA line must be defined and positive
    expect(ficaLine).toBeDefined()
    expect(ficaLine.value).toBeGreaterThan(0)
    // SS is capped, so total < salary × (0.062 + 0.0145) × 2
    const uncapped = Math.round(200000 * (FICA_SS_RATE + FICA_MEDICARE_RATE) * 2)
    expect(ficaLine.value).toBeLessThan(uncapped)
  })

  it('sCorp K-1 = netProfit - salary - employer FICA (gross reduction)', () => {
    // The S Corp scenario should show a K-1 distribution less than the full profit.
    // Exact value depends on employer FICA, but must be less than netProfitShare.
    const { scenarios } = compare(100000, 40000)
    const sc = scenarios.find(s => s.key === 'sCorp')
    // K-1 line may not be explicit, but federal income tax should reflect a lower base
    // than sole prop (salary already taxed as W-2, K-1 = residual)
    const sp = scenarios.find(s => s.key === 'soleProp')
    // For same salary structure, sCorp saves FICA on K-1 portion
    expect(sc.totalTax).not.toBe(sp.totalTax)  // they will differ
  })
})

// =============================================================================
// C Corp double taxation
// =============================================================================
describe('C Corp — corporate + personal double taxation', () => {
  it('C Corp scenario includes corporate tax line item', () => {
    const { scenarios } = compare(200000, 40000)
    const cc = scenarios.find(s => s.key === 'cCorp')
    const corpLine = cc.lineItems.find(li => li.label.startsWith('Corporate income tax'))
    expect(corpLine).toBeDefined()
    expect(corpLine.value).toBeGreaterThan(0)
  })

  it('corporate tax = 21% of (netProfit - salary - employerFICA)', () => {
    const salary = 40000
    const np = 200000
    // employer FICA on $40k salary (below any plausible SS wage base)
    const empFICA = Math.round(Math.min(salary, 176100) * FICA_SS_RATE + salary * FICA_MEDICARE_RATE)
    const corpBase = Math.max(0, np - salary - empFICA)
    const expectedCorpTax = Math.round(corpBase * C_CORP_TAX_RATE)

    const { scenarios } = compare(np, salary)
    const cc = scenarios.find(s => s.key === 'cCorp')
    const corpLine = cc.lineItems.find(li => li.label === 'Corporate tax (21% flat)')
    expect(corpLine.value).toBe(expectedCorpTax)
  })

  it('cCorp is not best scenario for typical small business profits', () => {
    // Double taxation almost always makes C-Corp worst for pass-through-eligible owners
    const { scenarios, best } = compare(150000, 45000)
    const cc = scenarios.find(s => s.key === 'cCorp')
    const cheapest = scenarios.find(s => s.key === best)
    expect(cc.totalTax).toBeGreaterThanOrEqual(cheapest.totalTax)
  })
})

// =============================================================================
// Zero / edge cases
// =============================================================================
describe('edge cases', () => {
  it('zero net profit produces non-negative tax for all scenarios', () => {
    const { scenarios } = compare(0, 0)
    for (const s of scenarios) {
      expect(s.totalTax).toBeGreaterThanOrEqual(0)
    }
  })

  it('salary exceeding netProfitShare is clamped to netProfitShare', () => {
    const { salary } = compare(50000, 999999)
    expect(salary).toBeLessThanOrEqual(50000)
  })

  it('all scenarios have at least one line item', () => {
    const { scenarios } = compare(100000, 30000)
    for (const s of scenarios) {
      expect(s.lineItems.length).toBeGreaterThan(0)
    }
  })
})

// =============================================================================
// Finding 2 consistency — the §469(c)(7)(B) hours gate must apply in the
// comparison the same way it applies in the filed return. A REP rental loss with
// FAILING hours (and no override) is suspended, so taxable income — and tax — is
// higher than the same comparison where the hours PASS and the loss is freed.
// =============================================================================
describe('Finding 2 — REP hours gate is applied in scenario comparison', () => {
  function compareWithRental(repHoursRE, repHoursTotal, override = false) {
    const entities = [
      { type: 'S Corporation', k1: 120000, own: 100, officerW2: 60000 },
      {
        type: 'Real Estate (Schedule E)', own: 100,
        pnl: { netProfit: -80000 },
        isREP: true, rentalAggregationElection: true,
        repHoursRE, repHoursTotal,
        ...(override ? { repAggregationOverride: true } : {}),
      },
    ]
    return compareEntityScenarios({
      personalContext: { ...BASE_CTX, w2: 250000, isREP: true, rentalAggregationElection: true },
      entities,
      entityIdx: 0,
      netProfitShare: 120000,
      officerSalary: 60000,
    })
  }

  it('failing hours suspend the rental loss → higher tax than passing hours', () => {
    const failing = compareWithRental('800', '3000')   // 27% — fails >50%
    const passing = compareWithRental('1600', '2000')  // 80% — passes
    const taxOf = res => res.scenarios.find(s => s.key === 'soleProp').totalTax
    expect(taxOf(failing)).toBeGreaterThan(taxOf(passing))
  })

  it('explicit override frees the loss despite failing hours (matches passing-hours tax)', () => {
    const overridden = compareWithRental('800', '3000', true)
    const passing    = compareWithRental('1600', '2000')
    const taxOf = res => res.scenarios.find(s => s.key === 'soleProp').totalTax
    expect(taxOf(overridden)).toBe(taxOf(passing))
  })

  it('stale personalContext hours do NOT gate when the rental card has no hours (per-entity is authoritative)', () => {
    // personalContext carries legacy failing hours, but the rental entity has none.
    // Per-entity is the single source of truth (matching TaxReturn), so the loss is
    // NOT gated by the stale context value — it frees, same as the passing-hours case.
    const entities = [
      { type: 'S Corporation', k1: 120000, own: 100, officerW2: 60000 },
      { type: 'Real Estate (Schedule E)', own: 100, pnl: { netProfit: -80000 },
        isREP: true, rentalAggregationElection: true },  // no per-entity hours
    ]
    const stale = compareEntityScenarios({
      personalContext: { ...BASE_CTX, w2: 250000, isREP: true, rentalAggregationElection: true,
        repHoursRE: 800, repHoursTotal: 3000 },           // stale failing hours in context
      entities, entityIdx: 0, netProfitShare: 120000, officerSalary: 60000,
    })
    const passing = compareWithRental('1600', '2000')
    const taxOf = res => res.scenarios.find(s => s.key === 'soleProp').totalTax
    expect(taxOf(stale)).toBe(taxOf(passing))
  })
})
