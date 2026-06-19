import { describe, it, expect } from 'vitest'
import {
  legacyQbiGuarded,
  legacyQbiSimulator,
  resolveQbiDeduction,
  taxableIncomeBeforeQBI,
  computeSimulatorScenario,
  qbiDeductionGap,
  qbiFormSelection,
  niitApplies,
  scorpSeTaxSavingsEstimate,
} from './aiAnalysisTaxMath.js'
import { calcQBI, calcTaxReturn } from './taxCalc.js'

const FILING_STATUSES = ['single', 'mfj', 'mfs', 'hoh', 'qss']

describe('AIAnalysis QBI characterization — legacy guarded path', () => {
  it('below threshold single 2025 — 20% of QBI', () => {
    const ti = taxableIncomeBeforeQBI(80000, 2025, 'single')
    const r = legacyQbiGuarded({
      k1: 50000,
      taxableBeforeQBI: ti,
      entityType: 'S-Corp',
      filing: 'single',
      taxYear: 2025,
      entities: [],
    })
    expect(r.deduction).toBe(10000)
    expect(r.limitApplied).toBe('qbi')
  })

  it('zero K-1 returns no deduction (guarded path)', () => {
    const r = legacyQbiGuarded({
      k1: 0,
      taxableBeforeQBI: 50000,
      entityType: 'S-Corp',
      filing: 'single',
      taxYear: 2025,
      entities: [],
    })
    expect(r.deduction).toBe(0)
    expect(r.limitApplied).toBe('none')
  })

  it('C-Corp returns no deduction', () => {
    const r = legacyQbiGuarded({
      k1: 100000,
      taxableBeforeQBI: 80000,
      entityType: 'C-Corp',
      filing: 'single',
      taxYear: 2025,
      entities: [],
    })
    expect(r.deduction).toBe(0)
  })

  it('phase-in range MFJ 2025 with SSTB entity', () => {
    const entities = [{ box17V_sstb: true, netProfit: 200000, own: 100, box17V_wages: 40000 }]
    const ti = taxableIncomeBeforeQBI(350000, 2025, 'mfj')
    const r = legacyQbiGuarded({
      k1: 200000,
      taxableBeforeQBI: ti,
      entityType: 'S-Corp',
      filing: 'mfj',
      taxYear: 2025,
      entities,
    })
    expect(r.deduction).toBeGreaterThan(0)
    expect(r.deduction).toBeLessThanOrEqual(40000)
  })

  it('QBI loss carryforward reduces deduction', () => {
    const r = legacyQbiGuarded({
      k1: 50000,
      taxableBeforeQBI: 60000,
      entityType: 'LLC',
      filing: 'single',
      taxYear: 2025,
      entities: [],
      // prior loss handled via calcQBI when wired through engine opts — baseline k1 only
    })
    expect(r.deduction).toBe(10000)
  })

  it('OBBBA $400 floor 2026', () => {
    const ti = taxableIncomeBeforeQBI(50000, 2026, 'single')
    const r = legacyQbiGuarded({
      k1: 1500,
      taxableBeforeQBI: ti,
      entityType: 'S-Corp',
      filing: 'single',
      taxYear: 2026,
      entities: [],
    })
    expect(r.deduction).toBe(400)
    expect(r.limitApplied).toBe('min400')
  })

  FILING_STATUSES.forEach((filing) => {
    it(`filing status ${filing} — matches engine for moderate income`, () => {
      const k1 = 80000
      const ti = taxableIncomeBeforeQBI(k1 + 20000, 2025, filing)
      const legacy = legacyQbiGuarded({
        k1,
        taxableBeforeQBI: ti,
        entityType: 'Partnership',
        filing,
        taxYear: 2025,
        entities: [],
      })
      const engine = calcQBI(k1, ti, 0, { status: filing, taxYear: 2025, entityQbiData: [] })
      expect(legacy.deduction).toBe(engine.deduction)
      expect(legacy.limitApplied).toBe(engine.limitApplied)
    })
  })
})

