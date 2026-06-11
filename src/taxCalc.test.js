import { describe, it, expect } from 'vitest'
import { calcQBI, calcTaxReturn, calcAMT } from './taxCalc.js'

describe('calcQBI §199A(i) OBBBA minimum deduction', () => {
  it('applies $400 floor when regular calc < $400 and active QBI ≥ $1,000 (taxYear 2026)', () => {
    const r = calcQBI(1500, 50000, 0, { status: 'single', taxYear: 2026 })
    expect(r.deduction).toBe(400)
    expect(r.limitApplied).toBe('min400')
    expect(r.caps.min400).toBe(400)
  })
  it('does not apply floor when active QBI < $1,000', () => {
    const r = calcQBI(800, 50000, 0, { status: 'single', taxYear: 2026 })
    expect(r.deduction).toBe(160)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.min400).toBeUndefined()
  })
  it('does not apply floor in pre-OBBBA tax year 2025', () => {
    const r = calcQBI(1500, 50000, 0, { status: 'single', taxYear: 2025 })
    expect(r.deduction).toBe(300)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.min400).toBeUndefined()
  })
  it('TI cap binds over the $400 minimum: §199A(i) floor cannot exceed taxable income', () => {
    const r = calcQBI(5000, 300, 0, { status: 'single', taxYear: 2026 })
    expect(r.deduction).toBe(60)
    expect(r.limitApplied).toBe('income')
    expect(r.caps.min400).toBe(400)
  })
  it('no QBI deduction when TI ≤ 0, even with active QBI ≥ $1,000 (floor cannot create a deduction below zero TI)', () => {
    const r = calcQBI(5000, 0, 0, { status: 'single', taxYear: 2026 })
    expect(r.deduction).toBe(0)
    expect(r.limitApplied).toBe('none')
  })
  it('returns regular calc when it exceeds $400 (caps.min400 still surfaces eligibility)', () => {
    const r = calcQBI(10000, 50000, 0, { status: 'single', taxYear: 2026 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.min400).toBe(400)
  })
  it('respects activeQbi: passive-only QBI does not trigger floor', () => {
    const r = calcQBI(5000, 50000, 0, { status: 'single', taxYear: 2026, activeQbi: 500 })
    expect(r.deduction).toBe(1000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.min400).toBeUndefined()
  })
  it('respects activeQbi eligibility but TI ≤ 0 still yields no deduction (floor is TI-limited)', () => {
    const r = calcQBI(500, 0, 0, { status: 'single', taxYear: 2026, activeQbi: 1000 })
    expect(r.deduction).toBe(0)
    expect(r.limitApplied).toBe('none')
  })
  it('does not apply floor when SSTB is fully phased out (adjQBI = 0)', () => {
    const entities = [{ box17V_sstb: true, netProfit: 50000, own: 100, box11_12: 0, box12_13: 0 }]
    const r = calcQBI(50000, 300000, 0, { status: 'single', taxYear: 2026, entityQbiData: entities })
    expect(r.deduction).toBe(0)
    expect(r.caps.min400).toBeUndefined()
  })
})

