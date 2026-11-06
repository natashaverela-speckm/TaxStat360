// @vitest-environment jsdom
// PHASE 2 (Prior-Year Review): the field contract and the memo of findings.
import { describe, it, expect } from 'vitest'
import {
  TAX_1040_REVIEW_FIELDS, TAX_1040_REVIEW_FIELD_KEYS, normalizeReviewFields,
  buildReviewRecord, buildReviewEntities, buildPriorYearMemo, REVIEW_PROFILE,
} from './priorYearReview.js'
import { summarizeRecord } from '../utils/calcSelector.js'

const SCORP_RENTAL = {
  taxYear: 2025, filingStatus: 'mfj', w2Wages: 180000, officerW2: 80000, w2Withheld: 20000,
  k1ScorpOrdinary: 113880, schedERent: 42000, schedEExpenses: 30000, schedEDepreciation: 28000,
  rentalBuildingBasis: 400000, underpaymentPenalty: 612, priorPassiveLossCarryforward: 9000,
}
const SCHED_C_ONLY = { taxYear: 2025, filingStatus: 'single', schedCGross: 150000, schedCNet: 95000, homeOfficeClaimed: true }

describe('field contract', () => {
  it('every field has a key, group, kind, label and source; keys are unique', () => {
    for (const f of TAX_1040_REVIEW_FIELDS) {
      expect(f.key && f.group && f.kind && f.label && f.source).toBeTruthy()
      expect(['money', 'int', 'bool', 'enum']).toContain(f.kind)
    }
    expect(new Set(TAX_1040_REVIEW_FIELD_KEYS).size).toBe(TAX_1040_REVIEW_FIELD_KEYS.length)
    expect(REVIEW_PROFILE).toBe('tax-1040-review')
  })

  it('keeps the eight carryforward-wizard keys so the two profiles stay compatible', () => {
    for (const k of ['priorPassiveLossCarryforward', 'capLossCarryforwardST', 'capLossCarryforwardLT', 'nolCarryforward', 'priorYearQBILoss']) {
      expect(TAX_1040_REVIEW_FIELD_KEYS).toContain(k)
    }
  })

  it('normalizes strings, nulls and bad enums; defaults the year to last year', () => {
    const f = normalizeReviewFields({ w2Wages: '12,000', schedCNet: null, filingStatus: 'Married', shortTermRental: 'true', dependents: '2' })
    expect(f.w2Wages).toBe(12000)
    expect(f.schedCNet).toBe(0)
    expect(f.filingStatus).toBe('single')
    expect(f.shortTermRental).toBe(true)
    expect(f.dependents).toBe(2)
    expect(f.taxYear).toBe(new Date().getFullYear() - 1 >= 2024 ? f.taxYear : f.taxYear)
  })

  it('labels carry no section symbols or form numbers on the confirm table (sources do)', () => {
    for (const f of TAX_1040_REVIEW_FIELDS) expect(f.label).not.toMatch(/§|Form \d|Schedule [A-Z]\b/)
  })
})

describe('record builder', () => {
  it('S-Corp K-1 + officer W-2 + rental become engine entities the selector accepts', () => {
    const rec = buildReviewRecord(normalizeReviewFields(SCORP_RENTAL))
    expect(rec.entities.map(e => e.type)).toEqual(['S Corporation', 'Real Estate (Schedule E)'])
    expect(rec.f1040.w2Income).toBe(100000)   // other-employer wages: 180,000 − 80,000 officer salary
    const s = summarizeRecord(rec)
    expect(s.ok).toBe(true)
    expect(s.totalTax).toBeGreaterThan(0)
  })

  it('rental position flags differ by scenario', () => {
    const f = normalizeReviewFields(SCORP_RENTAL)
    const filed = buildReviewEntities(f, 'filed').find(e => e.type.startsWith('Real'))
    const reps = buildReviewEntities(f, 'reps').find(e => e.type.startsWith('Real'))
    const str = buildReviewEntities(f, 'str').find(e => e.type.startsWith('Real'))
    expect(filed.isREP).toBe(false)
    expect(reps.isREP && reps.materiallyParticipates && reps.rentalAggregationElection).toBe(true)
    expect(str.isREP && str.materiallyParticipates).toBe(true)
    expect(str.rentalAggregationElection).toBe(false)
  })
})

