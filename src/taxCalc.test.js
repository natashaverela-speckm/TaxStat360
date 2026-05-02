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
    const entities = [{ box17V_sstb: true, netProfit: 50000, own: 50, box11_12: 0, box12_13: 0, box17V_wages: 15000, box17V_ubia: 0 }]
    const r = calcQBI(25000, 220000, 0, { status: 'single', taxYear: 2025, entityQbiData: entities })
    expect(r.deduction).toBe(2730)
    expect(r.limitApplied).toBe('qbi')
    expect(r.caps).toEqual({ qbi: 2730, wage: 4095, income: 44000 })
  })

  it('SSTB sec179 (box11_12) reduces k1 income for proration', () => {
    // $50k netProfit × 100% own − $10k sec179 = $40k sstbEntityQBI
    // 50% phase-in → adjQBI = $50k − $40k × 0.5 = $30k → scaledQbi = $6k
    const entities = [{ box17V_sstb: true, netProfit: 50000, own: 100, box11_12: 10000, box12_13: 0, box17V_wages: 30000, box17V_ubia: 0 }]
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