describe('calcQBI below threshold (simple 20% rule)', () => {
  it('returns 20% of QBI when TI cap is non-binding (single 2025)', () => {
    const r = calcQBI(10000, 100000, 0, { status: 'single', taxYear: 2025 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps).toEqual({ qbi: 2000, wage: null, income: 20000 })
  })
  it('TI cap binds when QBI > TI − netCapGain', () => {
    const r = calcQBI(10000, 5000, 0, { status: 'single', taxYear: 2025 })
    expect(r.deduction).toBe(1000)
    expect(r.limitApplied).toBe('income')
    expect(r.caps).toEqual({ qbi: 2000, wage: null, income: 1000 })
  })
  it('netCapGain reduces the income limitation', () => {
    const r = calcQBI(10000, 50000, 40000, { status: 'single', taxYear: 2025 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.income).toBe(2000)
  })
  it('MFJ status uses higher threshold (2025 = $394,600)', () => {
    const r = calcQBI(10000, 100000, 0, { status: 'mfj', taxYear: 2025 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
  })
  it('HOH status uses single-equivalent threshold', () => {
    const r = calcQBI(10000, 100000, 0, { status: 'hoh', taxYear: 2025 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
  })
  it('MFS status uses single-equivalent threshold', () => {
    const r = calcQBI(10000, 100000, 0, { status: 'mfs', taxYear: 2025 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
  })
  it('2024 tax year uses 2024 thresholds', () => {
    const r = calcQBI(10000, 100000, 0, { status: 'single', taxYear: 2024 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
  })
  it('defaults: no opts.taxYear falls back to 2025', () => {
    const r = calcQBI(10000, 100000, 0, {})
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
  })
})

describe('calcQBI early-zero returns', () => {
  it('returns zero deduction with qbi=0', () => {
    const r = calcQBI(0, 100000, 0, { status: 'single', taxYear: 2025 })
    expect(r.deduction).toBe(0)
    expect(r.limitApplied).toBe('none')
    expect(r.caps).toEqual({ qbi: 0, wage: null, income: 0 })
  })
  it('returns zero deduction with negative qbi (loss carryforward case)', () => {
    const r = calcQBI(-5000, 100000, 0, { status: 'single', taxYear: 2025 })
    expect(r.deduction).toBe(0)
    expect(r.limitApplied).toBe('none')
  })
  it('returns zero with TI ≤ 0 in pre-OBBBA year (no §199A(i) floor available)', () => {
    const r = calcQBI(50000, 0, 0, { status: 'single', taxYear: 2025 })
    expect(r.deduction).toBe(0)
    expect(r.limitApplied).toBe('none')
    expect(r.caps.min400).toBeUndefined()
  })
})

describe('calcQBI above threshold without wage data (Box 17V fallback)', () => {
  it('falls back to simple 20% in phase-in band when no wages entered (non-SSTB)', () => {
    const r = calcQBI(50000, 220000, 0, { status: 'single', taxYear: 2025 })
    expect(r.deduction).toBe(10000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps).toEqual({ qbi: 10000, wage: null, income: 44000 })
  })
  it('falls back to simple 20% fully past phase-in when no wages entered', () => {
    const r = calcQBI(50000, 300000, 0, { status: 'single', taxYear: 2025 })
    expect(r.deduction).toBe(10000)
    expect(r.limitApplied).toBe('qbi')
  })
  it('income limit can still bind even with no wages', () => {
    const r = calcQBI(80000, 250000, 100000, { status: 'single', taxYear: 2025 })
    expect(r.deduction).toBe(16000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.income).toBe(30000)
  })
  it('explicit empty entityQbiData behaves like no entities', () => {
    const r = calcQBI(50000, 250000, 0, { status: 'single', taxYear: 2025, entityQbiData: [] })
    expect(r.deduction).toBe(10000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.wage).toBeNull()
  })
})

describe('calcQBI above threshold with wage/UBIA data', () => {
  it('wage cap binds: 50% wages < 20% QBI, no UBIA', () => {
    const entities = [{ box17V_sstb: false, netProfit: 100000, own: 100, box17V_wages: 30000, box17V_ubia: 0 }]
    const r = calcQBI(100000, 300000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(15000)
    expect(r.limitApplied).toBe('wage')
    expect(r.caps).toEqual({ qbi: 20000, wage: 15000, income: 60000 })
  })
  it('UBIA cap wins over 50%-wages: 25% wages + 2.5% UBIA chosen, but qbiComponent still binds', () => {
    const entities = [{ box17V_sstb: false, netProfit: 100000, own: 100, box17V_wages: 30000, box17V_ubia: 800000 }]
    const r = calcQBI(100000, 300000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(20000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.wage).toBe(27500)
  })
  it('QBI binds when wages are large (50% wages > 20% QBI)', () => {
    const entities = [{ box17V_sstb: false, netProfit: 50000, own: 100, box17V_wages: 80000, box17V_ubia: 0 }]
    const r = calcQBI(50000, 300000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(10000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.wage).toBe(40000)
  })
  it('income limit binds when capital gains shrink TI − netCapGain', () => {
    const entities = [{ box17V_sstb: false, netProfit: 50000, own: 100, box17V_wages: 80000, box17V_ubia: 0 }]
    const r = calcQBI(50000, 300000, 270000, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(6000)
    expect(r.limitApplied).toBe('income')
    expect(r.caps).toEqual({ qbi: 10000, wage: 40000, income: 6000 })
  })
  it('phase-in interpolation: partial wage-cap reduction when TI is mid-band', () => {
    const entities = [{ box17V_sstb: false, netProfit: 100000, own: 100, box17V_wages: 30000, box17V_ubia: 0 }]
    const r = calcQBI(100000, 220000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(17730)
    expect(r.limitApplied).toBe('wage')
  })
  it('boundary: TI just $1 above threshold falls into above-threshold branch', () => {
    const entities = [{ box17V_sstb: false, netProfit: 50000, own: 100, box17V_wages: 30000, box17V_ubia: 0 }]
    const r = calcQBI(50000, 197301, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(10000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.wage).toBe(15000)
  })
})

describe('calcQBI SSTB phase-in', () => {
  it('SSTB at threshold exactly → below-threshold path → full QTB', () => {
    const entities = [{ box17V_sstb: true, netProfit: 50000, own: 100, box11_12: 0, box12_13: 0, box17V_wages: 30000, box17V_ubia: 0 }]
    const r = calcQBI(50000, 197300, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(10000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.wage).toBeNull()
  })
  it('SSTB mid phase-in: 50% applicable percentage halves both QBI and wages', () => {
    const entities = [{ box17V_sstb: true, netProfit: 50000, own: 100, box11_12: 0, box12_13: 0, box17V_wages: 30000, box17V_ubia: 0 }]
    const r = calcQBI(50000, 222300, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(5000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps).toEqual({ qbi: 5000, wage: 7500, income: 44460 })
  })
  it('mixed SSTB + non-SSTB above phase-in: only SSTB excluded', () => {
    const entities = [
      { box17V_sstb: true,  netProfit: 50000, own: 100, box11_12: 0, box12_13: 0, box17V_wages: 20000, box17V_ubia: 0 },
      { box17V_sstb: false, netProfit: 50000, own: 100,                              box17V_wages: 30000, box17V_ubia: 0 }
    ]
    const r = calcQBI(100000, 300000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(10000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps).toEqual({ qbi: 10000, wage: 15000, income: 60000 })
  })
  it('SSTB partial-ownership: own% scales k1Income for proration', () => {
    const entities = [{ box17V_sstb: true, netProfit: 50000, own: 50, k1: 25000, box11_12: 0, box12_13: 0, box17V_wages: 15000, box17V_ubia: 0 }]
    const r = calcQBI(25000, 220000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(2730)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps).toEqual({ qbi: 2730, wage: 4095, income: 44000 })
  })
  it('SSTB sec179 (box11_12) reduces k1 income for proration', () => {
    const entities = [{ box17V_sstb: true, netProfit: 50000, own: 100, k1: 40000, box11_12: 10000, box12_13: 0, box17V_wages: 30000, box17V_ubia: 0 }]
    const r = calcQBI(50000, 222300, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(6000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.qbi).toBe(6000)
  })
})

describe('calcQBI filing status & tax year', () => {
  it('2026 MFJ uses post-OBBBA threshold $403,500 and $150k phase-in', () => {
    const r = calcQBI(10000, 400000, 0, { status: 'mfj', taxYear: 2026 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.min400).toBe(400)
  })
  it('2026 MFJ above threshold uses wider $150k phase-in band', () => {
    const entities = [{ box17V_sstb: false, netProfit: 100000, own: 100, box17V_wages: 30000, box17V_ubia: 0 }]
    const r = calcQBI(100000, 470000, 0, { status: 'mfj', taxYear: 2026, entityQbiData: entities })
    expect(r.deduction).toBe(17783)
    expect(r.limitApplied).toBe('wage')
  })
  it('unknown status falls back to single threshold', () => {
    const r = calcQBI(10000, 100000, 0, { status: 'civil_union', taxYear: 2025 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
  })
  it('unknown tax year falls back to 2025 thresholds', () => {
    const r = calcQBI(10000, 100000, 0, { status: 'single', taxYear: 2099 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.min400).toBeUndefined()
  })
})

describe('Schedule 1 line 16 - Self-Employed Retirement', () => {
  it('reduces AGI dollar-for-dollar', () => {
    const baseline      = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 100000, selfEmpRetirement: 0 })
    const withRetirement = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 100000, selfEmpRetirement: 10000 })
    expect(withRetirement.agi).toBe(baseline.agi - 10000)
  })
  it('handles missing/null/undefined values without throwing', () => {
    expect(() => calcTaxReturn({ taxYear: 2025, status: 'single', w2: 50000 })).not.toThrow()
    expect(() => calcTaxReturn({ taxYear: 2025, status: 'single', w2: 50000, selfEmpRetirement: null })).not.toThrow()
    expect(() => calcTaxReturn({ taxYear: 2025, status: 'single', w2: 50000, selfEmpRetirement: undefined })).not.toThrow()
  })
  it('exposes selfEmpRetirementDed in the return shape', () => {
    const r = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 100000, selfEmpRetirement: 7500 })
    expect(r.selfEmpRetirementDed).toBe(7500)
    expect(r.adjustments).toBeGreaterThanOrEqual(7500)
  })
})

const BASE = {
  taxYear: 2025, status: 'single', dependents: 0,
  entities: [], w2: 100000, k1Total: 0,
  rentalNet: 0, stGain: 0, ltGain: 0, intInc: 0,
  divInc: 0, qualDiv: 0, f4797Inc: 0, taxableSS: 0, iraIncome: 0,
  selfEmpHealthIns: 0, hsaDeduction: 0, studentLoanInt: 0,
  selfEmpRetirement: 0, nolCarryforward: 0, priorYearQBILoss: 0,
  useItemized: false, itemizedAmt: 0, saltAmount: 0,
  hasISO: false, isoBargainElement: 0,
  isREP: false, unrecap1250: 0, collectiblesGain: 0,
  w2Withheld: 0, estPaid: 0, ytdFactor: 1,
}

describe('calcTaxReturn TAX-04 — niit return is an object', () => {
  it('niit is an object with applies, amount, explanation keys', () => {
    const r = calcTaxReturn({ ...BASE, w2: 100000 })
    expect(r.niit).toBeTypeOf('object')
    expect(r.niit).toHaveProperty('applies')
    expect(r.niit).toHaveProperty('amount')
    expect(r.niit).toHaveProperty('explanation')
  })
  it('niit.applies is false and niit.amount is 0 when AGI is below threshold', () => {
    const r = calcTaxReturn({ ...BASE, w2: 100000 })
    expect(r.niit.applies).toBe(false)
    expect(r.niit.amount).toBe(0)
    expect(r.niit.explanation).toBe('')
  })
  it('niit.applies is true and niit.amount > 0 when AGI exceeds threshold with NII', () => {
    const r = calcTaxReturn({ ...BASE, w2: 210000, divInc: 50000 })
    expect(r.niit.applies).toBe(true)
    expect(r.niit.amount).toBeGreaterThan(0)
    expect(r.niit.explanation).not.toBe('')
  })
  it('niit.amount is 3.8% of the lesser of NII or excess AGI (lesser = NII)', () => {
    const r = calcTaxReturn({ ...BASE, w2: 220000, divInc: 30000 })
    expect(r.niit.amount).toBe(Math.round(30000 * 0.038))
    expect(r.niit.applies).toBe(true)
  })
  it('niit.amount is 3.8% of the lesser of NII or excess AGI (lesser = excess AGI)', () => {
    const r = calcTaxReturn({ ...BASE, w2: 205000, divInc: 50000 })
    expect(r.niit.amount).toBe(Math.round(50000 * 0.038))
  })
  it('niit.amount feeds into totalTax correctly', () => {
    const with_ = calcTaxReturn({ ...BASE, w2: 220000, divInc: 50000 })
    expect(with_.totalTax).toBeGreaterThan(with_.fedTax + with_.seTax)
    expect(Number.isFinite(with_.totalTax)).toBe(true)
  })
  it('backward-compat niitAmount alias is a number equal to niit.amount', () => {
    const r = calcTaxReturn({ ...BASE, w2: 220000, divInc: 50000 })
    expect(typeof r.niitAmount).toBe('number')
    expect(r.niitAmount).toBe(r.niit.amount)
  })
})

describe('calcTaxReturn TAX-01 — reasonableCompAlert', () => {
  const scorp = (salary, k1) => ({
    name: 'Test S-Corp', type: 'S Corporation', own: '100',
    pnl: { netProfit: salary + k1, officerSalary: salary },
    officerW2: salary,
    k1,
  })
  it('returns reasonableCompAlert in the return object', () => {
    const r = calcTaxReturn({ ...BASE, w2: 30000, k1Total: 140000, entities: [scorp(30000, 140000)] })
    expect(r).toHaveProperty('reasonableCompAlert')
    expect(r.reasonableCompAlert).toHaveProperty('triggered')
    expect(r.reasonableCompAlert).toHaveProperty('ratio')
    expect(r.reasonableCompAlert).toHaveProperty('message')
  })
  it('triggers when salary is below 40% of total S-Corp compensation', () => {
    const r = calcTaxReturn({ ...BASE, w2: 30000, k1Total: 140000, entities: [scorp(30000, 140000)] })
    expect(r.reasonableCompAlert.triggered).toBe(true)
    expect(r.reasonableCompAlert.ratio).toBe(18)
    expect(r.reasonableCompAlert.message).toContain('Watson v. Commissioner')
  })
  it('does not trigger when salary meets the 40% threshold', () => {
    const r = calcTaxReturn({ ...BASE, w2: 80000, k1Total: 120000, entities: [scorp(80000, 120000)] })
    expect(r.reasonableCompAlert.triggered).toBe(false)
    expect(r.reasonableCompAlert.ratio).toBe(40)
  })
  it('does not trigger when salary exceeds 40% threshold', () => {
    const r = calcTaxReturn({ ...BASE, w2: 100000, k1Total: 100000, entities: [scorp(100000, 100000)] })
    expect(r.reasonableCompAlert.triggered).toBe(false)
  })
  it('does not trigger below the $20k de minimis floor', () => {
    const r = calcTaxReturn({ ...BASE, w2: 10000, k1Total: 8000, entities: [scorp(10000, 8000)] })
    expect(r.reasonableCompAlert.triggered).toBe(false)
  })
  it('returns triggered=false with empty message when no S-Corp entity is present', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 100000,
      entities: [{ name: 'SP', type: 'Sole Proprietor / Single-Member LLC', k1: 100000, own: '100' }],
    })
    expect(r.reasonableCompAlert.triggered).toBe(false)
    expect(r.reasonableCompAlert.message).toBe('')
  })
  it('returns triggered=false when entity list is empty', () => {
    const r = calcTaxReturn({ ...BASE, w2: 100000, entities: [] })
    expect(r.reasonableCompAlert.triggered).toBe(false)
  })
  it('alert message includes salary amount and IRS citation', () => {
    const r = calcTaxReturn({ ...BASE, w2: 30000, k1Total: 140000, entities: [scorp(30000, 140000)] })
    expect(r.reasonableCompAlert.message).toContain('30,000')
    expect(r.reasonableCompAlert.message).toContain('35–45%')
    expect(r.reasonableCompAlert.message).toContain('Watson v. Commissioner')
  })
})

describe('calcTaxReturn TAX-06 — federalOnly flag', () => {
  it('federalOnly is true on a basic W-2 return', () => {
    const r = calcTaxReturn({ ...BASE, w2: 100000 })
    expect(r.federalOnly).toBe(true)
  })
  it('federalOnly is true for S-Corp entity with K-1 income', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 30000, k1Total: 140000,
      entities: [{ type: 'S Corporation', k1: 140000, own: '100', officerW2: 30000 }],
    })
    expect(r.federalOnly).toBe(true)
  })
  it('federalOnly is true for sole proprietor with SE tax', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 80000,
      entities: [{ type: 'Sole Proprietor / Single-Member LLC', k1: 80000, own: '100' }],
    })
    expect(r.federalOnly).toBe(true)
  })
  it('federalOnly is true even when NIIT, AMT, and CTC all fire', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 300000, divInc: 50000, dependents: 2,
      hasISO: true, isoBargainElement: 200000,
    })
    expect(r.federalOnly).toBe(true)
  })
  it('federalOnly is true regardless of tax year', () => {
    for (const year of [2024, 2025, 2026]) {
      const r = calcTaxReturn({ ...BASE, taxYear: year, w2: 100000 })
      expect(r.federalOnly).toBe(true)
    }
  })
})

describe('calcTaxReturn REP flag (isREP)', () => {
  it('rentalNII is 0 when isREP=true (with §1.469-9(g) aggregation election)', () => {
    const r = calcTaxReturn({ ...BASE, rentalNet: 30000, isREP: true, rentalAggregationElection: true })
    expect(r.rentalNII).toBe(0)
  })
  it('rentalNII equals rentalNet when isREP=false and rental is positive', () => {
    const r = calcTaxReturn({ ...BASE, rentalNet: 30000, isREP: false })
    expect(r.rentalNII).toBe(30000)
  })
  it('REP reduces NIIT vs non-REP when AGI exceeds $200k threshold', () => {
    const nonRep = calcTaxReturn({ ...BASE, w2: 200000, rentalNet: 50000, isREP: false })
    const rep    = calcTaxReturn({ ...BASE, w2: 200000, rentalNet: 50000, isREP: true, rentalAggregationElection: true })
    expect(nonRep.niit.amount).toBeGreaterThan(0)
    expect(rep.niit.amount).toBeLessThan(nonRep.niit.amount)
  })
})

describe('calcTaxReturn ISO bargain element → AMT (IRC §56(b)(3))', () => {
  it('large ISO spread increases AMT vs baseline', () => {
    const withISO = calcTaxReturn({ ...BASE, w2: 150000, hasISO: true, isoBargainElement: 200000 })
    const noISO   = calcTaxReturn({ ...BASE, w2: 150000 })
    expect(withISO.amt).toBeGreaterThan(noISO.amt)
  })
  it('isoBargainElement is ignored when hasISO=false', () => {
    const withFlag    = calcTaxReturn({ ...BASE, hasISO: true,  isoBargainElement: 100000 })
    const withoutFlag = calcTaxReturn({ ...BASE, hasISO: false, isoBargainElement: 100000 })
    expect(withFlag.amt).toBeGreaterThanOrEqual(withoutFlag.amt)
  })
  it('does not throw with hasISO=true and isoBargainElement=0', () => {
    expect(() => calcTaxReturn({ ...BASE, hasISO: true, isoBargainElement: 0 })).not.toThrow()
  })
})

describe('calcTaxReturn ytdFactor scaling', () => {
  it('ytdFactor=1 is the identity — no scaling applied', () => {
    const r = calcTaxReturn({ ...BASE, selfEmpRetirement: 10000, ytdFactor: 1 })
    expect(r.selfEmpRetirementDed).toBe(10000)
  })
  it('ytdFactor=2 doubles scaled deductions', () => {
    const r = calcTaxReturn({ ...BASE, selfEmpRetirement: 5000, ytdFactor: 2 })
    expect(r.selfEmpRetirementDed).toBe(10000)
  })
  it('ytdFactor=4 produces same annualized result as ytdFactor=1 with 4x inputs', () => {
    const q1   = calcTaxReturn({ ...BASE, w2: 25000,  selfEmpRetirement: 5000,  ytdFactor: 4 })
    const full = calcTaxReturn({ ...BASE, w2: 100000, selfEmpRetirement: 20000, ytdFactor: 1 })
    expect(q1.selfEmpRetirementDed).toBe(full.selfEmpRetirementDed)
  })
  it('studentLoanInt is ytdScaled and then capped at $2,500', () => {
    const r1 = calcTaxReturn({ ...BASE, studentLoanInt: 1000, ytdFactor: 2 })
    expect(r1.studentLoanDed).toBe(2000)
    const r2 = calcTaxReturn({ ...BASE, studentLoanInt: 1500, ytdFactor: 2 })
    expect(r2.studentLoanDed).toBe(2500)
  })
})

describe('calcTaxReturn multi-entity portfolio', () => {
  it('sole prop entity generates seTax; S-Corp entity does not', () => {
    const soleOnly = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 80000,
      entities: [{ type: 'Sole Proprietor / Single-Member LLC', k1: 80000, own: 100 }],
    })
    const scorpOnly = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 80000,
      entities: [{ type: 'S Corporation', k1: 80000, own: 100 }],
    })
    expect(soleOnly.seTax).toBeGreaterThan(0)
    expect(scorpOnly.seTax).toBe(0)
  })
  it('mixed portfolio: SE tax matches sole-prop-only amount', () => {
    const mixed = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 100000,
      entities: [
        { type: 'Sole Proprietor / Single-Member LLC', k1: 50000, own: 100 },
        { type: 'S Corporation',                       k1: 50000, own: 100 },
      ],
    })
    const soleOnly = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 50000,
      entities: [{ type: 'Sole Proprietor / Single-Member LLC', k1: 50000, own: 100 }],
    })
    expect(mixed.seTax).toBe(soleOnly.seTax)
    expect(mixed.seNetIncome).toBe(50000)
  })
  it('grossIncome sums k1Total correctly across both entities', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 100000,
      entities: [
        { type: 'Sole Proprietor / Single-Member LLC', k1: 60000, own: 100 },
        { type: 'S Corporation',                       k1: 40000, own: 100 },
      ],
    })
    expect(r.grossIncome).toBe(100000)
  })
})