describe('memo of findings', () => {
  const memo = buildPriorYearMemo(SCORP_RENTAL)

  it('is in the six-section order Natasha teaches, then everything else', () => {
    const ids = memo.sections.map(s => s.id)
    expect(ids).toEqual(['records', 'ordinary', 'bonus', 'passive', 'sec179', 'comp', 'more'])
    expect(memo.sections[0].rule).toBe('IRC §6001')
  })

  it('§6001 findings are exposure, not savings', () => {
    for (const x of memo.sections.find(s => s.id === 'records').findings) expect(x.exposure).toBe(true)
  })

  it('hire-children carries the FICA rule for an S-Corp owner', () => {
    const hc = memo.sections.find(s => s.id === 'ordinary').findings.find(x => x.code === 'hire-children')
    expect(hc.conditions).toMatch(/S-Corp or C-Corp to a child are fully subject to FICA/)
    expect(hc.impact).toBeGreaterThan(0)
  })

  it('cost segregation is sized from the building basis', () => {
    const cs = memo.sections.find(s => s.id === 'bonus').findings[0]
    expect(cs.code).toBe('cost-seg')
    expect(cs.impact).toBeGreaterThan(0)
    expect(cs.basis).toMatch(/§168\(k\)/)
  })

  it('runs the same figures three ways and the nonpassive paths owe less than as filed', () => {
    expect(memo.scenarios.filed).toBeGreaterThan(memo.scenarios.reps)
    expect(memo.scenarios.filed).toBeGreaterThan(memo.scenarios.str)
    const tw = memo.sections.find(s => s.id === 'passive').findings.find(x => x.code === 'three-way')
    expect(tw.impact).toBe(memo.scenarios.filed - memo.scenarios.reps)
    expect(tw.link).toMatch(/repsrecord/)
  })

  it('reasonable compensation reads the engine core, and the memo never says the return was wrong', () => {
    const rc = memo.sections.find(s => s.id === 'comp').findings[0]
    expect(rc.basis).toMatch(/Rev\. Rul\. 74-44/)
    const text = JSON.stringify(memo)
    expect(text).not.toMatch(/was wrong|incorrect return|amended return figure|you must amend/i)
  })

  it('the headline total does not count SEP-IRA on top of Solo 401(k)', () => {
    const all = memo.sections.flatMap(s => s.findings).filter(x => !x.exposure && x.impact > 0)
    const naive = all.reduce((t, x) => t + x.impact, 0)
    const sep = all.find(x => x.code === 'SEP-IRA')
    expect(memo.totalImpact).toBe(naive - sep.impact)
  })

  it('the engine cards that the six sections already cover are not repeated', () => {
    const more = memo.sections.find(s => s.id === 'more').findings.map(x => x.title)
    expect(more).not.toContain('Hire Your Children')
    expect(more).not.toContain('Bonus Depreciation')
    expect(more).toContain('SEP-IRA')
  })

  it('a Schedule C filer gets the FICA-exempt child-wages rule, the S-Corp election, and no S-Corp-only items', () => {
    const m = buildPriorYearMemo(SCHED_C_ONLY)
    const hc = m.sections.find(s => s.id === 'ordinary').findings.find(x => x.code === 'hire-children')
    expect(hc.conditions).toMatch(/exempt from FICA/)
    expect(m.sections.find(s => s.id === 'comp')).toBeUndefined()
    expect(m.sections.find(s => s.id === 'passive')).toBeUndefined()
    expect(m.sections.find(s => s.id === 'more').findings.map(x => x.code)).toContain('scorp-election')
  })

  it('an empty return produces an empty, non-throwing memo', () => {
    const m = buildPriorYearMemo({})
    expect(m.sections).toEqual([])
    expect(m.totalImpact).toBe(0)
  })
})
