// src/taxCalc-qbi-wage-limit.test.js
//
// GOLDEN RECORDS — §199A(b)(2)(B) W-2 wage / UBIA limitation.
//
// These are the two scenarios the pre-launch audit ran against the LIVE site, with
// expected outputs derived BY HAND from IRS primary sources — not from this engine.
// That direction matters: a test written by reading the code can only ever confirm
// that the code does what it does. Every figure below was computed independently and
// then compared to the app; where they disagreed, the app was wrong.
//
// SOURCES
//   Rev. Proc. 2025-32 §4.01  2026 ordinary brackets
//   Rev. Proc. 2025-32 §4.14  2026 standard deduction
//   Rev. Proc. 2025-32 §4.26  2026 §199A thresholds and phase-in ranges
//   SSA 2026 COLA fact sheet  Social Security wage base $184,500
//   IRC §199A(b)(2)(B)        wage / UBIA limitation
//   IRC §199A(i) (OBBBA)      $400 minimum deduction
//   IRC §3101(b)(2)           0.9% Additional Medicare Tax (statutory, not indexed)
//
// THE BUG THESE LOCK DOWN
// Above the phase-in ceiling, §199A(b)(2)(B) caps the deduction at the GREATER of
// 50% of the business's W-2 wages, or 25% of W-2 wages + 2.5% of UBIA. A sole
// proprietor with no payroll and no qualified property has $0 of both, so the cap is
// $0 and the deduction collapses to the §199A(i) $400 floor.
//
// The engine implemented this correctly and then bypassed it: a `strictWageCap` flag
// gated the correct path, defaulted to false, and was never set to true anywhere in
// the repository. Every filer above the threshold with no payroll received the full
// 20%. On the MFJ case below the app understated federal tax by $60,466 — 21% of the
// real liability, always in the taxpayer's favour.
//
// IF ONE OF THESE FAILS, THE ENGINE IS WRONG. Do not "fix" the test.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn, calcQBI, QBI_THRESHOLDS, QBI_PHASE_IN_RANGE } from './taxCalc.js'

const SOLE_PROP = 'Sole Proprietor / SMLLC'   // Vocabulary A; normalizeEntityType bridges it

/** Minimal full-return input. Everything the engine models, zeroed except what we set. */
function baseInput(over = {}) {
  return {
    taxYear: 2026,
    status: 'single',
    dependents: 0,
    k1Total: 0,
    w2: 0,
    rentalNet: 0, stGain: 0, ltGain: 0, intInc: 0, qualDiv: 0, divInc: 0,
    f4797Inc: 0, taxableSS: 0,
    selfEmpHealthIns: 0, hsaDeduction: 0, studentLoanInt: 0, selfEmpRetirement: 0,
    nolCarryforward: 0, priorYearQBILoss: 0, priorPassiveLossCarryforward: 0,
    saltAmount: 0, hasISO: false, isoBargainElement: 0,
    isREP: false, unrecap1250: 0, collectiblesGain: 0,
    w2Withheld: 0, estPaid: 0, ytdFactor: 1,
    useItemized: false, itemizedAmt: 0,
    entities: [],
    ...over,
  }
}