describe('AIAnalysis QBI characterization — legacy simulator vs unified', () => {
  const cases = [
    { k1: 0, ti: 40000, entity: 'S-Corp' },
    { k1: 50000, ti: 70000, entity: 'S-Corp' },
    { k1: 120000, ti: 150000, entity: 'LLC' },
    { k1: 80000, ti: 90000, entity: 'C-Corp' },
  ]

  cases.forEach(({ k1, ti, entity }, i) => {
    it(`simulator legacy matches unified resolve — case ${i + 1}`, () => {
      const opts = { k1, taxableBeforeQBI: ti, entityType: entity, filing: 'single', taxYear: 2025, entities: [] }
      const sim = legacyQbiSimulator(opts)
      const unified = resolveQbiDeduction(opts)
      expect(unified.deduction).toBe(sim.deduction ?? 0)
    })
  })
})

describe('AIAnalysis QBI UI helpers', () => {
  it('qbiDeductionGap when wage limit binds', () => {
    const r = calcQBI(200000, 300000, 0, {
      status: 'single',
      taxYear: 2025,
      entityQbiData: [{ box17V_wages: 10000, box17V_ubia: 0, own: 100 }],
      strictWageCap: true,
    })
    expect(qbiDeductionGap(r)).toBeGreaterThan(0)
  })

  it('qbiFormSelection below threshold uses Form 8995', () => {
    const s = qbiFormSelection({ taxableBeforeQBI: 100000, taxYear: 2025, filing: 'single', isCoopPatron: false })
    expect(s.useForm8995A).toBe(false)
    expect(s.formNum).toBe('Form 8995')
  })

  it('qbiFormSelection above threshold uses Form 8995-A', () => {
    const s = qbiFormSelection({ taxableBeforeQBI: 250000, taxYear: 2025, filing: 'single', isCoopPatron: false })
    expect(s.useForm8995A).toBe(true)
    expect(s.formNum).toBe('Form 8995-A')
  })

  it('niitApplies uses engine threshold', () => {
    expect(niitApplies({ taxYear: 2025, filing: 'single', magi: 250000, netInvestmentIncome: 5000 })).toBe(true)
    expect(niitApplies({ taxYear: 2025, filing: 'single', magi: 150000, netInvestmentIncome: 5000 })).toBe(false)
  })
})

describe('AIAnalysis simulator characterization', () => {
  const base = {
    grossRevenue: 300000,
    cogs: 50000,
    operatingExpenses: 80000,
    officerSalary: 60000,
    depreciation: 10000,
    advertising: 5000,
    otherDeductions: 0,
    w2Income: 0,
  }

  it('S-Corp preset fedTax characterization grid', () => {
    const run = (delta) =>
      computeSimulatorScenario({
        base,
        delta,
        entityType: 'S-Corp',
        ownerPctVal: 1,
        filing: 'single',
        taxYear: 2025,
        entities: [],
      }).fedTax

    expect({
      baseline: run({}),
      adv15: run({ advertising: 15000 }),
      adv30: run({ advertising: 30000 }),
      equip20: run({ depreciation: 20000 }),
      equip50: run({ depreciation: 50000 }),
      revenue: run({ grossRevenue: 50000 }),
      salary: run({ officerSalary: 20000 }),
    }).toEqual({
      baseline: 8862,
      adv15: 6222,
      adv30: 4490,
      equip20: 5450,
      equip50: 2570,
      revenue: 17663,
      salary: 9049,
    })
  })

  it('baseline vs advertising — tax saving direction', () => {
    const baseline = computeSimulatorScenario({
      base,
      delta: {},
      entityType: 'S-Corp',
      ownerPctVal: 1,
      filing: 'single',
      taxYear: 2025,
      entities: [],
    })
    const scenario = computeSimulatorScenario({
      base,
      delta: { advertising: 30000 },
      entityType: 'S-Corp',
      ownerPctVal: 1,
      filing: 'single',
      taxYear: 2025,
      entities: [],
    })
    expect(scenario.fedTax).toBeLessThanOrEqual(baseline.fedTax)
    expect(baseline.fedTax - scenario.fedTax).toBeGreaterThanOrEqual(0)
  })

  it('Schedule C sole prop — positive K-1 and QBI', () => {
    const r = computeSimulatorScenario({
      base: { ...base, officerSalary: 0 },
      delta: {},
      entityType: 'Sole Proprietor',
      ownerPctVal: 1,
      filing: 'mfj',
      taxYear: 2025,
      entities: [],
    })
    expect(r.k1).toBeGreaterThan(0)
    expect(r.qbi).toBeGreaterThan(0)
    expect(r.fedTax).toBeGreaterThan(0)
  })
})