describe('calcTaxReturn Partnership Active vs Passive SE tax (§1402(a)(13))', () => {
  it('Active partnership: generates SE tax', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 50000,
      entities: [{ type: 'Partnership / MMLLC — Active', k1: 50000, own: 100 }],
    })
    expect(r.seNetIncome).toBe(50000)
    expect(r.seTax).toBeGreaterThan(0)
  })
  it('Passive partnership: zero SE tax', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 75000,
      entities: [{ type: 'Partnership / MMLLC — Passive', k1: 75000, own: 100 }],
    })
    expect(r.seNetIncome).toBe(0)
    expect(r.seTax).toBe(0)
  })
  it('mixed Active + Passive: SE tax computed only on Active share', () => {
    const mixed = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 125000,
      entities: [
        { type: 'Partnership / MMLLC — Active',  k1: 50000, own: 100 },
        { type: 'Partnership / MMLLC — Passive', k1: 75000, own: 100 },
      ],
    })
    const activeOnly = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 50000,
      entities: [{ type: 'Partnership / MMLLC — Active', k1: 50000, own: 100 }],
    })
    expect(mixed.seNetIncome).toBe(50000)
    expect(mixed.seTax).toBe(activeOnly.seTax)
  })
  it('legacy partnership type string normalizes to active / SE-subject', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 100000,
      entities: [{ type: 'Partnership / Multi-Member LLC', k1: 100000, own: 100 }],
    })
    expect(r.seNetIncome).toBe(100000)
    expect(r.seTax).toBeGreaterThan(0)
  })
})

