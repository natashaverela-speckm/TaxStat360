// FIFTH READ (external calculation audit, 15 Sep 2026) — SPEC tests for the passive-K-1
// findings F-1 and F-2, the §199A(i) floor ordering F-5, and the QSS "joint return"
// thresholds F-4. Each `it` reproduces the audit's live repro figures where one exists.
//
//   F-1  A limited partner's / non-material-participation LLC member's Box 1 share is
//        passive activity income and therefore NET INVESTMENT INCOME — IRC §1411(c)(1)(A)(ii),
//        §1411(c)(2)(A); Form 8960 line 4a. The NII base omitted it entirely.
//   F-2  Passive K-1 income offsets a passive rental loss BEFORE the §469(i) $25,000
//        allowance is measured — §469(d)(1); Form 8582 Part I. The allowance was applied
//        to the rental loss alone, wrongly suspending a loss the passive income absorbed.
//   F-4  §24(h)(3) ($400,000), §170(p) ($2,000) and §461(l)(3)(A)(ii) (2×) apply "in the
//        case of a joint return". A qualifying surviving spouse files an individual return
//        on the joint RATE schedule — not a joint return (Schedule 8812 line 9 instructions:
//        "$400,000 if married filing jointly; $200,000 for all other filing statuses").
//   F-5  §199A(i) makes "the deduction allowed under subsection (a)" — i.e. after the
//        (a)(2) 20%-of-taxable-income cap — "equal to the greater of" that amount or $400.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn, calcQBI } from './taxCalc.js'

const passivePartner = (k1) => ({
  type: 'Partnership / LLC', k1, own: 100, limitedPartner: true, netProfit: k1,
})
const activePartner = (k1) => ({
  type: 'Partnership / LLC', k1, own: 100, limitedPartner: false, netProfit: k1,
})
const scorp = (k1, officerW2) => ({
  type: 'S Corporation', k1, own: 100, officerW2, pnl: { officerSalary: officerW2, netProfit: k1 },
})
const rental = (net, extra = {}) => ({
  type: 'Real Estate (Schedule E)', k1: net, own: 100, isActiveParticipant: true, ...extra,
})

describe('FIFTH READ F-1 — passive partnership K-1 income is net investment income (§1411(c)(2)(A))', () => {
  // Audit repro: 2026 · Single · S-Corp K-1 $192,350 + officer W-2 $100,000 ·
  // limited-partner K-1 $300,000 → AGI $592,350. App showed no NIIT; correct $11,400.
  const base = {
    taxYear: 2026, status: 'single', dependents: 0, w2Withheld: 0, estPaid: 0,
    entities: [scorp(192350, 100000), passivePartner(300000)],
    w2: 100000, k1Total: 192350 + 300000,
  }
  it('REPRO: NII = $300,000 and NIIT = 3.8% × min(NII, MAGI − $200,000) = $11,400', () => {
    const r = calcTaxReturn(base)
    expect(r.agi).toBe(592350)
    expect(r.passiveK1Income).toBe(300000)
    expect(r.passiveK1NII).toBe(300000)
    expect(r.nii).toBe(300000)
    expect(r.niitAmount).toBe(11400)
    expect(r.niit.applies).toBe(true)
    // Income tax itself was already right (the audit matched $156,992 to the dollar).
    expect(r.fedTax).toBe(156992)
    expect(r.totalTax).toBe(156992 + 11400)
  })
  it('SPEC: the SAME share as an ACTIVE (general) partner is SE income, not NII', () => {
    const r = calcTaxReturn({ ...base, entities: [scorp(192350, 100000), activePartner(300000)] })
    expect(r.passiveK1Income).toBe(0)
    expect(r.nii).toBe(0)
    expect(r.niitAmount).toBe(0)
    expect(r.seTax).toBeGreaterThan(0)
  })
  it('SPEC: a passive K-1 LOSS is floored at $0 — it does not reduce other NII (conservative; K-1 loss suspension is unmodeled)', () => {
    const r = calcTaxReturn({
      taxYear: 2026, status: 'single', w2: 300000, intInc: 40000,
      entities: [passivePartner(-50000)], k1Total: -50000,
    })
    expect(r.passiveK1Income).toBe(0)
    expect(r.nii).toBe(40000)
    expect(r.niitAmount).toBe(Math.round(40000 * 0.038))
  })
  it('SPEC: S-Corp K-1 (no passive attestation in the UI) stays out of NII — unchanged behavior', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 100000, entities: [scorp(300000, 100000)], k1Total: 300000 })
    expect(r.passiveK1Income).toBe(0)
    expect(r.niitAmount).toBe(0)
  })
  it('SPEC: §179 separately stated on the passive K-1 reduces the NII share; charitable (box12_13) does not', () => {
    const r = calcTaxReturn({
      taxYear: 2026, status: 'single', w2: 300000,
      entities: [{ ...passivePartner(100000), box11_12: 20000, box12_13: 5000 }], k1Total: 80000,
    })
    expect(r.passiveK1Income).toBe(80000)
    expect(r.nii).toBe(80000)
  })
})