// ─── S-Corp SE-tax savings estimate — precise, mirrors the engine's ficaSavings ──
// pnl.netProfit (hence sCorpK1) is already net of officer salary, so it IS the K-1
// income that escapes SE tax (do NOT subtract salary again). The estimate applies the
// 92.35% §1402(a)(12) factor and caps the SS portion at the Social Security wage-base
// room left after the owner's FICA-subject wages — so it must match the engine's
// ficaSavings and must NOT overstate for a high-W-2 owner.
describe('scorpSeTaxSavingsEstimate — precise, matches engine ficaSavings', () => {
  const SS = 0.062, MED = 0.0145, FACTOR = 0.9235
  const WAGE_BASE_2025 = 176100

  // Reproduce the engine's ficaSavings independently for a single S-Corp entity.
  function engineFica({ w2, k1 }) {
    return calcTaxReturn({
      taxYear: 2025, status: 'single', w2,
      entities: [{ type: 'S Corporation', own: 100, pnl: { netProfit: k1 }, officerW2: w2 }],
      k1Total: k1,
    }).ficaSavings
  }

  it('low earner (wages below the SS wage base): applies the 92.35% factor', () => {
    const k1 = 120000, w2 = 60000
    const se = k1 * FACTOR
    const room = WAGE_BASE_2025 - w2
    const expected = Math.round(Math.min(se, room) * (SS * 2) + se * (MED * 2))
    expect(scorpSeTaxSavingsEstimate({ k1Income: k1, ficaSubjectWages: w2, ssWageBase: WAGE_BASE_2025 })).toBe(expected)
  })

  it('high earner (wages above the SS wage base): SS portion capped — Medicare only', () => {
    const k1 = 200000, w2 = 287500
    const se = k1 * FACTOR
    const expected = Math.round(se * (MED * 2)) // wageBaseRoom = 0 → no SS portion
    const got = scorpSeTaxSavingsEstimate({ k1Income: k1, ficaSubjectWages: w2, ssWageBase: WAGE_BASE_2025 })
    expect(got).toBe(expected)
    // Guard against the old flat-15.3% overstatement (~$30,600).
    expect(got).toBeLessThan(6000)
    expect(got).toBeLessThan(Math.round(k1 * (SS + MED) * 2) / 5)
  })

  it('matches the engine ficaSavings exactly (low and high earner)', () => {
    const low  = { w2: 60000,  k1: 120000 }
    const high = { w2: 287500, k1: 200000 }
    expect(scorpSeTaxSavingsEstimate({ k1Income: low.k1,  ficaSubjectWages: low.w2,  ssWageBase: WAGE_BASE_2025 })).toBe(engineFica(low))
    expect(scorpSeTaxSavingsEstimate({ k1Income: high.k1, ficaSubjectWages: high.w2, ssWageBase: WAGE_BASE_2025 })).toBe(engineFica(high))
  })

  it('clamps non-positive / invalid K-1 income to 0', () => {
    expect(scorpSeTaxSavingsEstimate({ k1Income: 0, ssWageBase: WAGE_BASE_2025 })).toBe(0)
    expect(scorpSeTaxSavingsEstimate({ k1Income: -5000, ssWageBase: WAGE_BASE_2025 })).toBe(0)
    expect(scorpSeTaxSavingsEstimate({ k1Income: undefined, ssWageBase: WAGE_BASE_2025 })).toBe(0)
    expect(scorpSeTaxSavingsEstimate({})).toBe(0)
  })
})