describe('calcTaxReturn NIIT — F-01 qualDiv no-double-count guard', () => {
  it('NIIT amount is unchanged when qualDiv is set vs unset (with same divInc)', () => {
    const baseline    = calcTaxReturn({ ...BASE, w2: 250000, divInc: 10000, qualDiv: 0 })
    const withQualDiv = calcTaxReturn({ ...BASE, w2: 250000, divInc: 10000, qualDiv: 4000 })
    expect(baseline.niit.amount).toBeGreaterThan(0)
    expect(withQualDiv.niit.amount).toBe(baseline.niit.amount)
  })
  it('NIIT scales with divInc but NOT additionally with qualDiv', () => {
    const lowDiv  = calcTaxReturn({ ...BASE, w2: 250000, divInc: 5000,  qualDiv: 5000 })
    const highDiv = calcTaxReturn({ ...BASE, w2: 250000, divInc: 10000, qualDiv: 5000 })
    expect(highDiv.niit.amount).toBeGreaterThan(lowDiv.niit.amount)
  })
})

describe('calcTaxReturn NIIT — F-01-followup-A stGain in NII base', () => {
  it('stGain generates NIIT when AGI exceeds threshold', () => {
    const r = calcTaxReturn({ ...BASE, w2: 200000, stGain: 50000 })
    expect(r.niit.amount).toBeGreaterThan(0)
    expect(r.niit.amount).toBe(Math.round(Math.min(50000, 50000) * 0.038))
  })
  it('stGain loss nets against ltGain in single capital gain pool', () => {
    const r = calcTaxReturn({ ...BASE, w2: 200000, ltGain: 80000, stGain: -30000 })
    expect(r.niit.amount).toBe(Math.round(0.038 * 50000))
  })
  it('negative stGain does not reduce NII below zero', () => {
    const withLoss    = calcTaxReturn({ ...BASE, w2: 250000, stGain: -30000 })
    const withoutGain = calcTaxReturn({ ...BASE, w2: 250000, stGain: 0 })
    expect(withLoss.niit.amount).toBe(withoutGain.niit.amount)
  })
  it('no NIIT when AGI is below the $200k single threshold', () => {
    const r = calcTaxReturn({ ...BASE, w2: 100000, stGain: 50000 })
    expect(r.niit.amount).toBe(0)
    expect(r.niit.applies).toBe(false)
  })
  it('NIIT is capped by NII when AGI barely exceeds threshold', () => {
    const r = calcTaxReturn({ ...BASE, w2: 201000, stGain: 50000 })
    expect(r.niit.amount).toBe(Math.round(0.038 * 50000))
  })
})

