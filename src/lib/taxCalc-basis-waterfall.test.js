// RENAMED (M6, audit F-07) from taxCalc-c11c12.test.js. Ticket history: C-11/C-12.
// Subject: §1368/§1366 stock-basis ordering (Reg. §1.1368-1(e)), Form 7203 basis
// entries, and the §469(c)(7)(B) hours gate on the REP aggregation election.
import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'
import { CURRENT_TAX_YEAR } from './constants.js'

// =============================================================================
// C-11 / C-12 — remediation of the 2025 edge-case accuracy audit.
//
//  Finding 1 (C-11) — basis waterfall ordering: §1368 distributions must reduce
//    stock basis BEFORE §1366 losses (Reg. §1.1368-1(e)). The prior engine applied
//    the loss first, over-stating §1368(b)(2) capital gain and under-stating the
//    suspended loss
//  Finding 3 (C-11) — Form 7203 basis section must recognize current-year capital
//    contributions (Line 2) and basis-increase income items (Lines 3a–3m), not just
//    beginning stock basis (Line 1).
//  Finding 2 (C-12) — the §1.469-9(g) aggregation election only frees rental losses
//    when the §469(c)(7)(B) two-part hours test is actually met; a failed test must
//    not auto-allow the loss absent an explicit override.
// =============================================================================

const sCorp = (over = {}) => ({
  name: 'SC', type: 'S Corporation', own: '100',
  box11_12: '', box12_13: '',
  stockBasis: '', debtBasis: '', distributions: '',
  capitalContributions: '', basisIncomeItems: '',
  ...over,
})

const run = (entity, extra = {}) => calcTaxReturn({
  taxYear: CURRENT_TAX_YEAR, status: 'mfj', dependents: 0,
  entities: [entity], w2: 500000, k1Total: parseFloat(entity.k1) || 0,
  assumeZeroBasisOnLoss: true, w2Withheld: 0, estPaid: 0, ...extra,
})

describe('C-11 Finding 1 — §1368 distributions applied before §1366 losses', () => {
  it('SPEC: Reg. §1.1368-1(e) — (a) distribution < pre-loss basis → no §1368 gain, larger suspended loss', () => {
    const r = run(sCorp({ k1: -343443, stockBasis: '100000', distributions: '40000' }))
    expect(r.distributionCapGain).toBe(0)
    // basis 100k − 40k dist = 60k absorbs loss; 343,443 − 60,000 = 283,443 suspended
    expect(r.totalSuspendedLoss).toBe(283443)
    expect(r.entityDistributionResults[0].excessCapGain).toBe(0)
  })

  it('SPEC: §1368(b)(2) — (b) distribution > pre-loss basis → gain on the TRUE excess only', () => {
    const r = run(sCorp({ k1: -343443, stockBasis: '100000', distributions: '150000' }))
    // excess = 150,000 − 100,000 pre-loss basis = 50,000 (NOT the full 150,000)
    expect(r.distributionCapGain).toBe(50000)
    expect(r.totalSuspendedLoss).toBe(343443) // basis exhausted by the distribution
    expect(r.ltGainEffective).toBe(50000)
  })

  it('SPEC: §1368(b) — (c) no loss: distribution reduces basis; excess over basis+income is gain', () => {
    const r = run(sCorp({ k1: 20000, stockBasis: '100000', distributions: '150000' }))
    // pre-dist basis = 100,000 + 20,000 income = 120,000; excess = 30,000
    expect(r.distributionCapGain).toBe(30000)
    expect(r.totalSuspendedLoss).toBe(0)
  })
})

describe('C-11 Finding 3 — Form 7203 Line 2 contributions create basis', () => {
  it('SPEC: Form 7203 Line 2 — audit case: $264,020 contributions fund the loss; no §1368 gain', () => {
    const r = run(sCorp({
      k1: -343443, stockBasis: '0', capitalContributions: '264020', distributions: '143881',
    }))
    // dist 143,881 < 264,020 contributed basis → tax-free return, NO capital gain
    expect(r.distributionCapGain).toBe(0)
    // basis after dist = 120,139 absorbs that much loss; 343,443 − 120,139 = 223,304 suspended
    expect(r.totalSuspendedLoss).toBe(223304)
    expect(r.entityBasisResults[0].k1Allowed).toBe(-120139)
  })

  it('CHAR: contributions alone (blank beginning basis) count as a basis entry', () => {
    const r = run(sCorp({ k1: -50000, stockBasis: '', capitalContributions: '50000' }))
    expect(r.totalSuspendedLoss).toBe(0)
    expect(r.entityBasisResults[0].basisAssumedZero).toBe(false)
  })

  it('SPEC: Form 7203 Lines 3a–3m — basis-increase income items restore basis', () => {
    const r = run(sCorp({ k1: -50000, stockBasis: '10000', basisIncomeItems: '30000' }))
    // 10,000 + 30,000 = 40,000 basis → 10,000 suspended
    expect(r.totalSuspendedLoss).toBe(10000)
  })
})

describe('C-12 Finding 2 — §469(c)(7)(B) hours test gates the aggregation election', () => {
  const rep = (extra = {}) => calcTaxReturn({
    taxYear: 2026, status: 'mfj', dependents: 0, entities: [],
    w2: 300000, rentalNet: -91599, isREP: true, rentalAggregationElection: true, ...extra,
  })

  it('CHAR: hours omitted → unchanged behavior: election frees the loss (backward compatible)', () => {
    const r = rep()
    expect(r.repHoursTestProvided).toBe(false)
    expect(r.rentalNonpassiveNet).toBe(-91599)
    expect(r.palSuspendedRental).toBe(0)
  })

  it('SPEC: §469(c)(7)(B) — failing hours (800 of 3,000) → election NOT operative, loss suspended', () => {
    const r = rep({ repHoursRE: 800, repHoursTotal: 3000 })
    expect(r.repHoursTestFailed).toBe(true)
    expect(r.repAggregationGatedOut).toBe(true)
    expect(r.rentalNonpassiveNet).toBe(0)
    expect(r.rentalPassiveNet).toBe(-91599)
    expect(r.palSuspendedRental).toBe(91599) // AGI > $150k → $0 §469(i) allowance
    expect(r.rentalAllowed).toBe(0)
  })

  it('CHAR: failing hours + explicit override → election honored (at-risk position recorded)', () => {
    const r = rep({ repHoursRE: 800, repHoursTotal: 3000, repAggregationOverride: true })
    expect(r.repHoursTestFailed).toBe(true)
    expect(r.repAggregationGatedOut).toBe(false)
    expect(r.rentalNonpassiveNet).toBe(-91599)
  })

  it('SPEC: §469(c)(7)(B) — passing hours (2,000 of 3,000, >750 and >50%) → election operative', () => {
    const r = rep({ repHoursRE: 2000, repHoursTotal: 3000 })
    expect(r.repHoursTestPasses).toBe(true)
    expect(r.repAggregationGatedOut).toBe(false)
    expect(r.rentalNonpassiveNet).toBe(-91599)
  })
})
