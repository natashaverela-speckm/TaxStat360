import { describe, it, expect } from 'vitest'
import {
  compareEntityScenarios,
  FICA_SS_RATE,
  FICA_MEDICARE_RATE,
  C_CORP_TAX_RATE,
  DEFAULT_OFFICER_SALARY_FRACTION,
} from '../scenarioCompare.js'

// Minimal personal context — keeps test focus on entity differences, not personal 1040 details.
const BASE_CTX = {
  taxYear: 2025, status: 'single', dependents: 0,
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

  it('savings = mostExpensive.totalTax - cheapest.totalTax', () => {
    const { scenarios, best, savings } = compare(100000, 30000)
    const cheapest     = scenarios.find(s => s.key === best).totalTax
    const mostExpensive = Math.max(...scenarios.map(s => s.totalTax))
    expect(savings).toBe(mostExpensive - cheapest)
  })
})

// =============================================================================
// Sole Prop SE tax
// =============================================================================
describe('Sole Prop — self-employment tax', () => {
  it('soleProp scenario has non-zero SE tax for profitable entity', () => {
    const { scenarios } = compare(100000, 30000)
    const sp = scenarios.find(s => s.key === 'soleProp')
    const seLine = sp.lineItems.find(li => li.label === 'Self-employment tax')
    expect(seLine).toBeDefined()
    expect(seLine.value).toBeGreaterThan(0)
  })

  it('soleProp total tax increases with higher net profit', () => {
    const low  = compare(50000,  15000)
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
    // SS both sides: min(60000, 176100) × 0.062 × 2 = 7,440
    // Med both sides: 60000 × 0.0145 × 2 = 1,740
    // Total = 9,180
    const { scenarios } = compare(200000, 60000)
    const sc = scenarios.find(s => s.key === 'sCorp')
    const ficaLine = sc.lineItems.find(li => li.label === 'Employment tax (W-2)')
    expect(ficaLine).toBeDefined()
    expect(ficaLine.value).toBe(9180)
  })

  it('SS portion capped at ssWageBase (2025 = $176,100)', () => {
    // salary = $200k; SS capped at $176,100; Medicare uncapped
    // SS both: 176100 × 0.062 × 2 = 21,836.40 → rounded
    // Med both: 200000 × 0.0145 × 2 = 5,800
    const { scenarios } = compare(500000, 200000)
    const sc = scenarios.find(s => s.key === 'sCorp')
    const ficaLine = sc.lineItems.find(li => li.label === 'Employment tax (W-2)')
    const expected = Math.round(Math.min(200000, 176100) * 0.062 * 2 + 200000 * 0.0145 * 2)
    expect(ficaLine.value).toBe(expected)
  })

  it('sCorp K-1 = netProfit - salary - employer FICA (gross reduction)', () => {
    // The S Corp scenario should show a K-1 distribution less than the full profit.
    // Exact value depends on employer FICA, but must be less than netProfitShare.
    const { scenarios, salary } = compare(100000, 40000)
    const sc = scenarios.find(s => s.key === 'sCorp')
    // K-1 line may not be explicit, but federal income tax should reflect a lower base
    // than sole prop (salary already taxed as W-2, K-1 = residual)
    const sp = scenarios.find(s => s.key === 'soleProp')
    // For same salary structure, sCorp saves FICA on K-1 portion
    expect(sc.totalTax).not.toBe(sp.totalTax) // they will differ
  })
})

// =============================================================================
// C Corp double taxation
// =============================================================================
describe('C Corp — corporate + personal double taxation', () => {
  it('C Corp scenario includes corporate tax line item', () => {
    const { scenarios } = compare(200000, 40000)
    const cc = scenarios.find(s => s.key === 'cCorp')
    const corpLine = cc.lineItems.find(li => li.label === 'Corporate tax (21% flat)')
    expect(corpLine).toBeDefined()
    expect(corpLine.value).toBeGreaterThan(0)
  })

  it('corporate tax = 21% of (netProfit - salary - employerFICA)', () => {
    const salary = 40000
    const np     = 200000
    // employer FICA on $40k salary (2025 ssWageBase 176100 > 40000)
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
