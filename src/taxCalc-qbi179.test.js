// taxCalc-qbi179.test.js
//
// Regression coverage for the QBI-179 fix in calcTaxReturn():
// the §199A QBI basis for a non-SE pass-through (S-Corp) must be net of the
// separately-stated §179 deduction (K-1 Box 11 → entity.box11_12), the same way
// AGI and the AI Analysis tab already net it. Before the fix, calcTaxReturn built
// the QBI basis from gross netProfit×ownership, so a filer who took §179 had QBI
// computed on the pre-§179 amount — overstating the 20% deduction and disagreeing
// with the Step-2 AGI and the Step-3 risk scan. §179 reduces QBI per
// Treas. Reg. §1.199A-3(b)(1)(ii)(A).

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc'

// Common personal context for a single filer with $100k outside W-2 wages, no other
// income, standard deduction, and taxable income comfortably under the 2024 §199A
// single threshold ($191,950) so the W-2/UBIA wage cap never binds and QBI is a clean
// 20% of the basis.
const baseInput = {
  taxYear: 2024, status: 'single', dependents: 0, w2: 100000,
  stGain: 0, ltGain: 0, intInc: 0, divInc: 0, qualDiv: 0, f4797Inc: 0,
  taxableSS: 0, iraIncome: 0,
  selfEmpHealthIns: 0, hsaDeduction: 0, studentLoanInt: 0, selfEmpRetirement: 0,
  nolCarryforward: 0, priorYearQBILoss: 0,
  saltAmount: 0, hasISO: false, isoBargainElement: 0,
  isREP: false, isActiveParticipant: false, rentalAggregationElection: false,
  unrecap1250: 0, collectiblesGain: 0,
  w2Withheld: 0, estPaid: 0, ytdFactor: 1,
  priorYearTax: 0, priorYearAGI: 0,
  priorPassiveLossCarryforward: 0, priorSuspendedLoss: 0,
  assumeZeroBasisOnLoss: true,
  useItemized: false, itemizedAmt: 0, medicalExpenses: 0,
}

const sCorp = (over = {}) => ({
  type: 'S Corporation', own: '100',
  pnl: { grossRevenue: 500000, totalExpenses: 400000, officerSalary: 100000, netProfit: 100000 },
  box11_12: '', box12_13: '', box17V_sstb: false,
  stockBasis: '558451', debtBasis: '', distributions: '',
  isREP: false, isActiveParticipant: false,
  ...over,
})

describe('calcTaxReturn — §199A QBI basis nets §179 (box11_12)', () => {
  it('reduces the QBI deduction by §179 for an S-Corp (the reported bug)', () => {
    // Net profit $100,000, §179 $30,500 → QBI basis $69,500 → 20% = $13,900.
    const input = { ...baseInput, k1Total: 69500, entities: [sCorp({ box11_12: '30500' })] }
    const r = calcTaxReturn(input)
    expect(r.qbi).toBe(13900)            // was 20000 before the fix
    expect(r.agi).toBe(169500)           // AGI already netted §179 (regression check)
  })

  it('is inert when no §179 is present (QBI on the full net)', () => {
    const input = { ...baseInput, k1Total: 100000, entities: [sCorp({ box11_12: '' })] }
    const r = calcTaxReturn(input)
    expect(r.qbi).toBe(20000)            // 20% of the full $100,000 net
  })

  it('keeps the §179-netted QBI consistent with the AGI net (no double-count)', () => {
    const input = { ...baseInput, k1Total: 69500, entities: [sCorp({ box11_12: '30500' })] }
    const r = calcTaxReturn(input)
    // QBI basis = AGI business component net of §179, not the gross.
    // taxableBeforeQBI = AGI - stdDed; QBI = 20% of (net K-1) = 13,900.
    expect(r.qbi).toBe(Math.round(69500 * 0.20))
  })
})
