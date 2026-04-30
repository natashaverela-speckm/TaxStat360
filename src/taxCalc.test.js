import { describe, it, expect } from 'vitest'
import { calcQBI } from './taxCalc.js'

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
