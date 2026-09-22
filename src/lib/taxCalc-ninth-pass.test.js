// NINTH PASS (22 Sep 2026) — pre-launch final review, live-site findings. Engine SPECs.
//
//   N-1  Excess Social Security withholding (§31(b), §6413(c); Schedule 3 line 11) was never
//        credited. Live: S-Corp officer W-2 $100,000 + other-employer W-2 $500,000 → balance
//        due $229,836 shown, $223,636 correct ($6,200 of excess OASDI withheld).
//   N-2  A fully phased-out SSTB produced a phantom §199A loss carryforward equal to the
//        ½-SE deduction. Live: Sch C $300,000 (SSTB) + W-2 $20,000 → "$14,216 carries to
//        next year". §199A(d)(1)(A): the SSTB is not a qualified trade or business at all.
//   N-5  The retirement ceiling assumed a Solo 401(k) (20% + the §402(g) deferral) for every
//        entry; a SEP-IRA has no employee deferral (§408(k)(6)). The HSA ceiling assumed
//        family coverage plus the age-55 catch-up.
//   N-7  A typed prior-year tax of $0 was treated as "not entered"; §6654(e)(2) exempts the
//        year entirely. §6654(e)(1): no penalty when tax after withholding is under $1,000.
//   N-11 The "SE tax savings" K-1 figure ignored the S-Corp's entity-level SEHI / retirement
//        deductions (EIGHTH PASS F-1/F-2).
import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

const SCORP = {
  id: 's1', name: 'S', type: 'S Corporation', own: '100',
  pnl: { grossRevenue: 400000, totalExpenses: 207650, officerSalary: 100000, employerPayrollTax: 7650, netProfit: 192350 },
  officerW2: 100000, netProfit: 192350,
}
const SCHC = (extra = {}) => ({
  id: 'c1', name: 'C', type: 'Sole Proprietor / SMLLC', own: '100',
  pnl: { grossRevenue: 300000, totalExpenses: 0, netProfit: 300000 }, netProfit: 300000, ...extra,
})
const base = (o = {}) => ({ taxYear: 2026, status: 'single', dependents: 0, entities: [], k1Total: 0, w2: 0, assumeZeroBasisOnLoss: true, ...o })

describe('NINTH PASS N-1 — excess Social Security withholding is a refundable credit', () => {
  it('live repro: officer W-2 $100,000 + other W-2 $500,000 (single, 2026) → $6,200 credited', () => {
    const r = calcTaxReturn(base({ entities: [SCORP], k1Total: 192350, w2: 600000 }))
    // Each employer withholds 6.2% up to the $184,500 base on its own: 6,200 + 11,439 = 17,639 vs 11,439 max.
    expect(r.excessSSWithheld).toBe(6200)
    expect(r.addlMedicareWithheld).toBe(2700)                 // EIGHTH PASS F-5 unchanged
    expect(r.withheld).toBe(2700 + 6200)
    expect(r.balance).toBe(r.totalTax - 2700 - 6200)
    expect(r.balance).toBe(223636)
  })
  it('two officer salaries from two corporations coordinate the same way', () => {
    const s2 = { ...SCORP, id: 's2', name: 'S2' }
    const r = calcTaxReturn(base({ entities: [SCORP, s2], k1Total: 384700, w2: 200000 }))
    // 6,200 + 6,200 = 12,400 withheld on $200,000 of wages; max 11,439 → 961 excess.
    expect(r.excessSSWithheld).toBe(961)
  })
  it('a single employer never produces excess, however large the wage', () => {
    const r = calcTaxReturn(base({ w2: 900000 }))
    expect(r.excessSSWithheld).toBe(0)
  })
  it('MFJ: the other-employer W-2 is the spouse\'s unless attributed to the owner (§6413(c) is per individual)', () => {
    const unattributed = calcTaxReturn(base({ status: 'mfj', entities: [SCORP], k1Total: 192350, w2: 600000 }))
    expect(unattributed.excessSSWithheld).toBe(0)
    const attributed = calcTaxReturn(base({ status: 'mfj', entities: [SCORP], k1Total: 192350, w2: 600000, w2OwnForSE: 600000 }))
    expect(attributed.excessSSWithheld).toBe(6200)
  })
  it('the credit counts as withholding for the §6654 safe-harbor schedule (Form 2210 line 6)', () => {
    const r = calcTaxReturn(base({ entities: [SCORP], k1Total: 192350, w2: 600000, priorYearTax: 20000, priorYearAGI: 100000 }))
    expect(r.installmentSchedule[3].paidCumulative).toBe(8900)
  })
})