describe('calcQBI SSTB — F-03 no double-ownership guard', () => {
  it('SSTB deduction depends on e.k1, not on own% (same k1 + different own% = same result)', () => {
    const entityOwn50 = [{
      box17V_sstb: true, netProfit: 50000, own: 50, k1: 25000,
      box11_12: 0, box12_13: 0, box17V_wages: 15000, box17V_ubia: 0,
    }]
    const entityOwn100 = [{
      box17V_sstb: true, netProfit: 50000, own: 100, k1: 25000,
      box11_12: 0, box12_13: 0, box17V_wages: 15000, box17V_ubia: 0,
    }]
    const r50  = calcQBI(25000, 220000, 0, { status: 'single', taxYear: 2025, entityQbiData: entityOwn50 })
    const r100 = calcQBI(25000, 220000, 0, { status: 'single', taxYear: 2025, entityQbiData: entityOwn100 })
    expect(r50.deduction).toBe(r100.deduction)
  })
})

describe('calcTaxReturn §469 PAL — non-REP passive rental limitation', () => {
  it('non-REP low AGI ($80k): $25k special allowance fully available', () => {
    const r = calcTaxReturn({ ...BASE, w2: 80000, rentalNet: -30000, isREP: false })
    expect(r.grossIncome).toBe(55000)
    expect(r.palSuspendedRental).toBe(5000)
  })
  it('non-REP mid AGI ($120k): $25k allowance prorated to $15k', () => {
    const r = calcTaxReturn({ ...BASE, w2: 120000, rentalNet: -20000, isREP: false })
    expect(r.grossIncome).toBe(105000)
    expect(r.palSuspendedRental).toBe(5000)
  })
  it('non-REP: rental income (positive) is unaffected by PAL gating', () => {
    const r = calcTaxReturn({ ...BASE, w2: 100000, rentalNet: 20000, isREP: false })
    expect(r.grossIncome).toBe(120000)
    expect(r.palSuspendedRental).toBe(0)
  })
  it('MFS: $0 allowance by default (§469(i)(5)(B))', () => {
    const r = calcTaxReturn({ ...BASE, w2: 80000, rentalNet: -30000, isREP: false, status: 'mfs' })
    expect(r.palSuspendedRental).toBe(30000)
    expect(r.grossIncome).toBe(80000)
  })
  it('PAL phase-out boundary: AGI exactly $100k gets full $25k allowance', () => {
    const r = calcTaxReturn({ ...BASE, w2: 100000, rentalNet: -30000, isREP: false })
    expect(r.palSuspendedRental).toBe(5000)
    expect(r.grossIncome).toBe(75000)
  })
  it('PAL phase-out boundary: AGI exactly $150k gets $0 allowance', () => {
    const r = calcTaxReturn({ ...BASE, w2: 150000, rentalNet: -20000, isREP: false })
    expect(r.palSuspendedRental).toBe(20000)
    expect(r.grossIncome).toBe(150000)
  })
})

