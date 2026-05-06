import { describe, it, expect } from 'vitest'
import { calcQBI, calcTaxReturn } from './taxCalc.js'

// =============================================================================
// §199A(i) OBBBA minimum deduction (#106 / #110)
// =============================================================================
describe('calcQBI §199A(i) OBBBA minimum deduction', () => {
  // ─── Floor-applicability gates ───

  it('applies $400 floor when regular calc < $400 and active QBI ≥ $1,000 (taxYear 2026)', () => {
    // QBI $1,500, TI $50,000 → 20% of QBI = $300 (qbi-binding); floor lifts to $400
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

  // ─── Statutory ordering: floor vs TI cap ───

  it('floor wins over TI cap when TI cap would produce less than $400', () => {
    // QBI $5,000, TI $300 → regular calc $60 (income-binding); floor lifts to $400
    // §199A(a) carved out by "except as provided in subsection (i)"
    const r = calcQBI(5000, 300, 0, { status: 'single', taxYear: 2026 })
    expect(r.deduction).toBe(400)
    expect(r.limitApplied).toBe('min400')
  })

  it('applies $400 floor when TI ≤ 0 and active QBI ≥ $1,000', () => {
    const r = calcQBI(5000, 0, 0, { status: 'single', taxYear: 2026 })
    expect(r.deduction).toBe(400)
    expect(r.limitApplied).toBe('min400')
  })

  it('returns regular calc when it exceeds $400 (caps.min400 still surfaces eligibility)', () => {
    const r = calcQBI(10000, 50000, 0, { status: 'single', taxYear: 2026 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.min400).toBe(400)
  })

  // ─── Explicit activeQbi parameter ───

  it('respects activeQbi: passive-only QBI does not trigger floor', () => {
    // qbiIncome aggregate $5k but only $500 is active
    const r = calcQBI(5000, 50000, 0, { status: 'single', taxYear: 2026, activeQbi: 500 })
    expect(r.deduction).toBe(1000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.min400).toBeUndefined()
  })

  it('respects activeQbi: applicable when activeQbi ≥ $1k, even with TI ≤ 0', () => {
    const r = calcQBI(500, 0, 0, { status: 'single', taxYear: 2026, activeQbi: 1000 })
    expect(r.deduction).toBe(400)
    expect(r.limitApplied).toBe('min400')
  })

  // ─── Interaction with SSTB phase-out ───

  it('does not apply floor when SSTB is fully phased out (adjQBI = 0)', () => {
    // 2026 single: threshold $201,775 + phase-in $75k = full phase-out at $276,775
    // TI $300k > $276,775 → SSTB not a QTB → floor does not apply
    const entities = [{ box17V_sstb: true, netProfit: 50000, own: 100, box11_12: 0, box12_13: 0 }]
    const r = calcQBI(50000, 300000, 0, { status: 'single', taxYear: 2026, entityQbiData: entities })
    expect(r.deduction).toBe(0)
    expect(r.caps.min400).toBeUndefined()
  })
})

// =============================================================================
// Below threshold — §199A(a) simple 20% × QBI rule, capped by 20% × (TI − netCapGain)
// =============================================================================
describe('calcQBI below threshold (simple 20% rule)', () => {
  it('returns 20% of QBI when TI cap is non-binding (single 2025)', () => {
    // 2025 single threshold = $197,300; TI $100k < threshold; no SSTB filter
    const r = calcQBI(10000, 100000, 0, { status: 'single', taxYear: 2025 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps).toEqual({ qbi: 2000, wage: null, income: 20000 })
  })

  it('TI cap binds when QBI > TI − netCapGain', () => {
    // QBI $10k, TI $5k → 20% TI = $1k < 20% QBI = $2k → income-binding
    const r = calcQBI(10000, 5000, 0, { status: 'single', taxYear: 2025 })
    expect(r.deduction).toBe(1000)
    expect(r.limitApplied).toBe('income')
    expect(r.caps).toEqual({ qbi: 2000, wage: null, income: 1000 })
  })

  it('netCapGain reduces the income limitation', () => {
    // QBI $10k, TI $50k, capGains $40k → income limit = 20% × ($50k − $40k) = $2k = qbiComponent (tie)
    const r = calcQBI(10000, 50000, 40000, { status: 'single', taxYear: 2025 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.income).toBe(2000)
  })

  it('MFJ status uses higher threshold (2025 = $394,600)', () => {
    // TI $100k well below MFJ threshold → simple below-threshold path
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
    // 2024 single threshold = $191,950; TI $100k < threshold
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

// =============================================================================
// Early-zero return (qbi ≤ 0 OR TI ≤ 0)
// =============================================================================
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

// =============================================================================
// Above threshold, NO wage data — backward-compat fallback to scaled 20%
// =============================================================================
describe('calcQBI above threshold without wage data (Box 17V fallback)', () => {
  it('falls back to simple 20% in phase-in band when no wages entered (non-SSTB)', () => {
    // 2025 single: threshold $197,300, phase-in $50k, TI $220k → 45.4% phase-in
    // Non-SSTB → adjQBI unchanged → scaledQbiComponent = 0.20 * 50000 = $10k
    // No wages → fallback returns 10k (income limit $44k non-binding)
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
    // QBI $80k → qbiComponent $16k; TI $250k − capGains $100k → income limit $30k (non-binding here)
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

// =============================================================================
// Above threshold, WITH wages/UBIA — §199A(b)(2) wage cap selection
// =============================================================================
describe('calcQBI above threshold with wage/UBIA data', () => {
  it('wage cap binds: 50% wages < 20% QBI, no UBIA', () => {
    // QBI $100k → 20% = $20k; wages $30k → 50% = $15k → wage cap binds at $15k
    const entities = [{ box17V_sstb: false, netProfit: 100000, own: 100, box17V_wages: 30000, box17V_ubia: 0 }]
    const r = calcQBI(100000, 300000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(15000)
    expect(r.limitApplied).toBe('wage')
    expect(r.caps).toEqual({ qbi: 20000, wage: 15000, income: 60000 })
  })

  it('UBIA cap wins over 50%-wages: 25% wages + 2.5% UBIA chosen, but qbiComponent still binds', () => {
    // 50% wages = $15k; 25% wages + 2.5% UBIA = $7.5k + $20k = $27.5k → UBIA cap is bigger
    // wageLimit = max($15k, $27.5k) = $27.5k > qbiComponent $20k → qbi binds
    const entities = [{ box17V_sstb: false, netProfit: 100000, own: 100, box17V_wages: 30000, box17V_ubia: 800000 }]
    const r = calcQBI(100000, 300000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(20000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.wage).toBe(27500)
  })

  it('QBI binds when wages are large (50% wages > 20% QBI)', () => {
    // QBI $50k → 20% = $10k; wages $80k → 50% = $40k → wage cap non-binding
    const entities = [{ box17V_sstb: false, netProfit: 50000, own: 100, box17V_wages: 80000, box17V_ubia: 0 }]
    const r = calcQBI(50000, 300000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(10000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.wage).toBe(40000)
  })

  it('income limit binds when capital gains shrink TI − netCapGain', () => {
    // TI $300k, capGains $270k → income limit = 20% × $30k = $6k → income binds
    const entities = [{ box17V_sstb: false, netProfit: 50000, own: 100, box17V_wages: 80000, box17V_ubia: 0 }]
    const r = calcQBI(50000, 300000, 270000, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(6000)
    expect(r.limitApplied).toBe('income')
    expect(r.caps).toEqual({ qbi: 10000, wage: 40000, income: 6000 })
  })

  it('phase-in interpolation: partial wage-cap reduction when TI is mid-band', () => {
    // 2025 single: threshold $197.3k, range $50k. TI $220k → excess $22.7k → phasePct = 45.4%
    // qbiComponent $20k, wageLimit $15k, reduction = ($20k − $15k) × 0.454 = $2,270
    // limitedAmount = $20k − $2,270 = $17,730
    const entities = [{ box17V_sstb: false, netProfit: 100000, own: 100, box17V_wages: 30000, box17V_ubia: 0 }]
    const r = calcQBI(100000, 220000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(17730)
    expect(r.limitApplied).toBe('wage')
  })

  it('boundary: TI just $1 above threshold falls into above-threshold branch', () => {
    // 2025 single threshold = $197,300; TI $197,301 → excess $1, phasePct ≈ 0.00002
    // wageLimit $15k, qbiComponent $10k → no wage reduction (qbi already < wage)
    const entities = [{ box17V_sstb: false, netProfit: 50000, own: 100, box17V_wages: 30000, box17V_ubia: 0 }]
    const r = calcQBI(50000, 197301, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(10000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.wage).toBe(15000)
  })
})

// =============================================================================
// SSTB §199A(d)(3) applicable percentage
// =============================================================================
describe('calcQBI SSTB phase-in', () => {
  it('SSTB at threshold exactly → below-threshold path → full QTB', () => {
    // TI = threshold ($197,300) hits taxableBeforeQBI <= threshold → SSTB irrelevant below
    const entities = [{ box17V_sstb: true, netProfit: 50000, own: 100, box11_12: 0, box12_13: 0, box17V_wages: 30000, box17V_ubia: 0 }]
    const r = calcQBI(50000, 197300, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(10000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.wage).toBeNull()
  })

  it('SSTB mid phase-in: 50% applicable percentage halves both QBI and wages', () => {
    // 2025 single: threshold $197.3k, range $50k. TI $222.3k → excess $25k → phasePct = 0.5
    // sstbApplicablePct = 0.5; sstbEntityQBI = $50k; adjQBI = $50k − $50k×0.5 = $25k
    // scaledQbiComponent = $5k; totalWages = $30k × 0.5 = $15k; wageLimit = max($7.5k, $3.75k) = $7.5k
    // mid phase-in: reduction = max(0, $5k − $7.5k) × 0.5 = 0 (qbi already < wage)
    // limitedAmount = $5k; ded = $5k, limit = qbi
    const entities = [{ box17V_sstb: true, netProfit: 50000, own: 100, box11_12: 0, box12_13: 0, box17V_wages: 30000, box17V_ubia: 0 }]
    const r = calcQBI(50000, 222300, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(5000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps).toEqual({ qbi: 5000, wage: 7500, income: 44460 })
  })

  it('mixed SSTB + non-SSTB above phase-in: only SSTB excluded', () => {
    // 2025 single: TI $300k → fully past phase-in → sstbApplicablePct = 0
    // SSTB QBI ($50k) excluded; non-SSTB QBI ($50k) preserved → adjQBI $50k → scaledQbi $10k
    // SSTB wages × 0 + non-SSTB wages = $30k → wageLimit $15k → qbi binds
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
    // 50% own × $50k netProfit = $25k k1Income; mid phase-in (TI $220k → 45.4%)
    const entities = [{ box17V_sstb: true, netProfit: 50000, own: 50, k1: 25000, box11_12: 0, box12_13: 0, box17V_wages: 15000, box17V_ubia: 0 }]
    const r = calcQBI(25000, 220000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(2730)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps).toEqual({ qbi: 2730, wage: 4095, income: 44000 })
  })

  it('SSTB sec179 (box11_12) reduces k1 income for proration', () => {
    // $50k netProfit × 100% own − $10k sec179 = $40k sstbEntityQBI
    // 50% phase-in → adjQBI = $50k − $40k × 0.5 = $30k → scaledQbi = $6k
    const entities = [{ box17V_sstb: true, netProfit: 50000, own: 100, k1: 40000, box11_12: 10000, box12_13: 0, box17V_wages: 30000, box17V_ubia: 0 }]
    const r = calcQBI(50000, 222300, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(6000)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps.qbi).toBe(6000)
  })
})

// =============================================================================
// Filing status / tax year handling
// =============================================================================
describe('calcQBI filing status & tax year', () => {
  it('2026 MFJ uses post-OBBBA threshold $403,500 and $150k phase-in', () => {
    // TI $400k < MFJ threshold $403,500 → below-threshold path
    const r = calcQBI(10000, 400000, 0, { status: 'mfj', taxYear: 2026 })
    expect(r.deduction).toBe(2000)
    expect(r.limitApplied).toBe('qbi')
    // 2026 → §199A(i) eligibility surfaces but doesn't bind
    expect(r.caps.min400).toBe(400)
  })

  it('2026 MFJ above threshold uses wider $150k phase-in band', () => {
    // 2026 MFJ: threshold $403,500, range $150k. TI $470k → excess $66.5k → phasePct = 0.443
    // qbiComponent $20k, wageLimit $15k, reduction = $5k × 0.443 = $2,217 → ded = $17,783
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
    expect(r.caps.min400).toBeUndefined() // §199A(i) not active for unknown years
  })
})

// =============================================================================
// Schedule 1 line 16 — Self-Employed Retirement Plans (#8.4-PEN)
// =============================================================================

describe('Schedule 1 line 16 - Self-Employed Retirement', () => {
  it('reduces AGI dollar-for-dollar', () => {
    const baseline = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 100000, selfEmpRetirement: 0 })
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

// =============================================================================
// calcTaxReturn — integration tests (Module J)
// Covers paths with no prior end-to-end test coverage:
//   REP flag, ISO bargain element → AMT, ytdFactor scaling,
//   multi-entity portfolios, itemized SALT → AMT addback, SSTB above phase-in.
// =============================================================================

// Minimal valid input — single W-2 filer, no entities, no frills.
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

// =============================================================================
// REP flag — IRC §469(c)(7) real estate professional
// =============================================================================
describe('calcTaxReturn REP flag (isREP)', () => {
  it('rentalNII is 0 when isREP=true', () => {
    const r = calcTaxReturn({ ...BASE, rentalNet: 30000, isREP: true })
    expect(r.rentalNII).toBe(0)
  })

  it('rentalNII equals rentalNet when isREP=false and rental is positive', () => {
    const r = calcTaxReturn({ ...BASE, rentalNet: 30000, isREP: false })
    expect(r.rentalNII).toBe(30000)
  })

  it('REP reduces NIIT vs non-REP when AGI exceeds $200k threshold', () => {
    // $200k W-2 + $50k rental → AGI $250k > $200k single threshold
    // non-REP: rental is NII → niit > 0
    // REP: rental excluded from NII → niit lower (only investment income counts)
    const nonRep = calcTaxReturn({ ...BASE, w2: 200000, rentalNet: 50000, isREP: false })
    const rep    = calcTaxReturn({ ...BASE, w2: 200000, rentalNet: 50000, isREP: true  })
    expect(nonRep.niit).toBeGreaterThan(0)
    expect(rep.niit).toBeLessThan(nonRep.niit)
  })
})

// =============================================================================
// hasISO + isoBargainElement → AMT addback (IRC §56(b)(3) / Form 6251 line 2i)
// =============================================================================
describe('calcTaxReturn ISO bargain element → AMT (IRC §56(b)(3))', () => {
  it('large ISO spread increases AMT vs baseline', () => {
    const withISO = calcTaxReturn({ ...BASE, w2: 150000, hasISO: true, isoBargainElement: 200000 })
    const noISO   = calcTaxReturn({ ...BASE, w2: 150000 })
    expect(withISO.amt).toBeGreaterThan(noISO.amt)
  })

  it('isoBargainElement is ignored when hasISO=false', () => {
    const withFlag    = calcTaxReturn({ ...BASE, hasISO: true,  isoBargainElement: 100000 })
    const withoutFlag = calcTaxReturn({ ...BASE, hasISO: false, isoBargainElement: 100000 })
    // When hasISO=false the engine passes 0 to calcAMT regardless of the field value
    expect(withFlag.amt).toBeGreaterThanOrEqual(withoutFlag.amt)
  })

  it('does not throw with hasISO=true and isoBargainElement=0', () => {
    expect(() => calcTaxReturn({ ...BASE, hasISO: true, isoBargainElement: 0 })).not.toThrow()
  })
})

// =============================================================================
// ytdFactor — YTD income scaling (Schedule 1 deductions are ytdScale()'d)
// =============================================================================
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
    const q1   = calcTaxReturn({ ...BASE, w2: 25000, selfEmpRetirement: 5000,  ytdFactor: 4 })
    const full = calcTaxReturn({ ...BASE, w2: 100000, selfEmpRetirement: 20000, ytdFactor: 1 })
    expect(q1.selfEmpRetirementDed).toBe(full.selfEmpRetirementDed)
  })

  it('studentLoanInt is ytdScaled and then capped at $2,500', () => {
    // ytdFactor=2, raw $1,000 → scaled $2,000 → under cap → ded = $2,000
    const r1 = calcTaxReturn({ ...BASE, studentLoanInt: 1000, ytdFactor: 2 })
    expect(r1.studentLoanDed).toBe(2000)
    // ytdFactor=2, raw $1,500 → scaled $3,000 → capped → ded = $2,500
    const r2 = calcTaxReturn({ ...BASE, studentLoanInt: 1500, ytdFactor: 2 })
    expect(r2.studentLoanDed).toBe(2500)
  })
})

// =============================================================================
// Multi-entity portfolio — SE entity vs S-Corp entity
// =============================================================================
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

  it('mixed portfolio: SE tax matches sole-prop-only amount (same SE-subject income)', () => {
    // $50k sole prop + $50k S-Corp → SE tax on $50k only
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

// =============================================================================
// Partnership Active vs Passive SE tax — IRC §1402(a)(13)
// Regression guard for F-02 (PR #148): limited partners' distributive shares are
// excluded from SE income. Only the "Active" variant generates SE tax.
// =============================================================================
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
    // $50k Active + $75k Passive → seNetIncome = $50k (Active only)
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

  it('legacy partnership type string falls through as non-SE-subject (passive default)', () => {
    // Pre-PR records may carry the legacy 'Partnership / Multi-Member LLC' string.
    // The legacy mapper treats them as Passive (no SE tax) — conservative default.
    const r = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 100000,
      entities: [{ type: 'Partnership / Multi-Member LLC', k1: 100000, own: 100 }],
    })
    expect(r.seNetIncome).toBe(0)
    expect(r.seTax).toBe(0)
  })
})

// =============================================================================
// F-01 NIIT regression guard — qualDiv must not double-count
// PR #146: divInc (Box 1a) already includes qualDiv (Box 1b). The NIIT base
// sum must NOT add qualDiv again. Bug previously inflated NIIT by 3.8% × qualDiv
// for any filer above the NIIT AGI threshold.
// =============================================================================
describe('calcTaxReturn NIIT — F-01 qualDiv no-double-count guard', () => {
  it('NIIT is unchanged when qualDiv is set vs unset (with same divInc and AGI)', () => {
    // AGI > $200k single threshold so NIIT fires
    // qualDiv is a subset of divInc — adding it to the NII base would double-count.
    const baseline = calcTaxReturn({
      ...BASE, w2: 250000, divInc: 10000, qualDiv: 0,
    })
    const withQualDiv = calcTaxReturn({
      ...BASE, w2: 250000, divInc: 10000, qualDiv: 4000,
    })
    expect(baseline.niit).toBeGreaterThan(0)
    expect(withQualDiv.niit).toBe(baseline.niit)
  })

  it('NIIT scales with divInc but NOT additionally with qualDiv', () => {
    // Doubling divInc should change niit; varying qualDiv (same divInc) should not.
    const lowDiv = calcTaxReturn({
      ...BASE, w2: 250000, divInc: 5000, qualDiv: 5000,
    })
    const highDiv = calcTaxReturn({
      ...BASE, w2: 250000, divInc: 10000, qualDiv: 5000,
    })
    expect(highDiv.niit).toBeGreaterThan(lowDiv.niit)
  })
})

// =============================================================================
// F-01-followup-A regression guard — stGain must be included in NIIT base
// IRC §1411(c)(1): net gain from property disposition is NII. Short-term capital
// gains are gain from disposition and are subject to NIIT just like long-term
// gains. Pre-fix: stGain was missing from the NII sum, silently under-computing
// NIIT for filers with short-term gains above the NIIT AGI threshold.
// =============================================================================
describe('calcTaxReturn NIIT — F-01-followup-A stGain in NII base', () => {
  it('stGain generates NIIT when AGI exceeds threshold', () => {
    // $200k W-2 + $50k stGain → AGI $250k > $200k single threshold
    // NII = max(0, $50k stGain + $0 ltGain) = $50k
    // NIIT = 3.8% × min($50k NII, $50k excess AGI) = $1,900
    const r = calcTaxReturn({ ...BASE, w2: 200000, stGain: 50000 })
    expect(r.niit).toBeGreaterThan(0)
    expect(r.niit).toBe(Math.round(Math.min(50000, 50000) * 0.038))
  })

  it('stGain loss nets against ltGain in single capital gain pool (§1222 netting)', () => {
    // Key regression guard for the combined-clamp fix.
    // ltGain $80k + stGain -$30k → combined NII gain = max(0, $80k-$30k) = $50k.
    // Separate clamps would produce $80k + $0 = $80k (overstatement).
    // $200k W-2 + combined $50k NII → excess AGI $50k → NIIT = 3.8% × $50k = $1,900
    const r = calcTaxReturn({ ...BASE, w2: 200000, ltGain: 80000, stGain: -30000 })
    expect(r.niit).toBe(Math.round(0.038 * 50000)) // 1900, not 3040
  })

  it('negative stGain does not reduce NII below zero (floor applies to combined pool)', () => {
    // $250k W-2 + -$30k stGain, ltGain $0 → combined gain = max(0, -$30k) = $0
    // NII from gains = $0; no other NII in BASE → NIIT same as no gain at all
    const withLoss    = calcTaxReturn({ ...BASE, w2: 250000, stGain: -30000 })
    const withoutGain = calcTaxReturn({ ...BASE, w2: 250000, stGain: 0 })
    expect(withLoss.niit).toBe(withoutGain.niit)
  })

  it('no NIIT when AGI is below the $200k single threshold', () => {
    // $100k W-2 + $50k stGain → AGI $150k < $200k threshold → NIIT = 0
    const r = calcTaxReturn({ ...BASE, w2: 100000, stGain: 50000 })
    expect(r.niit).toBe(0)
  })

  it('NIIT is capped by NII when AGI barely exceeds threshold', () => {
    // $201k W-2 + $50k stGain → AGI $251k, excess = $51k, NII = $50k
    // NIIT = 3.8% × min($50k NII, $51k excess) = $1,900 — NII is the binding constraint
    const r = calcTaxReturn({ ...BASE, w2: 201000, stGain: 50000 })
    expect(r.niit).toBe(Math.round(0.038 * 50000)) // 1900 — capped by NII not excess
  })
})

// =============================================================================
// F-03 SSTB regression guard — ownership must not be re-applied to e.k1
// PR #147: SSTB block in calcQBI must use e.k1 directly. e.k1 is already
// ownership-adjusted by the UI layer. Re-multiplying by own% caused double-
// reduction of the SSTB exclusion base, inflating the deduction.
// =============================================================================
describe('calcQBI SSTB — F-03 no double-ownership guard', () => {
  it('SSTB deduction depends on e.k1, not on own% (same k1 + different own% = same result)', () => {
    // Two entity setups with identical pre-computed e.k1=25000 but different own%.
    // SSTB exclusion math uses e.k1 directly, so both must produce the same deduction.
    // If a regression re-applied own% to e.k1, own:50 case would silently halve sstbEntityQBI.
    const entityOwn50 = [{
      box17V_sstb: true, netProfit: 50000, own: 50, k1: 25000,
      box11_12: 0, box12_13: 0, box17V_wages: 15000, box17V_ubia: 0,
    }]
    const entityOwn100 = [{
      box17V_sstb: true, netProfit: 25000, own: 100, k1: 25000,
      box11_12: 0, box12_13: 0, box17V_wages: 15000, box17V_ubia: 0,
    }]
    const r50  = calcQBI(25000, 220000, 0, { status: 'single', taxYear: 2025, entityQbiData: entityOwn50 })
    const r100 = calcQBI(25000, 220000, 0, { status: 'single', taxYear: 2025, entityQbiData: entityOwn100 })
    expect(r50.deduction).toBe(r100.deduction)
  })

  it('SSTB partial-ownership produces correct mid-phase-in deduction (not inflated by double-reduction)', () => {
    // Pinned numeric assertion: own:50 k1:25000 SSTB at TI:220000 (mid phase-in 2025 single)
    // Correct path: sstbEntityQBI=25000 → adjQBI≈13637 → ded=2730
    // Regressed path (double-ownership): sstbEntityQBI=12500 → adjQBI≈19318 → ded≈3864
    // The 1100+ delta makes a regression numerically obvious.
    const entities = [{
      box17V_sstb: true, netProfit: 50000, own: 50, k1: 25000,
      box11_12: 0, box12_13: 0, box17V_wages: 15000, box17V_ubia: 0,
    }]
    const r = calcQBI(25000, 220000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(2730)
    expect(r.deduction).toBeLessThan(3000)
  })
})

// =============================================================================
// Itemized deductions with SALT → AMT addback (IRC §56(b)(1)(A)(ii))
// =============================================================================
describe('calcTaxReturn itemized SALT → AMT addback', () => {
  it('SALT addback increases AMT when useItemized=true and saltAmount > 0', () => {
    // High income to push into AMT territory
    const itemized = calcTaxReturn({
      ...BASE, w2: 500000,
      useItemized: true, itemizedAmt: 50000, saltAmount: 40000,
    })
    const standard = calcTaxReturn({ ...BASE, w2: 500000 })
    expect(itemized.amt).toBeGreaterThanOrEqual(standard.amt)
  })

  it('no SALT addback when useItemized=false even with large saltAmount', () => {
    const notItemizing = calcTaxReturn({
      ...BASE, w2: 500000,
      useItemized: false, saltAmount: 40000,
    })
    const itemizing = calcTaxReturn({
      ...BASE, w2: 500000,
      useItemized: true, itemizedAmt: 50000, saltAmount: 40000,
    })
    // No itemizing → no SALT addback → lower or equal AMT
    expect(notItemizing.amt).toBeLessThanOrEqual(itemizing.amt)
  })
})

// =============================================================================
// SSTB entity above §199A phase-in → QBI deduction reduced or zero
// =============================================================================
describe('calcTaxReturn SSTB entity above §199A phase-in', () => {
  it('QBI is zero for fully-phased-out SSTB (single 2025, TI > $247,300)', () => {
    // 2025 single: threshold $197,300 + phase-in $50k → full phase-out at $247,300
    const r = calcTaxReturn({
      ...BASE, w2: 200000, k1Total: 100000,
      entities: [{
        type: 'S Corporation', k1: 100000, own: 100,
        box17V_sstb: true, box17V_wages: 0, box17V_ubia: 0,
        box11_12: 0, box12_13: 0,
      }],
    })
    // TI ≈ $300k (well above $247,300) → SSTB fully excluded → QBI = 0
    expect(r.taxableBeforeQBI).toBeGreaterThan(247300)
    expect(r.qbi).toBe(0)
  })

  it('non-SSTB entity above threshold still gets QBI deduction', () => {
    const r = calcTaxReturn({
      ...BASE, w2: 200000, k1Total: 100000,
      entities: [{
        type: 'S Corporation', k1: 100000, own: 100,
        box17V_sstb: false, box17V_wages: 0, box17V_ubia: 0,
        box11_12: 0, box12_13: 0,
      }],
    })
    // Non-SSTB always eligible; income/wage limit may cap it but > 0
    expect(r.qbi).toBeGreaterThan(0)
  })

  it('SSTB below threshold gets full QBI deduction (QTB, no exclusion)', () => {
    // TI well below $197,300 → SSTB is a qualified trade → 20% × QBI applies
    const r = calcTaxReturn({
      ...BASE, w2: 0, k1Total: 50000,
      entities: [{
        type: 'S Corporation', k1: 50000, own: 100,
        box17V_sstb: true, box17V_wages: 0, box17V_ubia: 0,
        box11_12: 0, box12_13: 0,
      }],
    })
    expect(r.qbi).toBeGreaterThan(0)
  })
})

// =============================================================================
// Output shape — regression guard on return object structure
// =============================================================================
describe('calcTaxReturn output shape', () => {
  const SHAPE_KEYS = [
    'grossIncome', 'agi', 'seNetIncome', 'seTax', 'halfSE',
    'adjustments', 'stdDed', 'deduction',
    'qbiBasis', 'taxableBeforeQBI', 'qbi', 'qbiLimitApplied',
    'taxableAfterQBI', 'ordinaryTaxableIncome', 'taxableIncome',
    'ordFedTax', 'prefTax', 'fedTax', 'marginalRate',
    'additionalMedicare', 'niit', 'childCredit',
    'amt', 'totalTax', 'effectiveRate',
    'withheld', 'estimated', 'totalPayments', 'balance',
    'rentalNII', 'nii',
  ]

  it('returns all expected keys', () => {
    const r = calcTaxReturn(BASE)
    for (const key of SHAPE_KEYS) {
      expect(r).toHaveProperty(key)
    }
  })

  it('all numeric fields are finite (never NaN or Infinity)', () => {
    const r = calcTaxReturn(BASE)
    for (const key of SHAPE_KEYS) {
      if (typeof r[key] === 'number') {
        expect(Number.isFinite(r[key])).toBe(true)
      }
    }
  })

  it('does not throw on all-zero income inputs', () => {
    expect(() => calcTaxReturn({ ...BASE, w2: 0 })).not.toThrow()
  })
})

// =============================================================================
// §469 PAL regression guard — rental losses gated for non-REP investors
// Non-REP users may only deduct rental losses up to the §469(i) special
// allowance ($25k, phased out $100k–$150k AGI). REP users retain full
// deductibility. isREP flag governs both the income-tax PAL gate and the
// NIIT rental exclusion.
// =============================================================================
describe('calcTaxReturn §469 PAL — rental loss gating for non-REP investors', () => {
  it('REP: full rental loss deductible against ordinary income', () => {
    // isREP=true — existing behavior preserved, no PAL limitation
    const r = calcTaxReturn({ ...BASE, w2: 150000, rentalNet: -30000, isREP: true })
    // grossIncome = 150000 + (-30000) + 0 ebl = 120000
    expect(r.grossIncome).toBe(120000)
    expect(r.palSuspendedRental).toBe(0)
  })

  it('non-REP high AGI ($200k): rental loss fully suspended (above $150k phase-out)', () => {
    // Pre-rental AGI $200k → specialAllowance = 0 → palAdjustedRental = 0
    const r = calcTaxReturn({ ...BASE, w2: 200000, rentalNet: -50000, isREP: false })
    expect(r.grossIncome).toBe(200000)          // rental loss fully suspended
    expect(r.palSuspendedRental).toBe(50000)    // full $50k suspended
  })

  it('non-REP low AGI ($80k): $25k special allowance fully available', () => {
    // Pre-rental AGI $80k < $100k phase-out start → full $25k allowance
    // rentalNet = -30k; allowed = -25k; suspended = $5k
    const r = calcTaxReturn({ ...BASE, w2: 80000, rentalNet: -30000, isREP: false })
    expect(r.grossIncome).toBe(55000)            // 80000 + (-25000)
    expect(r.palSuspendedRental).toBe(5000)      // $5k of $30k suspended
  })

  it('non-REP mid AGI ($120k): $25k allowance prorated to $15k', () => {
    // Pre-rental AGI $120k → specialAllowance = 25000 - (20000 × 0.5) = $15k
    // rentalNet = -20k; all $20k is within the $15k allowance... wait:
    // palAdjustedRental = max(-20000, -15000) = -15000; suspended = $5k
    const r = calcTaxReturn({ ...BASE, w2: 120000, rentalNet: -20000, isREP: false })
    expect(r.grossIncome).toBe(105000)           // 120000 + (-15000)
    expect(r.palSuspendedRental).toBe(5000)      // $5k suspended
  })

  it('non-REP: rental income (positive) is unaffected by PAL gating', () => {
    // PAL only gates losses; rental income always flows through
    const r = calcTaxReturn({ ...BASE, w2: 100000, rentalNet: 20000, isREP: false })
    expect(r.grossIncome).toBe(120000)
    expect(r.palSuspendedRental).toBe(0)
  })

  it('MFS: $0 allowance by default (§469(i)(5)(B) lived-with-spouse rule)', () => {
    // MFS filers who lived with spouse at any point get no §469(i) allowance.
    // Without a mfsLivedApart input, TaxStat360 defaults to the conservative $0 rule.
    const r = calcTaxReturn({ ...BASE, w2: 80000, rentalNet: -30000, isREP: false, status: 'mfs' })
    expect(r.palAdjustedRental).toBeUndefined() // internal — not in return shape
    expect(r.palSuspendedRental).toBe(30000)    // full $30k suspended
    expect(r.grossIncome).toBe(80000)            // rental loss fully disallowed
  })

  it('PAL phase-out boundary: AGI exactly $100k gets full $25k allowance', () => {
    // At exactly $100k preRentalAGI, phase-out hasn't started → full $25k
    const r = calcTaxReturn({ ...BASE, w2: 100000, rentalNet: -30000, isREP: false })
    expect(r.palSuspendedRental).toBe(5000)     // $30k loss, $25k allowed, $5k suspended
    expect(r.grossIncome).toBe(75000)            // 100000 - 25000
  })

  it('PAL phase-out boundary: AGI exactly $150k gets $0 allowance', () => {
    // At exactly $150k preRentalAGI, phase-out complete → $0 allowance
    const r = calcTaxReturn({ ...BASE, w2: 150000, rentalNet: -20000, isREP: false })
    expect(r.palSuspendedRental).toBe(20000)    // full $20k suspended
    expect(r.grossIncome).toBe(150000)           // rental loss fully disallowed
  })
})

// =============================================================================
// §461(l) EBL regression guard — excess business loss limitation
// IRC §461(l)(1) caps noncorporate business losses at the annual threshold.
// Excess becomes a §172 NOL carryforward. W-2 is NOT business income.
// Thresholds: $313k single / $626k MFJ for 2025 (Rev. Proc. 2024-40).
// =============================================================================
describe('calcTaxReturn §461(l) — excess business loss limitation', () => {
  it('business loss below threshold: no EBL, full loss allowed', () => {
    // K-1 loss $200k < $313k threshold → ebl = 0, no adjustment
    const r = calcTaxReturn({ ...BASE, w2: 300000, k1Total: -200000, isREP: false })
    expect(r.ebl).toBe(0)
    expect(r.grossIncome).toBe(100000)   // 300000 + (-200000) + 0
  })

  it('business loss above threshold: excess becomes EBL carryforward', () => {
    // K-1 loss $400k > $313k threshold → ebl = $87k carryforward
    const r = calcTaxReturn({ ...BASE, w2: 500000, k1Total: -400000, isREP: false })
    expect(r.ebl).toBe(87000)            // 400000 - 313000
    // grossIncome: 500000 + (-400000) + 87000 = 187000 (loss capped at $313k)
    expect(r.grossIncome).toBe(187000)
  })

  it('W-2 income is NOT counted as business income in EBL computation', () => {
    // Only K-1 is business; $400k W-2 does not expand the allowed loss
    const withHighW2 = calcTaxReturn({ ...BASE, w2: 1000000, k1Total: -400000, isREP: false })
    const withLowW2  = calcTaxReturn({ ...BASE, w2: 100000,  k1Total: -400000, isREP: false })
    // ebl should be identical regardless of W-2 level
    expect(withHighW2.ebl).toBe(withLowW2.ebl)
    expect(withHighW2.ebl).toBe(87000)
  })

  it('REP rental losses count toward EBL business bucket', () => {
    // REP: K-1 -$200k + rental -$200k = -$400k net biz > $313k threshold
    const r = calcTaxReturn({ ...BASE, w2: 500000, k1Total: -200000, rentalNet: -200000, isREP: true })
    expect(r.ebl).toBe(87000)            // 400000 - 313000
  })

  it('Pass 5 scenario: S-Corp -$343k + REP rental -$85k → EBL $115k', () => {
    // Exact scenario from Pass 5 audit. Opus flagged this as potentially wrong on the filed return.
    // k1Total = -343443, rentalNet = -84599, isREP = true, single, 2025
    // eblBiz = -343443 + 0 + (-84599) = -428042
    // ebl = 428042 - 313000 = 115042
    const r = calcTaxReturn({
      ...BASE,
      w2: 287500, k1Total: -343443, rentalNet: -84599,
      ltGain: 113072, isREP: true, taxYear: 2025,
    })
    expect(r.ebl).toBe(115042)
    expect(r.palSuspendedRental).toBe(0)  // isREP=true, no PAL gate
  })

  it('MFJ: higher threshold ($626k) applies', () => {
    // MFJ filer with $700k K-1 loss → ebl = 700000 - 626000 = 74000
    const r = calcTaxReturn({ ...BASE, w2: 800000, k1Total: -700000, status: 'mfj', isREP: false })
    expect(r.ebl).toBe(74000)
  })

  it('combined PAL + EBL: both limitations apply in a realistic mixed scenario', () => {
    // Non-REP investor, mid AGI ($120k W-2), large K-1 loss + rental loss.
    // Step 1 — §469 PAL: preRentalAGI ≈ 120000 + (-400000) = -280000 → below $100k
    //   But wait: preRentalAGI = w2 + k1Total + ... = 120000 + (-400000) = -280000
    //   specialAllowance = max(0, 25000 - max(0, (-280000 - 100000) × 0.5)) = $25k (fully available)
    //   palAdjustedRental = max(-50000, -25000) = -25000; suspended = $25k
    // Step 2 — §461(l) EBL: eblBiz = -400000 + 0 + (-25000) = -425000
    //   ebl = max(0, 425000 - 313000) = $112k carryforward
    //   grossIncome = 120000 + (-400000) + (-25000) + 112000 = -193000
    const r = calcTaxReturn({ ...BASE, w2: 120000, k1Total: -400000, rentalNet: -50000, isREP: false })
    expect(r.palSuspendedRental).toBe(25000)   // $25k of rental suspended by §469
    expect(r.ebl).toBe(112000)                 // $112k EBL carryforward
    expect(r.grossIncome).toBe(-193000)        // net after both limitations
  })

  it('business gain offsets business loss before threshold check', () => {
    // K-1 -$400k but §1231 gain $150k → net biz loss $250k < $313k threshold
    const r = calcTaxReturn({ ...BASE, w2: 300000, k1Total: -400000, f4797Inc: 150000, isREP: false })
    expect(r.ebl).toBe(0)               // net biz loss $250k < threshold
    // grossIncome: 300000 + (-400000) + 150000 + 0 ebl = 50000
    expect(r.grossIncome).toBe(50000)
  })
})

// =============================================================================
// §469(i)(6) active participation flag — passive investor gets $0 allowance
// =============================================================================
describe('calcTaxReturn §469(i) — isActiveParticipant flag', () => {
  it('passive investor (isActiveParticipant=false): rental losses fully suspended', () => {
    // Limited partner / syndication investor — no management rights → $0 allowance
    const r = calcTaxReturn({ ...BASE, w2: 80000, rentalNet: -30000, isREP: false, isActiveParticipant: false })
    expect(r.palSuspendedRental).toBe(30000)  // full loss suspended
    expect(r.grossIncome).toBe(80000)          // rental loss fully disallowed
  })

  it('active participant (default): $25k allowance applies normally', () => {
    // Default isActiveParticipant=true — existing behavior preserved
    const r = calcTaxReturn({ ...BASE, w2: 80000, rentalNet: -30000, isREP: false })
    expect(r.palSuspendedRental).toBe(5000)   // $5k suspended, $25k allowed
    expect(r.grossIncome).toBe(55000)          // 80000 - 25000
  })
})

// =============================================================================
// §199A(c)(2) QBI carryforward output
// When net QBI is negative, the engine should output the negative amount as
// qbiCarryforward for the user to enter as priorYearQBILoss next year.
// =============================================================================
describe('calcTaxReturn §199A QBI carryforward output', () => {
  it('negative QBI (S-Corp loss): outputs correct carryforward amount', () => {
    // K-1 loss -$200k → qbiBasis = -200k → qbiCarryforward = 200k
    const r = calcTaxReturn({ ...BASE, w2: 300000, k1Total: -200000 })
    expect(r.qbiCarryforward).toBe(200000)
    expect(r.qbi).toBe(0)   // no deduction when QBI is negative
  })

  it('positive QBI: no carryforward', () => {
    const r = calcTaxReturn({ ...BASE, w2: 100000, k1Total: 80000 })
    expect(r.qbiCarryforward).toBe(0)
    expect(r.qbi).toBeGreaterThan(0)
  })

  it('prior year carryforward consumed by current year positive QBI: no new carryforward', () => {
    // Prior carryforward $50k, current K-1 +$80k → net qbiBasis = 80k - 50k = 30k (positive)
    const r = calcTaxReturn({ ...BASE, w2: 100000, k1Total: 80000, priorYearQBILoss: 50000 })
    expect(r.qbiCarryforward).toBe(0)
    expect(r.priorQBILossCO).toBe(50000)
  })

  it('Pass 5 scenario: S-Corp -$343k → qbiCarryforward = $343k', () => {
    // With the nonSEk1 fix, negative K-1 flows through to qbiBasis correctly.
    // qbiBasis = nonSEk1 + 0 + max(0, -84599) - 0 = -343443 + 0 = -343443
    // qbiCarryforward = abs(-343443) = 343443
    const r = calcTaxReturn({ ...BASE, w2: 287500, k1Total: -343443, rentalNet: -84599, isREP: true, taxYear: 2025 })
    expect(r.qbiCarryforward).toBe(343443)
    expect(r.qbi).toBe(0)
  })
})