/** One Schedule C entity with NO payroll and NO qualified property. */
function solePropNoPayroll(netProfit) {
  return [{
    type: SOLE_PROP,
    own: 100,
    k1: netProfit,
    officerW2: 0,
    pnl: { netProfit },
    box17V_wages: 0,
    box17V_ubia: 0,
    box17V_sstb: false,
  }]
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('2026 §199A parameters (Rev. Proc. 2025-32 §4.26)', () => {

  it('threshold amounts match the Revenue Procedure exactly', () => {
    // "All other returns" — the row Single and Head of Household fall under — is
    // $201,750. $201,775 is the MARRIED FILING SEPARATELY figure. The table had the
    // MFS number in the single and hoh slots.
    expect(QBI_THRESHOLDS[2026].single).toBe(201750)
    expect(QBI_THRESHOLDS[2026].hoh).toBe(201750)
    expect(QBI_THRESHOLDS[2026].mfs).toBe(201775)
    expect(QBI_THRESHOLDS[2026].mfj).toBe(403500)
  })

  it('phase-in ranges are the OBBBA-widened $75K / $150K', () => {
    expect(QBI_PHASE_IN_RANGE[2026].single).toBe(75000)
    expect(QBI_PHASE_IN_RANGE[2026].mfj).toBe(150000)
    // ⇒ fully phased in at $276,750 (single) and $553,500 (MFJ).
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('§199A(b)(2)(B) wage/UBIA cap — the unit', () => {

  it('BELOW the threshold: no wage limit, full 20% (wage data irrelevant)', () => {
    // Taxable income $150,000 < $201,750 ⇒ the limitation does not apply at all.
    const r = calcQBI(150000, 150000, 0, { status: 'single', taxYear: 2026, entityQbiData: [] })
    expect(r.deduction).toBe(30000)          // 20% × 150,000
    expect(r.limitApplied).toBe('qbi')
  })

  it('ABOVE the phase-in ceiling with $0 wages and $0 UBIA: cap is $0 ⇒ $400 floor', () => {
    // THE REGRESSION. Before the fix this returned 20% × 465,765 = $93,153.
    const r = calcQBI(485000, 465765, 0, {
      status: 'single', taxYear: 2026,
      entityQbiData: solePropNoPayroll(485000),
    })
    expect(r.deduction).toBe(400)            // §199A(i) OBBBA minimum, NOT 20%
    expect(r.limitApplied).toBe('min400')
    expect(r.caps.wage).toBe(0)
    expect(r.wageDataMissing).toBe(true)
  })

  it('ABOVE the ceiling WITH wages: cap is 50% of W-2 wages', () => {
    // $200,000 of W-2 wages ⇒ cap $100,000. QBI component would be 20% × 600,000
    // = $120,000, so the wage cap binds at $100,000.
    const entities = [{ type: 'S Corporation', own: 100, k1: 600000, officerW2: 200000,
                        box17V_wages: 200000, box17V_ubia: 0, box17V_sstb: false }]
    const r = calcQBI(600000, 700000, 0, { status: 'single', taxYear: 2026, entityQbiData: entities })
    expect(r.caps.wage).toBe(100000)
    expect(r.deduction).toBe(100000)
    expect(r.limitApplied).toBe('wage')
    expect(r.wageDataMissing).toBe(false)
  })

  it('ABOVE the ceiling: UBIA alone can support a deduction (25% wages + 2.5% UBIA)', () => {
    // A real estate operator: no payroll, $4,000,000 of UBIA.
    // Cap = max(50% × 0, 25% × 0 + 2.5% × 4,000,000) = $100,000.
    const entities = [{ type: 'Real Estate (Schedule E)', own: 100, k1: 300000, officerW2: 0,
                        box17V_wages: 0, box17V_ubia: 4000000, box17V_sstb: false }]
    const r = calcQBI(300000, 400000, 0, { status: 'single', taxYear: 2026, entityQbiData: entities })
    expect(r.caps.wage).toBe(100000)
    expect(r.deduction).toBe(60000)          // 20% × 300,000 = 60,000 < 100,000 cap ⇒ QBI binds
    expect(r.limitApplied).toBe('qbi')
    expect(r.wageDataMissing).toBe(false)
  })

  it('INSIDE the phase-in range: the limitation applies proportionally, not as a cliff', () => {
    // Single, taxable income $239,250 = threshold 201,750 + 37,500, which is exactly
    // half of the $75,000 phase-in range ⇒ phasePercent = 0.50.
    // QBI component = 20% × 200,000 = $40,000. Wage cap = $0.
    // Reduction = (40,000 − 0) × 0.50 = $20,000 ⇒ deduction $20,000.
    const r = calcQBI(200000, 239250, 0, {
      status: 'single', taxYear: 2026,
      entityQbiData: solePropNoPayroll(200000),
    })
    expect(r.deduction).toBe(20000)
    expect(r.limitApplied).toBe('wage')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('GOLDEN RECORD 1 — single, $500,000 Schedule C, no payroll (2026)', () => {
  //
  //  HAND CALCULATION
  //  Net Schedule C profit                                        500,000
  //  SE tax base            500,000 × 0.9235                    = 461,750
  //  OASDI                  184,500 × 12.4%                     =  22,878
  //  Medicare               461,750 × 2.9%                      =  13,391
  //  SE tax                                                     =  36,269
  //  Addl Medicare (0.9%)   (461,750 − 200,000) × 0.9%          =   2,356
  //  Half SE deduction      36,269 / 2 (rounded)                =  18,135
  //  AGI                    500,000 − 18,135                    = 481,865
  //  Standard deduction (single, 2026)                          =  16,100
  //  Taxable before §199A                                       = 465,765
  //  §199A: TI 465,765 > ceiling 276,750; W-2 wages $0; UBIA $0
  //         cap = max(50%×0, 25%×0 + 2.5%×0) = 0 ⇒ §199A(i) floor =     400
  //  Taxable income                                             = 465,365
  //  Income tax  58,448 + 35% × (465,365 − 256,225)             = 131,647
  //  TOTAL       131,647 + 36,269 + 2,356                       = 170,272
  //
  //  The live app returned $137,808 — understated by $32,464.
  //
  const r = calcTaxReturn(baseInput({
    status: 'single',
    k1Total: 500000,
    entities: solePropNoPayroll(500000),
  }))

  it('SE tax and Additional Medicare Tax', () => {
    expect(r.seTax).toBe(36269)
    expect(r.additionalMedicare).toBe(2356)
  })

  it('AGI and taxable income before §199A', () => {
    // NB: the engine halves the ROUNDED SE tax (36,269 / 2 → 18,135), so AGI is
    // 481,865 not the 481,866 you get from halving the unrounded 36,268.75. Both are
    // defensible; the engine's choice is the one under test and it is self-consistent.
    // Total tax is unaffected.
    expect(r.agi).toBe(481865)
    expect(r.taxableBeforeQBI).toBe(465765)
  })

  it('§199A deduction is the $400 floor — NOT 20% of taxable income', () => {
    expect(r.qbi).toBe(400)
    expect(r.qbi).not.toBe(93153)            // ← the pre-fix answer
    expect(r.qbiLimitApplied).toBe('min400')
    expect(r.qbiWageDataMissing).toBe(true)
  })

  it('TOTAL federal tax', () => {
    expect(r.totalTax).toBe(170272)
    expect(r.totalTax).not.toBe(137808)      // ← the pre-fix answer
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('GOLDEN RECORD 2 — MFJ, $900,000 Schedule C, no payroll (2026)', () => {
  //
  //  This is the re-test the audit ran to prove the bug was not scenario-specific.
  //  The expected WRONG answer ($226,156) was predicted by hand BEFORE running the
  //  app, and the app matched it to the dollar.
  //
  //  HAND CALCULATION
  //  Net Schedule C profit                                        900,000
  //  SE tax base            900,000 × 0.9235                    = 831,150
  //  OASDI                  184,500 × 12.4%                     =  22,878
  //  Medicare               831,150 × 2.9%                      =  24,103
  //  SE tax                                                     =  46,981
  //  Addl Medicare (0.9%)   (831,150 − 250,000) × 0.9%          =   5,230
  //  Half SE deduction                                          =  23,491
  //  AGI                    900,000 − 23,491                    = 876,509
  //  Standard deduction (MFJ, 2026)                             =  32,200
  //  Taxable before §199A                                       = 844,309
  //  §199A: TI 844,309 > ceiling 553,500; wages $0; UBIA $0 ⇒ floor    400
  //  Taxable income                                             = 843,909
  //  Income tax  206,584 + 37% × (843,909 − 768,700)            = 234,411
  //  TOTAL       234,411 + 46,981 + 5,230                       = 286,622
  //
  const r = calcTaxReturn(baseInput({
    status: 'mfj',
    k1Total: 900000,
    entities: solePropNoPayroll(900000),
  }))

  it('SE tax and Additional Medicare Tax (MFJ $250K threshold)', () => {
    expect(r.seTax).toBe(46981)
    expect(r.additionalMedicare).toBe(5230)
  })

  it('AGI and taxable income before §199A', () => {
    expect(r.agi).toBe(876509)
    expect(r.taxableBeforeQBI).toBe(844309)
  })

  it('§199A deduction is the $400 floor', () => {
    expect(r.qbi).toBe(400)
    expect(r.qbi).not.toBe(168862)           // ← the pre-fix answer (20% × 844,309)
    expect(r.qbiLimitApplied).toBe('min400')
  })

  it('TOTAL federal tax — the $60,466 understatement is closed', () => {
    expect(r.totalTax).toBe(286622)
    expect(r.totalTax).not.toBe(226156)      // ← what the live site told a real user
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('BLOCKER 2 — the engine is the only source of a QBI number', () => {

  it('calcTaxReturn exposes the reason codes AIAnalysis needs, so it never recomputes', () => {
    // AIAnalysis used to re-run calcQBI purely to get limitApplied/caps for its copy —
    // and in doing so re-derived the DEDUCTION from a different base. These fields exist
    // so that no consumer has any reason to compute §199A for itself. If you find a
    // surface calling calcQBI directly, that is the bug returning.
    const r = calcTaxReturn(baseInput({
      status: 'mfj', k1Total: 900000, entities: solePropNoPayroll(900000),
    }))
    expect(r).toHaveProperty('qbi')
    expect(r).toHaveProperty('qbiLimitApplied')
    expect(r).toHaveProperty('qbiCaps')
    expect(r).toHaveProperty('qbiWageDataMissing')
    expect(r.qbiCaps).toHaveProperty('wage')
  })
})