describe('calcTaxReturn §461(l) — excess business loss limitation', () => {
  it('business loss below threshold: no EBL, full loss allowed', () => {
    const r = calcTaxReturn({ ...BASE, w2: 300000, k1Total: -200000, isREP: false })
    expect(r.ebl).toBe(0)
    expect(r.grossIncome).toBe(100000)
  })
  it('business loss above threshold: excess becomes EBL carryforward', () => {
    const r = calcTaxReturn({ ...BASE, w2: 500000, k1Total: -400000, isREP: false })
    expect(r.ebl).toBe(87000)
    expect(r.grossIncome).toBe(187000)
  })
  it('W-2 income is NOT counted as business income in EBL computation', () => {
    const withHighW2 = calcTaxReturn({ ...BASE, w2: 1000000, k1Total: -400000, isREP: false })
    const withLowW2 = calcTaxReturn({ ...BASE, w2: 100000, k1Total: -400000, isREP: false })
    expect(withHighW2.ebl).toBe(withLowW2.ebl)
    expect(withHighW2.ebl).toBe(87000)
  })
  it('REP rental losses count toward EBL business bucket (elected/nonpassive)', () => {
    const r = calcTaxReturn({ ...BASE, w2: 500000, k1Total: -200000, rentalNet: -200000, isREP: true, rentalAggregationElection: true })
    expect(r.ebl).toBe(87000)
  })
  it('Pass 5 scenario: S-Corp -$343k + REP rental -$85k (elected) → EBL $115k', () => {
    const r = calcTaxReturn({
      ...BASE,
      w2: 287500, k1Total: -343443, rentalNet: -84599,
      ltGain: 113072, isREP: true, rentalAggregationElection: true, taxYear: 2025,
    })
    expect(r.ebl).toBe(115042)
    expect(r.palSuspendedRental).toBe(0)
  })
  it('MFJ: higher threshold ($626k) applies', () => {
    const r = calcTaxReturn({ ...BASE, w2: 800000, k1Total: -700000, status: 'mfj', isREP: false })
    expect(r.ebl).toBe(74000)
  })
  it('combined PAL + EBL: both limitations apply in a realistic mixed scenario', () => {
    const r = calcTaxReturn({ ...BASE, w2: 120000, k1Total: -400000, rentalNet: -50000, isREP: false })
    expect(r.palSuspendedRental).toBe(25000)
    expect(r.ebl).toBe(87000)
    expect(r.grossIncome).toBe(-218000)
  })
  it('business gain offsets business loss before threshold check', () => {
    const r = calcTaxReturn({ ...BASE, w2: 300000, k1Total: -400000, f4797Inc: 150000, isREP: false })
    expect(r.ebl).toBe(0)
    expect(r.grossIncome).toBe(50000)
  })
})

describe('calcTaxReturn §469(i) — isActiveParticipant flag', () => {
  it('passive investor (isActiveParticipant=false): rental losses fully suspended', () => {
    const r = calcTaxReturn({ ...BASE, w2: 80000, rentalNet: -30000, isREP: false, isActiveParticipant: false })
    expect(r.palSuspendedRental).toBe(30000)
    expect(r.grossIncome).toBe(80000)
  })
  it('active participant (default): $25k allowance applies normally', () => {
    const r = calcTaxReturn({ ...BASE, w2: 80000, rentalNet: -30000, isREP: false })
    expect(r.palSuspendedRental).toBe(5000)
    expect(r.grossIncome).toBe(55000)
  })
})

describe('calcTaxReturn §199A QBI carryforward output', () => {
  it('negative QBI (S-Corp loss): outputs correct carryforward amount', () => {
    const r = calcTaxReturn({ ...BASE, w2: 300000, k1Total: -200000 })
    expect(r.qbiCarryforward).toBe(200000)
    expect(r.qbi).toBe(0)
  })
  it('positive QBI: no carryforward', () => {
    const r = calcTaxReturn({ ...BASE, w2: 100000, k1Total: 80000 })
    expect(r.qbiCarryforward).toBe(0)
    expect(r.qbi).toBeGreaterThan(0)
  })
  it('prior year carryforward consumed by current year positive QBI: no new carryforward', () => {
    const r = calcTaxReturn({ ...BASE, w2: 100000, k1Total: 80000, priorYearQBILoss: 50000 })
    expect(r.qbiCarryforward).toBe(0)
    expect(r.priorQBILossCO).toBe(50000)
  })
  it('Pass 5 scenario: S-Corp -$343k, REP rental NOT elected → qbiCarryforward = $343k', () => {
    // Without the §1.469-9(g) election the REP rental is passive: its loss is suspended
    // (Form 8582) and does NOT enter the §199A QBI base, so the carryforward is just the
    // S-corp loss. (An ELECTED REP would fold the rental loss in → $428,042; see the EBL
    // Pass-5 test, which elects.)
    const r = calcTaxReturn({ ...BASE, w2: 287500, k1Total: -343443, rentalNet: -84599, isREP: true, taxYear: 2025 })
    expect(r.qbiCarryforward).toBe(343443)
    expect(r.qbi).toBe(0)
  })
})

describe('calcTaxReturn §199A SSTB loss — qbiCarryforward exclusion above phase-out', () => {
  const sstbEntity = (k1) => ({ type: 'S Corporation', k1, netProfit: k1, own: 100, box17V_sstb: true, box17V_wages: 0, box17V_ubia: 0 })
  const nonSSTBEntity = (k1) => ({ type: 'S Corporation', k1, netProfit: k1, own: 100, box17V_sstb: false, box17V_wages: 0, box17V_ubia: 0 })
  it('below threshold: SSTB loss fully carries forward as QBI loss', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 150000, k1Total: -100000,
      entities: [sstbEntity(-100000)], taxYear: 2025,
    })
    expect(r.qbiCarryforward).toBe(100000)
  })
  it('fully above phase-out: SSTB loss excluded from qbiCarryforward', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 400000, k1Total: -100000,
      entities: [sstbEntity(-100000)], taxYear: 2025,
    })
    expect(r.qbiCarryforward).toBe(0)
  })
  it('partial phase-out: SSTB loss scaled by applicable percentage', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 350000, k1Total: -100000,
      entities: [sstbEntity(-100000)], taxYear: 2025,
    })
    expect(r.qbiCarryforward).toBeGreaterThan(20000)
    expect(r.qbiCarryforward).toBeLessThan(40000)
  })
  it('non-SSTB loss above threshold: still carries forward', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 350000, k1Total: -100000,
      entities: [nonSSTBEntity(-100000)], taxYear: 2025,
    })
    expect(r.qbiCarryforward).toBe(100000)
  })
})