describe('NINTH PASS N-2 — a phased-out SSTB carries no phantom QBI loss', () => {
  it('live repro: Sch C $300,000 SSTB + W-2 $20,000 → §199A $0 and NO carryforward', () => {
    const r = calcTaxReturn(base({ entities: [SCHC({ box17V_sstb: true })], k1Total: 300000, w2: 20000 }))
    expect(r.taxableBeforeQBI).toBeGreaterThan(276750)
    expect(r.qbi).toBe(0)
    expect(r.qbiCarryforward).toBe(0)
    expect(r.totalTax).toBe(99464)   // unchanged from the live figure — only the message was wrong
  })
  it('inside the phase-in range the (unchanged) partial deduction stands and still nothing carries', () => {
    const r = calcTaxReturn(base({ entities: [SCHC({ box17V_sstb: true })], k1Total: 300000 }))
    expect(r.qbi).toBe(698)
    expect(r.qbiCarryforward).toBe(0)
  })
  it('a genuine SSTB loss above the range is still excluded from the carryforward (prior behavior kept)', () => {
    const loss = SCHC({ box17V_sstb: true, pnl: { grossRevenue: 0, totalExpenses: 50000, netProfit: -50000 }, netProfit: -50000 })
    const r = calcTaxReturn(base({ entities: [loss], k1Total: -50000, w2: 400000 }))
    expect(r.qbiCarryforward).toBe(0)
  })
  it('a non-SSTB loss still carries forward in full', () => {
    const loss = SCHC({ pnl: { grossRevenue: 0, totalExpenses: 50000, netProfit: -50000 }, netProfit: -50000 })
    const r = calcTaxReturn(base({ entities: [loss], k1Total: -50000, w2: 400000 }))
    expect(r.qbiCarryforward).toBe(50000)
  })
})

describe('NINTH PASS N-5 — plan type and HSA coverage narrow the ceilings', () => {
  it('Solo 401(k) (default) keeps the prior ceiling: 20% of net SE earnings + deferral, capped at §415(c)', () => {
    const r = calcTaxReturn(base({ entities: [SCHC()], k1Total: 300000, selfEmpRetirement: 80000 }))
    expect(r.retirementPlanTypeApplied).toBe('solo401k')
    expect(r.selfEmpRetirementDed).toBe(72000)
  })
  it('SEP-IRA: 20% of net SE earnings only ($56,909 on $300,000 of Schedule C)', () => {
    const r = calcTaxReturn(base({ entities: [SCHC()], k1Total: 300000, selfEmpRetirement: 80000, retirementPlanType: 'sep' }))
    expect(r.retirementPlanTypeApplied).toBe('sep')
    expect(r.retirementDeferralLimit).toBe(0)
    expect(r.selfEmpRetirementDed).toBe(56909)
    expect(r.selfEmpRetirementDisallowed).toBe(80000 - 56909)
  })
  it('HSA: self-only, under 55 → $4,400 (2026); family + 55 (default) → $9,750; MFJ family + 55 → $10,750', () => {
    expect(calcTaxReturn(base({ w2: 100000, hsaDeduction: 10000, hsaCoverage: 'self', hsaCatchUp55: false })).hsaDed).toBe(4400)
    expect(calcTaxReturn(base({ w2: 100000, hsaDeduction: 10000 })).hsaDed).toBe(9750)
    expect(calcTaxReturn(base({ status: 'mfj', w2: 100000, hsaDeduction: 12000 })).hsaDed).toBe(10750)
    expect(calcTaxReturn(base({ w2: 100000, hsaDeduction: 10000, hsaCoverage: 'family', hsaCatchUp55: false })).hsaDed).toBe(8750)
  })
})

describe('NINTH PASS N-7 — §6654(e) exceptions', () => {
  it('a typed prior-year tax of $0 exempts the year (§6654(e)(2)); a blank does not', () => {
    const zero = calcTaxReturn(base({ w2: 100000, priorYearTax: 0, priorYearTaxEntered: true, priorYearAGI: 100000 }))
    expect(zero.underpaymentPenaltyExempt).toBe('priorYearZero')
    expect(zero.safeHarborPriorYear).toBe(0)
    expect(zero.safeHarborMinimum).toBe(0)
    expect(zero.safeHarborQuarterly).toBe(0)
    expect(zero.installmentSchedule.every(q => q.requiredCumulative === 0 && q.shortfall === 0)).toBe(true)
    const blank = calcTaxReturn(base({ w2: 100000, priorYearTax: 0 }))
    expect(blank.underpaymentPenaltyExempt).toBe(null)
    expect(blank.safeHarborPriorYear).toBe(null)
  })
  it('tax after withholding under $1,000 is exempt (§6654(e)(1)); estimated payments do not count toward that test', () => {
    const r = calcTaxReturn(base({ w2: 100000, w2Withheld: 12500, priorYearTax: 20000 }))
    expect(r.balance).toBe(670)
    expect(r.underpaymentPenaltyExempt).toBe('deMinimis')
    const est = calcTaxReturn(base({ w2: 100000, estPaid: 12500, priorYearTax: 20000 }))
    expect(est.balance).toBe(670)
    expect(est.underpaymentPenaltyExempt).toBe(null)
  })
})

describe('NINTH PASS N-11 — the SE-savings K-1 reflects the entity-level deductions', () => {
  it('SEHI $20,000 on the S-Corp reduces the K-1 the savings card quotes', () => {
    const r = calcTaxReturn(base({ entities: [SCORP], k1Total: 192350, w2: 100000, selfEmpHealthIns: 20000 }))
    expect(r.scorpEntityLevelDeductions).toBe(20000)
    expect(r.k1Distributions).toBe(172350)
  })
})
