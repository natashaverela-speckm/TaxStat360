// PHASE 1 (simple flow, Nov 2026): the opportunity-card builder lifted out of
// AIAnalysis.jsx. These tests freeze the behaviour the tab had on the day of the
// lift so the result screen and the analysis tab can never drift apart.
import { describe, it, expect } from 'vitest'
import { buildOpportunities, getTotalW2, recEntityType, recDepreciation } from './opportunities.js'
import { summarizeRecord } from '../utils/calcSelector.js'
import { nf } from '../utils/money.js'

const scorpRecord = {
  taxYear: 2026,
  biz: { entityType: 'S Corporation', year: 2026, revenue: 300000, officerSalary: 80000 },
  f1040: { filingStatus: 'single', w2Income: 0, taxYear: 2026 },
  k1Income: 113880,
  entities: [{
    id: 1, type: 'S Corporation', name: 'Test Consulting S-Corp', own: '100', isManual: true,
    officerW2: 80000,
    pnl: { grossRevenue: 300000, totalExpenses: 186120, officerSalary: 80000, employerPayrollTax: 6120, depreciation: 0, advertising: 0, otherDeductions: 0, netProfit: 113880 },
  }],
}

const rentalRecord = {
  taxYear: 2026,
  biz: { entityType: 'Real Estate (Schedule E)', year: 2026 },
  f1040: { filingStatus: 'single', w2Income: 120000, taxYear: 2026 },
  k1Income: 0,
  entities: [{
    id: 2, type: 'Real Estate (Schedule E)', name: 'Kissimmee STR', own: '100', isManual: true,
    pnl: { grossRevenue: 40000, totalExpenses: 65000, depreciation: 30000, netProfit: -25000 },
  }],
}

describe('buildOpportunities — CHAR: same cards the AI Analysis tab produced', () => {
  it('returns hasIncome:false and no cards for an empty record', () => {
    const r = buildOpportunities({ biz: {}, f1040: {}, entities: [] })
    expect(r.hasIncome).toBe(false)
    expect(r.opportunities).toEqual([])
    expect(Object.isFrozen(r)).toBe(true)
  })

  it('S-Corp at $300K / $100K opex / $80K salary gets the retirement, split, HSA, home office, children and Augusta cards, high first', () => {
    const r = buildOpportunities(scorpRecord)
    expect(r.hasIncome).toBe(true)
    const titles = r.opportunities.map(o => o.title)
    expect(titles).toContain('SEP-IRA')
    expect(titles).toContain('Solo 401(k) — Higher Contribution than SEP-IRA')
    expect(titles).toContain('S-Corp Salary vs. Distribution Split')
    expect(titles).toContain('Health Savings Account (HSA)')
    expect(titles).toContain('Home Office Deduction')
    expect(titles).toContain('Hire Your Children')
    expect(titles).toContain('Augusta Rule — IRC §280A(g)')
    // §179 prompt: operating revenue > $30K and no depreciation recorded
    expect(titles).toContain('§179 Equipment Deduction')
    // sort: every high card precedes every medium card, which precede every low card
    const rank = { high: 0, medium: 1, low: 2 }
    const ranks = r.opportunities.map(o => rank[o.priority])
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
  })

  it('S-Corp dollar figures come from the engine marginal rate (engine-true, not a local sum)', () => {
    const r = buildOpportunities(scorpRecord)
    const sum = summarizeRecord(scorpRecord)
    expect(sum.ok).toBe(true)
    expect(r.marginalRate).toBe(sum.marginalRate)
    const sep = r.opportunities.find(o => o.title === 'SEP-IRA')
    // 25% × $80,000 officer comp = $20,000 × marginal rate
    expect(sep.saving).toBe(Math.round(20000 * sum.marginalRate))
    const split = r.opportunities.find(o => o.title === 'S-Corp Salary vs. Distribution Split')
    expect(split.saving).toBeGreaterThan(1000)
  })

  it('rental-only profile leads with the §469 cards and never shows home office or family payroll', () => {
    const r = buildOpportunities(rentalRecord)
    const titles = r.opportunities.map(o => o.title)
    expect(titles).toContain('Bonus Depreciation')
    expect(titles).toContain('Track Your Real Estate Hours')
    expect(titles).not.toContain('Home Office Deduction')
    expect(titles).not.toContain('Hire Your Children')
    expect(r.opportunities[0].priority).toBe('high')
  })

  it('card shape is stable: icon, title, priority, saving, detail, howTo', () => {
    for (const o of buildOpportunities(scorpRecord).opportunities) {
      expect(Object.keys(o).sort()).toEqual(['detail', 'howTo', 'icon', 'priority', 'saving', 'title'])
      expect(['high', 'medium', 'low']).toContain(o.priority)
    }
  })
})

describe('record helpers moved with the builder', () => {
  it('getTotalW2 sums personal W-2 and every officer salary', () => {
    expect(getTotalW2(scorpRecord)).toBe(80000)
    expect(getTotalW2(rentalRecord)).toBe(120000)
  })
  it('recEntityType prefers biz.entityType, then the first entity', () => {
    expect(recEntityType(scorpRecord)).toBe('S Corporation')
    expect(recEntityType({ biz: { entityType: 'Unknown' }, entities: [{ type: 'Partnership / LLC' }] })).toBe('Partnership / LLC')
  })
  it('recDepreciation counts §179 (box11_12) alongside MACRS/bonus', () => {
    expect(recDepreciation(rentalRecord)).toBe(30000)
    expect(recDepreciation({ entities: [{ pnl: { depreciation: 0 }, box11_12: 5000 }] })).toBe(5000)
  })
})

// ── Savings are capped at the tax actually owed (Nov 2026) ──────────────────
describe('card savings never exceed total federal tax', () => {
  it('a loss year with $0 tax zeroes every "Save ~" and marks the cap', async () => {
    const { buildEntityFromNumbers } = await import('./simpleFlow.js')
    const entity = buildEntityFromNumbers({ tile: 'scorp', revenue: '226484', expenses: '267844', officerSalary: '48000', taxYear: 2026 })
    const rec = { taxYear: 2026, f1040: { filingStatus: 'single', taxYear: 2026 }, entities: [entity], biz: { entityType: 'S Corporation', revenue: 226484, year: 2026 } }
    const { opportunities } = buildOpportunities(rec)
    const capped = opportunities.filter(o => o.savingCapped)
    expect(capped.length).toBeGreaterThan(0)
    for (const o of opportunities) expect(nf(o.saving)).toBe(0)
    expect(capped[0].savingUncapped).toBeGreaterThan(0)
  })
  it('a profitable year leaves savings below the tax untouched', () => {
    const rec = { taxYear: 2026, f1040: { filingStatus: 'single', taxYear: 2026 }, biz: { entityType: 'S Corporation', revenue: 400000, year: 2026 },
      entities: [{ id: 1, type: 'S Corporation', name: 'X', own: '100', officerW2: 120000, pnl: { grossRevenue: 400000, totalExpenses: 150000, officerSalary: 120000, netProfit: 250000 } }] }
    const { opportunities } = buildOpportunities(rec)
    expect(opportunities.some(o => nf(o.saving) > 0)).toBe(true)
    expect(opportunities.every(o => !o.savingCapped)).toBe(true)
  })
})