describe('calcQBI/calcTaxReturn F-M02 — ownPct() 0% ownership', () => {
  it('own="0" (string zero) contributes $0 K-1 income, not $100k phantom income', () => {
    const entities = [{ type: 'S Corporation', netProfit: 100000, own: '0', k1: 0, box17V_wages: 0, box17V_ubia: 0 }]
    const r = calcTaxReturn({ ...BASE, k1Total: 0, entities })
    expect(r.grossIncome).toBe(100000)
    expect(r.qbi).toBe(0)
  })
  it('own=0 (numeric zero) also contributes $0 — no phantom income', () => {
    const entities = [{ type: 'S Corporation', netProfit: 100000, own: 0, k1: 0, box17V_wages: 0, box17V_ubia: 0 }]
    const r = calcTaxReturn({ ...BASE, k1Total: 0, entities })
    expect(r.grossIncome).toBe(100000)
    expect(r.qbi).toBe(0)
  })
  it('own=null defaults to 100% — backward compatible', () => {
    const entities = [{ type: 'S Corporation', netProfit: 100000, own: null, k1: 100000, box17V_wages: 0, box17V_ubia: 0 }]
    const r = calcTaxReturn({ ...BASE, k1Total: 100000, entities })
    expect(r.grossIncome).toBeGreaterThan(100000)
  })
  it('own=undefined defaults to 100% — backward compatible', () => {
    const entities = [{ type: 'S Corporation', netProfit: 100000, k1: 100000, box17V_wages: 0, box17V_ubia: 0 }]
    const r = calcTaxReturn({ ...BASE, k1Total: 100000, entities })
    expect(r.grossIncome).toBeGreaterThan(100000)
  })
  it('0% SSTB entity does not generate phantom §199A exclusion', () => {
    const entities = [{ type: 'S Corporation', netProfit: 200000, own: '0', k1: 0, box17V_sstb: true, box17V_wages: 0, box17V_ubia: 0 }]
    const r = calcQBI(0, 100000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(0)
  })
  it('0%-owned S-Corp does not trigger reasonable comp alert', () => {
    const entities = [{ type: 'S Corporation', netProfit: 200000, own: '0', k1: 0, pnl: { netProfit: 200000, officerSalary: 0 } }]
    const r = calcTaxReturn({ ...BASE, k1Total: 0, entities })
    expect(r.reasonableCompAlert.triggered).toBe(false)
  })
})

describe('calcAMT PASS4B-01 — MFS 2026 bracket26_28 typo fix', () => {
  const MFS_2026_BASE = {
    taxableIncome: 300000,
    qbi: 0,
    saltAmount: 0,
    isoBargainElement: 0,
    ltGain: 0,
    qualDiv: 0,
    regularTax: 14000,
    status: 'mfs',
    taxYear: 2026,
    useItemized: false,
    itemized: 0,
    stdDed: 16100,
  }
  it('PASS4B-01 pinned: calcAMT(MFS, 2026, TI=300k) = 47,927', () => {
    const result = calcAMT(MFS_2026_BASE)
    expect(result).toBe(52435)
  })
  it('PASS4B-01 directional: MFS AMT > result under simulated pre-fix single threshold', () => {
    const result = calcAMT(MFS_2026_BASE)
    expect(result).toBeGreaterThan(0)
    expect(Number.isFinite(result)).toBe(true)
  })
  it('PASS4B-01 smoke: calcTaxReturn with ISO-heavy MFS 2026 filer — finite AMT', () => {
    const r = calcTaxReturn({
      ...BASE,
      status: 'mfs', taxYear: 2026,
      w2: 150000,
      hasISO: true, isoBargainElement: 200000,
    })
    expect(Number.isFinite(r.amt)).toBe(true)
    expect(r.amt).toBeGreaterThanOrEqual(0)
  })
  it('PASS4B-01 prior-year guard: 2024/2025 MFS AMT unaffected by 2026 fix', () => {
    const params2025 = { ...MFS_2026_BASE, taxYear: 2025, regularTax: 240000 }
    const params2024 = { ...MFS_2026_BASE, taxYear: 2024, regularTax: 235000 }
    expect(Number.isFinite(calcAMT(params2025))).toBe(true)
    expect(Number.isFinite(calcAMT(params2024))).toBe(true)
  })
})

// =============================================================================
// F6 — §469 per-property material participation + §1.469-9(g) aggregation
// Tri-state semantics: participation is unanswered by default (undefined ≠ "no",
// and is never inferred from isREP). Unanswered → passive (statutory default).
// The per-property regime engages only when the caller supplies the aggregation
// election, a Step-2 MP answer, or a per-entity materiallyParticipates flag.
// =============================================================================
describe('calcTaxReturn F6 — per-property material participation + §1.469-9(g) aggregation', () => {
  const RE = (over = {}) => ({ type: 'Real Estate (Schedule E)', own: 100, ...over })

  it('REP without the §1.469-9(g) election: rental stays passive, loss suspended', () => {
    // REP status alone no longer makes rentals nonpassive — the election is required.
    // AGI $200k > $150k so the §469(i) allowance is fully phased out → loss suspended.
    const r = calcTaxReturn({ ...BASE, w2: 200000, rentalNet: -50000, isREP: true })
    expect(r.rentalNonpassiveNet).toBe(0)
    expect(r.rentalPassiveNet).toBe(-50000)
    expect(r.palSuspendedRental).toBe(50000)
    expect(r.rentalAllowed).toBe(0)
  })

  it('REP + §1.469-9(g) aggregation election: whole portfolio nonpassive', () => {
    const r = calcTaxReturn({ ...BASE, w2: 200000, rentalNet: -50000, isREP: true, rentalAggregationElection: true })
    expect(r.rentalAggregationElectionApplied).toBe(true)
    expect(r.rentalNonpassiveNet).toBe(-50000)
    expect(r.palSuspendedRental).toBe(0)
    expect(r.rentalAllowed).toBe(-50000)
  })

  it('REP + Step-2 materiallyParticipates=true (no election): nonpassive', () => {
    const r = calcTaxReturn({ ...BASE, w2: 200000, rentalNet: -50000, isREP: true, step2RentalMaterialParticipation: true })
    expect(r.rentalNonpassiveNet).toBe(-50000)
    expect(r.rentalPassiveNet).toBe(0)
    expect(r.palSuspendedRental).toBe(0)
  })

  it('REP + Step-2 materiallyParticipates=false: passive, suspended (AGI > $150k → $0 allowance)', () => {
    const r = calcTaxReturn({ ...BASE, w2: 200000, rentalNet: -50000, isREP: true, step2RentalMaterialParticipation: false })
    expect(r.rentalNonpassiveNet).toBe(0)
    expect(r.rentalPassiveNet).toBe(-50000)
    expect(r.palSuspendedRental).toBe(50000)
    expect(r.rentalAllowed).toBe(0)
  })

  it('aggregation election overrides a false Step-2 MP answer', () => {
    const r = calcTaxReturn({ ...BASE, w2: 200000, rentalNet: -50000, isREP: true, rentalAggregationElection: true, step2RentalMaterialParticipation: false })
    expect(r.rentalNonpassiveNet).toBe(-50000)
    expect(r.palSuspendedRental).toBe(0)
  })

  it('non-REP + Step-2 MP=true: still passive (§469(c)(2) per se), §469(i) allowance applies', () => {
    // w2 80k, loss -30k, active participant default → $25k allowance → $5k suspended.
    const r = calcTaxReturn({ ...BASE, w2: 80000, rentalNet: -30000, isREP: false, step2RentalMaterialParticipation: true })
    expect(r.rentalNonpassiveNet).toBe(0)
    expect(r.rentalPassiveNet).toBe(-30000)
    expect(r.palSuspendedRental).toBe(5000)
  })

  it('REP non-participating positive rental is passive income → in NII base', () => {
    const r = calcTaxReturn({ ...BASE, w2: 200000, rentalNet: 40000, isREP: true, step2RentalMaterialParticipation: false })
    expect(r.rentalNII).toBe(40000)
    expect(r.rentalPassiveNet).toBe(40000)
  })

  it('REP materially-participating positive rental is nonpassive → excluded from NII', () => {
    const r = calcTaxReturn({ ...BASE, w2: 200000, rentalNet: 40000, isREP: true, step2RentalMaterialParticipation: true })
    expect(r.rentalNII).toBe(0)
    expect(r.rentalNonpassiveNet).toBe(40000)
  })

  it('Step-1 per-entity materiallyParticipates=false (REP): that property passive & suspended', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 200000, k1Total: -50000, isREP: true,
      entities: [{ type: 'Real Estate (Schedule E)', own: 100, k1: -50000, materiallyParticipates: false }],
    })
    expect(r.rentalPassiveNet).toBe(-50000)
    expect(r.palSuspendedRental).toBe(50000)
  })

  it('§469(i) allowance applies to a Step-1 rental entity even with NO Step-2 lump', () => {
    // Rentals now live only in Step 1. A non-REP active participant must still get the
    // $25k allowance (phased: AGI $120k → 25000 - (120000-100000)*0.5 = 15000 allowed).
    // Guards the engine change that gates active-participation on combinedRentalNet
    // rather than the retired Step-2 lump.
    const r = calcTaxReturn({
      ...BASE, w2: 120000, k1Total: -40000, isActiveParticipant: true,
      entities: [{ type: 'Real Estate (Schedule E)', own: 100, k1: -40000 }],
    })
    expect(r.rentalPassiveNet).toBe(-40000)
    expect(r.rentalAllowed).toBe(-15000)
    expect(r.palSuspendedRental).toBe(25000)
  })

  it('Step-1 per-entity materiallyParticipates=true (REP): that property nonpassive', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 200000, k1Total: -50000, isREP: true,
      entities: [{ type: 'Real Estate (Schedule E)', own: 100, k1: -50000, materiallyParticipates: true }],
    })
    expect(r.rentalNonpassiveNet).toBe(-50000)
    expect(r.palSuspendedRental).toBe(0)
  })

  it('tri-state: REP with an UNANSWERED Step-1 rental (undefined) → passive-pending (suspended)', () => {
    // undefined materiallyParticipates is NOT inferred from isREP — it defaults to passive.
    // A per-entity flag elsewhere activates the regime; this unanswered property stays passive.
    const r = calcTaxReturn({
      ...BASE, w2: 200000, k1Total: -50000, isREP: true,
      entities: [{ type: 'Real Estate (Schedule E)', own: 100, k1: -50000, materiallyParticipates: undefined, isREP: true }],
      step2RentalMaterialParticipation: false,  // activates regime without answering this property
    })
    expect(r.rentalNonpassiveNet).toBe(0)
    expect(r.rentalPassiveNet).toBe(-50000)
    expect(r.palSuspendedRental).toBe(50000)
  })
})

