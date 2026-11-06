// @vitest-environment jsdom
// PHASE 2 (Prior-Year Review): the field contract and the memo of findings.
import { describe, it, expect } from 'vitest'
import {
  TAX_1040_REVIEW_FIELDS, TAX_1040_REVIEW_FIELD_KEYS, normalizeReviewFields,
  buildReviewRecord, buildReviewEntities, buildPriorYearMemo, REVIEW_PROFILE,
  ENTITY_RETURN_FIELDS, ENTITY_RETURN_KINDS, normalizeEntityFields, detectReturnType, mergeEntityReturns,
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

// ── PHASE 2b: entity returns ────────────────────────────────────────────────

const SCORP_1120S = {
  taxYear: 2025, shareholderCount: 1, grossReceipts: 420000, totalIncome: 420000,
  officerCompensation: 80000, salariesWages: 96000, rentsPaid: 24000, taxesAndLicenses: 13460,
  depreciation: 6200, sec179: null, bonusDepreciation: null, pensionProfitSharing: null, employeeBenefits: null,
  otherDeductions: 86460, totalDeductions: 306120, ordinaryBusinessIncome: 113880, shareholderHealthIns: null,
  distributions: 150000, loansToShareholders: 20000, loansFromShareholders: null, totalAssets: 148000,
  vehicleOrTravel: null, homeOfficeOrAccountablePlan: false,
}
const PSHIP_1065 = {
  taxYear: 2025, partnerCount: 2, grossReceipts: 310000, totalIncome: 310000, guaranteedPayments: 60000,
  salariesWages: 40000, rentsPaid: 18000, taxesAndLicenses: 4100, depreciation: 5400, sec179: null, bonusDepreciation: null,
  retirementPlans: null, employeeBenefits: null, otherDeductions: 52500, totalDeductions: 180000, ordinaryBusinessIncome: 130000,
  netRentalRealEstate: null, selfEmploymentEarnings: 190000, distributions: 110000, totalAssets: 92000, vehicleOrTravel: 7200,
}

describe('entity return contracts', () => {
  it('every entity field has a key, group, kind, label and source; keys unique; profiles named', () => {
    for (const kind of Object.keys(ENTITY_RETURN_FIELDS)) {
      const keys = ENTITY_RETURN_FIELDS[kind].map(f => f.key)
      expect(new Set(keys).size).toBe(keys.length)
      for (const f of ENTITY_RETURN_FIELDS[kind]) expect(f.key && f.group && f.kind && f.label && f.source).toBeTruthy()
      expect(ENTITY_RETURN_KINDS[kind].profile).toMatch(/^tax-(1120s|1065|1120)-review$/)
    }
  })

  it('normalizes and rejects unknown kinds', () => {
    const e = normalizeEntityFields('1120s', { officerCompensation: '80,000', homeOfficeOrAccountablePlan: 'true', shareholderCount: null })
    expect(e.officerCompensation).toBe(80000)
    expect(e.homeOfficeOrAccountablePlan).toBe(true)
    expect(e.shareholderCount).toBe(0)
    expect(() => normalizeEntityFields('990', {})).toThrow()
  })

  it('detects the return type from the page-1 title, not from the K-1 inside a 1040', () => {
    expect(detectReturnType('Form 1040 U.S. Individual Income Tax Return 2025 ... Schedule K-1 (Form 1120-S) box 1')).toBe('1040')
    expect(detectReturnType('Form 1120-S U.S. Income Tax Return for an S Corporation')).toBe('1120s')
    expect(detectReturnType('Form 1065 U.S. Return of Partnership Income')).toBe('1065')
    expect(detectReturnType('Form 1120S line 7 compensation of officers')).toBe('1120s')
    expect(detectReturnType('Form 1120 U.S. Corporation Income Tax Return 2025')).toBe('1120')
    expect(detectReturnType('Form 1120 line 12 compensation of officers')).toBe('1120')
    expect(detectReturnType('nothing here')).toBeNull()
  })

  it('fills the officer W-2 and K-1 share from the 1120-S when the 1040 left them blank', () => {
    const f = mergeEntityReturns(normalizeReviewFields({ w2Wages: 100000 }), [{ kind: '1120s', fields: { ...SCORP_1120S, shareholderCount: 2 } }])
    expect(f.officerW2).toBe(40000)
    expect(f.k1ScorpOrdinary).toBe(56940)
    const g = mergeEntityReturns(normalizeReviewFields({ officerW2: 80000, k1ScorpOrdinary: 1 }), [{ kind: '1120s', fields: SCORP_1120S }])
    expect(g.officerW2).toBe(80000)
    expect(g.k1ScorpOrdinary).toBe(1)
  })
})

describe('memo with the entity return', () => {
  const memo = buildPriorYearMemo(SCORP_RENTAL, { entityReturns: [{ kind: '1120s', fields: SCORP_1120S }] })
  const codes = (id) => (memo.sections.find(s => s.id === id)?.findings || []).map(x => x.code)

  it('reads reasonable comp from the 1120-S lines and drops the upload nudge', () => {
    const rc = memo.sections.find(s => s.id === 'comp').findings.find(x => x.code === 'reasonable-comp')
    expect(rc.detail).toMatch(/Per the 1120-S/)
    expect(rc.detail).toMatch(/\$150,000 taken as distributions/)
    expect(codes('comp')).not.toContain('upload-1120s')
    expect(memo.missingReturns).toEqual([])
    expect(memo.entityReturns).toEqual(['1120s'])
  })

  it('adds §6001 exposures for the shareholder loan and distributions over income', () => {
    expect(codes('records')).toContain('shareholder-loan')
    expect(codes('records')).toContain('basis-schedule')
  })

  it('adds §162 findings the entity return makes visible', () => {
    const c = codes('ordinary')
    expect(c).toContain('entity-retirement')
    expect(c).toContain('scorp-health')
    expect(c).toContain('entity-vehicle')
    const ho = memo.sections.find(s => s.id === 'ordinary').findings.find(x => x.code === 'home-office')
    expect(ho.title).toMatch(/accountable-plan/i)
    const retire = memo.sections.find(s => s.id === 'ordinary').findings.find(x => x.code === 'entity-retirement')
    expect(retire.impact).toBeGreaterThan(0)
    // the engine's SEP / Solo cards are not counted a second time
    expect(codes('more').filter(x => /^(SEP-IRA|Solo 401)/.test(x))).toEqual([])
  })

  it('§179 reads the entity depreciation lines', () => {
    const s = memo.sections.find(s => s.id === 'sec179').findings[0]
    expect(s.detail).toMatch(/1120-S shows \$6,200 of depreciation, nothing expensed under §179 and no bonus depreciation/)
  })

  it('a 1040 with an S-Corp K-1 and no 1120-S asks for it', () => {
    const m = buildPriorYearMemo(SCORP_RENTAL)
    expect(m.missingReturns).toEqual(['1120s'])
    expect(m.sections.find(s => s.id === 'comp').findings.map(x => x.code)).toContain('upload-1120s')
  })

  it('a partnership return adds guaranteed-payment and retirement findings', () => {
    const m = buildPriorYearMemo({ taxYear: 2025, filingStatus: 'mfj', w2Wages: 50000, k1PartnershipOrdinary: 65000 }, { entityReturns: [{ kind: '1065', fields: PSHIP_1065 }] })
    const c = (m.sections.find(s => s.id === 'ordinary')?.findings || []).map(x => x.code)
    expect(c).toContain('guaranteed-payments')
    expect(c).toContain('entity-retirement')
    expect(c).not.toContain('entity-vehicle')
    expect(m.missingReturns).toEqual([])
  })

  it('a C-Corp return adds double-tax, fringe, accumulated-earnings and QSBS findings', () => {
    const CCORP = { taxYear: 2025, grossReceipts: 650000, totalIncome: 650000, officerCompensation: 150000, salariesWages: 180000, rentsPaid: 36000,
      depreciation: 12000, otherDeductions: 125000, totalDeductions: 530000, taxableIncome: 120000, totalTax: 25200, dividendsPaid: 60000,
      retainedEarnings: 310000, totalAssets: 480000, vehicleOrTravel: 14000, homeOfficeOrAccountablePlan: false }
    const m = buildPriorYearMemo({ taxYear: 2025, filingStatus: 'mfj', w2Wages: 150000 }, { entityReturns: [{ kind: '1120', fields: CCORP }] })
    const by = (id) => (m.sections.find(s => s.id === id)?.findings || []).map(x => x.code)
    expect(by('comp')).toEqual(expect.arrayContaining(['ccorp-comp', 'double-tax']))
    const dt = m.sections.find(s => s.id === 'comp').findings.find(x => x.code === 'double-tax')
    expect(dt.impact).toBe(12600)
    expect(by('records')).toContain('accumulated-earnings')
    expect(by('records')).not.toContain('ccorp-shareholder-loan')
    expect(by('ordinary')).toEqual(expect.arrayContaining(['ccorp-fringe', 'entity-retirement', 'home-office']))
    expect(by('ordinary')).not.toContain('entity-vehicle')
    expect(m.sections.find(s => s.id === 'ordinary').findings.find(x => x.code === 'hire-children').conditions).toMatch(/fully subject to FICA/)
    expect(by('more')).toContain('qsbs')
    expect(m.sections.find(s => s.id === 'sec179').findings[0].detail).toMatch(/1120 shows \$12,000 of depreciation/)
    expect(m.missingReturns).toEqual([])
    expect(m.entityReturns).toEqual(['1120'])
  })
})