describe('FIFTH READ F-2 — passive K-1 income absorbs passive rental losses before the §469(i) allowance (§469(d)(1))', () => {
  // Audit repro: 2026 · Single · S-Corp K-1 $35,410 + officer W-2 $60,000 · limited-partner
  // K-1 $20,000 · rental −$30,000 (active participation). MAGI $115,410 → allowance $17,295.
  // App suspended $12,705; correct: $20,000 absorbed by passive income, remaining $10,000
  // within the allowance → $0 suspended, AGI $85,410.
  const base = {
    taxYear: 2026, status: 'single', dependents: 0, w2Withheld: 0, estPaid: 0,
    entities: [scorp(35410, 60000), passivePartner(20000), rental(-30000)],
    w2: 60000, k1Total: 35410 + 20000 - 30000,
  }
  it('REPRO: nothing is suspended and AGI is $85,410', () => {
    const r = calcTaxReturn(base)
    expect(r.passiveLossAbsorbedByK1).toBe(20000)
    expect(r.palSuspendedRental).toBe(0)
    expect(r.rentalAllowed).toBe(-30000)
    expect(r.agi).toBe(85410)
  })
  it('REPRO (control): the same $20,000 as NONPASSIVE K-1 (a second S-Corp) — the allowance alone applies: $17,295 allowed, $12,705 suspended (prior behavior, still correct for that fact pattern)', () => {
    const r = calcTaxReturn({ ...base, entities: [scorp(35410, 60000), scorp(20000, 0), rental(-30000)] })
    expect(r.passiveLossAbsorbedByK1).toBe(0)
    expect(r.rentalAllowed).toBe(-17295)
    expect(r.palSuspendedRental).toBe(12705)
  })
  it('SPEC: the absorbed slice is excluded from NII so the same dollars are not offset AND taxed (Form 8960 line 4b)', () => {
    const r = calcTaxReturn({ ...base, w2: 400000 })   // push MAGI over the threshold so NII binds
    expect(r.passiveLossAbsorbedByK1).toBe(20000)
    expect(r.passiveK1NII).toBe(0)
    expect(r.rentalNII).toBe(0)
  })
  it('SPEC: passive income larger than the loss — only the loss amount is absorbed, the rest is NII', () => {
    const r = calcTaxReturn({
      taxYear: 2026, status: 'single', w2: 300000,
      entities: [passivePartner(50000), rental(-10000)], k1Total: 40000,
    })
    expect(r.passiveLossAbsorbedByK1).toBe(10000)
    expect(r.palSuspendedRental).toBe(0)
    expect(r.passiveK1NII).toBe(40000)
    expect(r.nii).toBe(40000)
  })
  it('SPEC: allowance still limits the REMAINDER — $60k passive loss, $20k passive income, MAGI ≥ $150k ⇒ $40k suspended', () => {
    const r = calcTaxReturn({
      taxYear: 2026, status: 'single', w2: 200000,
      entities: [passivePartner(20000), rental(-60000)], k1Total: -40000,
    })
    expect(r.passiveLossAbsorbedByK1).toBe(20000)
    expect(r.palSuspendedRental).toBe(40000)
    expect(r.rentalAllowed).toBe(-20000)
  })
  it('SPEC: per-property regime (REP flag present) applies the same netting', () => {
    const r = calcTaxReturn({
      ...base,
      entities: [scorp(35410, 60000), passivePartner(20000), rental(-30000, { isREP: true, materiallyParticipates: false })],
      isREP: true,
    })
    expect(r.passiveLossAbsorbedByK1).toBe(20000)
    expect(r.palSuspendedRental).toBe(0)
  })
})