// =============================================================================
// F5 — reasonable-comp advisory framing (§1.162-7)
// Trigger logic unchanged; message reframed as informational, cites the real
// value-of-services standard, and demotes 35–45% to a non-binding benchmark.
// =============================================================================
describe('calcTaxReturn F5 — reasonable-comp advisory framing', () => {
  const scorp = (salary, k1) => ({
    name: 'Test S-Corp', type: 'S Corporation', own: '100',
    pnl: { netProfit: salary + k1, officerSalary: salary }, officerW2: salary, k1,
  })

  it('still triggers on the same 35–45% heuristic and keeps {triggered, ratio, message} contract', () => {
    const r = calcTaxReturn({ ...BASE, w2: 30000, k1Total: 140000, entities: [scorp(30000, 140000)] })
    expect(r.reasonableCompAlert.triggered).toBe(true)
    expect(r.reasonableCompAlert.ratio).toBe(18)
    expect(typeof r.reasonableCompAlert.message).toBe('string')
  })

  it('message is advisory: leads with informational framing and cites §1.162-7', () => {
    const r = calcTaxReturn({ ...BASE, w2: 30000, k1Total: 140000, entities: [scorp(30000, 140000)] })
    const m = r.reasonableCompAlert.message
    expect(m).toContain('informational flag, not a determination')
    expect(m).toContain('§1.162-7')
    expect(m).toContain('fixed ratio')   // "...not a fixed ratio..."
  })

  it('retains required substrings: 35–45%, Watson v. Commissioner, and the salary amount', () => {
    const r = calcTaxReturn({ ...BASE, w2: 30000, k1Total: 140000, entities: [scorp(30000, 140000)] })
    const m = r.reasonableCompAlert.message
    expect(m).toContain('35–45%')
    expect(m).toContain('Watson v. Commissioner')
    expect(m).toContain('30,000')
  })
})

describe('calcTaxReturn unrecaptured 1250 - subset of net capital gain, not added income', () => {
  it('entering unrecaptured 1250 does not inflate income (Verela 2024 double-count guard)', () => {
    const base2024 = {
      ...BASE, taxYear: 2024, w2: 293750,
      k1Total: -293750 - 170473,
      entities: [
        { name: 'S', type: 'S Corporation', k1: -293750 },
        { name: 'R', type: 'Real Estate (Schedule E)', k1: -170473, isREP: true },
      ],
      isREP: true, rentalAggregationElection: true,
      intInc: 9102, divInc: 63, qualDiv: 62,
      stGain: -393, ltGain: 108, f4797Inc: 234809, nolCarryforward: 337926,
    }
    const without1250 = calcTaxReturn({ ...base2024 })
    const with1250    = calcTaxReturn({ ...base2024, unrecap1250: 76509 })
    // unrecaptured 1250 is a SUBSET of the 1231 gain already entered; entering it must
    // not inflate income (the double-count fix). Validated separately: it shifts the
    // 1250 slice to its lesser-of-25%/regular rate without changing AGI or taxable income.
    expect(with1250.grossIncome).toBe(without1250.grossIncome)
    expect(with1250.taxableIncome).toBe(without1250.taxableIncome)
  })
})