describe('FIFTH READ F-4 — QSS is not "a joint return" for §24(h)(3), §170(p) and §461(l)', () => {
  it('CTC phase-out begins at $200,000 for QSS (Schedule 8812 line 9), $400,000 only for MFJ', () => {
    const mk = (status) => calcTaxReturn({ taxYear: 2026, status, dependents: 2, w2: 300000, entities: [], k1Total: 0 })
    expect(mk('mfj').ctcRaw).toBe(4400)
    // QSS at $300,000 AGI: $100,000 over → 100 steps × $50 = $5,000 reduction → $0
    expect(mk('qss').ctcRaw).toBe(0)
    expect(mk('qss').ctcRaw).toBe(mk('single').ctcRaw)
  })
  it('§170(p) non-itemizer charitable: $1,000 for QSS, $2,000 for MFJ (2026)', () => {
    const mk = (status) => calcTaxReturn({ taxYear: 2026, status, w2: 80000, charitableContr: 5000, entities: [], k1Total: 0 })
    expect(mk('mfj').nonItemizerCharitable).toBe(2000)
    expect(mk('qss').nonItemizerCharitable).toBe(1000)
    expect(mk('single').nonItemizerCharitable).toBe(1000)
  })
  it('§461(l) threshold for QSS equals the individual amount in every table year', () => {
    for (const [year, single] of [[2024, 305000], [2025, 313000], [2026, 256000]]) {
      const r = calcTaxReturn({ taxYear: year, status: 'qss', w2: 50000, entities: [], k1Total: 0 })
      expect(r.eblThreshold).toBe(single)
      const j = calcTaxReturn({ taxYear: year, status: 'mfj', w2: 50000, entities: [], k1Total: 0 })
      expect(j.eblThreshold).toBe(single * 2)
    }
  })
  it('CONTROL: QSS keeps the joint RATE schedule, standard deduction, and $250k NIIT threshold (unchanged)', () => {
    const q = calcTaxReturn({ taxYear: 2026, status: 'qss', w2: 260000, intInc: 20000, entities: [], k1Total: 0 })
    const j = calcTaxReturn({ taxYear: 2026, status: 'mfj', w2: 260000, intInc: 20000, entities: [], k1Total: 0 })
    expect(q.stdDed).toBe(j.stdDed)
    expect(q.fedTax).toBe(j.fedTax)
    expect(q.niitAmount).toBe(j.niitAmount)
  })
})

describe('FIFTH READ F-5 — §199A(i) $400 floor survives the 20%-of-taxable-income cap', () => {
  it('taxable income $1,500, active QBI $5,000 (2026): cap would give $300; floor lifts it to $400', () => {
    const r = calcQBI(5000, 1500, 0, { taxYear: 2026, status: 'single', activeQbi: 5000 })
    expect(r.deduction).toBe(400)
    expect(r.limitApplied).toBe('min400')
  })
  it('floor is still held to taxable income (TI $250 ⇒ $250, not $400)', () => {
    const r = calcQBI(5000, 250, 0, { taxYear: 2026, status: 'single', activeQbi: 5000 })
    expect(r.deduction).toBe(250)
  })
  it('CONTROL: no floor in 2025; cap applies as before', () => {
    const r = calcQBI(5000, 1500, 0, { taxYear: 2025, status: 'single', activeQbi: 5000 })
    expect(r.deduction).toBe(300)
    expect(r.limitApplied).toBe('income')
  })
  it('CONTROL: under $1,000 of active QBI the floor never applies', () => {
    const r = calcQBI(800, 1500, 0, { taxYear: 2026, status: 'single', activeQbi: 800 })
    expect(r.deduction).toBe(160)
  })
})

describe('FIFTH READ full pass — per-business §199A allocation uses SE-adjusted QBI (Reg. §1.199A-3(b)(1)(vi))', () => {
  // Live repro: single 2026 · S-Corp K-1 $192,350 with $100k officer wages · Schedule C
  // $100,000 (no wages) · taxable income above the full phase-in. Per business: S-Corp
  // 20% × 192,350 = 38,470 (≤ 50% × 100,000); Schedule C wage-limited to $0. Was $37,604.
  const run = (extra = {}) => calcTaxReturn({
    taxYear: 2026, status: 'single', dependents: 0, w2: 100000, k1Total: 292350,
    entities: [scorp(192350, 100000), { type: 'Sole Proprietor / SMLLC', k1: 100000, own: 100, netProfit: 100000 }],
    ...extra,
  })
  it('REPRO: QBI deduction is $38,470 (the S-Corp keeps its own 20%)', () => {
    const r = run()
    expect(r.seTax).toBe(13156)
    expect(r.qbi).toBe(38470)
    expect(r.qbiLimitApplied).toBe('wage')
  })
  it('CONTROL: below the threshold the allocation is irrelevant — 20% of the adjusted aggregate, unchanged', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 20000, k1Total: 50000,
      entities: [scorp(30000, 20000), { type: 'Sole Proprietor / SMLLC', k1: 20000, own: 100, netProfit: 20000 }] })
    // qbiBasis = 30,000 + (20,000 − ½ SE) ; 20% of that, no wage limit below threshold
    expect(r.qbi).toBe(Math.round(0.2 * (30000 + 20000 - r.halfSE)))
    expect(r.qbiLimitApplied).toBe('qbi')
  })
  it('CONTROL: with the Schedule C paying wages of its own, both businesses keep their 20%', () => {
    const r = run({ entities: [scorp(192350, 100000), { type: 'Sole Proprietor / SMLLC', k1: 100000, own: 100, netProfit: 100000, box17V_wages: 60000 }] })
    // Sch C adjusted QBI = 100,000 − 6,578 = 93,422 → 20% = 18,684 ≤ 30,000 wage cap
    expect(r.qbi).toBe(38470 + Math.round(0.2 * (100000 - r.halfSE)))
  })
})
