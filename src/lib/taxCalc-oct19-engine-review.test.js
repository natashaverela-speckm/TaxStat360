// OCT-19 ENGINE REVIEW (19 Oct 2026) — source-level review of src/lib/taxCalc.js after the
// Oct 4 once-over fixes shipped. Three reviewers read the engine by area; every candidate
// below was reproduced by executing calcTaxReturn and checked against the Code / forms before
// being written up, and every expected figure here was hand-computed.
//
//   H-1  REP hours test (§469(c)(7)(B)) gated only the §1.469-9(g) election; a property flagged
//        materiallyParticipates was nonpassive even when the hours failed.
//   H-2  Net ST loss / §1212(b) LT carryover reduced the 0/15/20% slice first; §1(h)(4)(B)(ii)-(iii)
//        and §1(h)(6)(A)(ii) reduce 28% gain, then unrecaptured §1250 gain, first.
//   M-3  §162(l) / §402(h) caps fell back to the entity's §199A payroll (box17V_wages) when no
//        officer W-2 was entered.
//   M-4  §6654 required annual payment measured gross of the refundable ACTC (§6654(f)).
//   M-5  §707(c) guaranteed payments omitted from the §461(l) business figure.
//   M-6  YTD mode annualized ltGain but not its §1250 / collectibles slices.
//   M-7  §63(f)(1) aged additional standard deduction never applied; OBBBA §63(f)(5) senior
//        deduction not added back to AMTI (2025 Form 6251 instr., line 1a / §56(b)(5)(D)).
//   L-a  REP nonpassive rental income excluded from NII without a §162 trade-or-business attestation.
//   L-b  §68 reduction could leave itemized below the standard deduction without re-electing.
//   L-c  Separately-stated §179 (box11_12) annualized in YTD mode.
import { describe, it, expect } from 'vitest'
import { calcTaxReturn, getStdDed } from './taxCalc.js'

const base = (o = {}) => ({ taxYear: 2026, status: 'single', dependents: 0, entities: [], k1Total: 0, w2: 0, assumeZeroBasisOnLoss: true, ...o })
const rental = (net, extra = {}) => ({ type: 'Real Estate (Schedule E)', own: '100', pnl: { netProfit: net }, ...extra })

describe('OCT-19 H-1 — a failed §469(c)(7)(B) hours test makes every rental passive', () => {
  const ent = [rental(-80000, { isActiveParticipant: true, isREP: true, materiallyParticipates: true })]
  it('SPEC: 400 of 2,000 hours → not a REP → loss suspended (MAGI $300k ⇒ $0 allowance): AGI $300,000, tax $69,034', () => {
    const r = calcTaxReturn(base({ w2: 300000, k1Total: -80000, entities: ent, isREP: true, repHoursRE: 400, repHoursTotal: 2000 }))
    expect(r.rentalAllowed).toBe(0)
    expect(r.agi).toBe(300000)
    expect(r.totalTax).toBe(69034)
  })
  it('SPEC: 900 of 1,500 hours → REP → nonpassive loss deducted in full: AGI $220,000, tax $42,604', () => {
    const r = calcTaxReturn(base({ w2: 300000, k1Total: -80000, entities: ent, isREP: true, repHoursRE: 900, repHoursTotal: 1500 }))
    expect(r.agi).toBe(220000)
    expect(r.totalTax).toBe(42604)
  })
  it('CHAR: the explicit override keeps its meaning — hours fail but the user asserts the test is met', () => {
    const r = calcTaxReturn(base({ w2: 300000, k1Total: -80000, entities: ent, isREP: true, repHoursRE: 400, repHoursTotal: 2000, repAggregationOverride: true }))
    expect(r.agi).toBe(220000)
  })
})

describe('OCT-19 H-2 — capital losses reduce the 28% and 25% slices before adjusted net capital gain', () => {
  const b = base({ w2: 300000 })
  // Ordinary TI $283,900 → $68,134.25; the preferential slices sit on top.
  it('SPEC: LTCG $100k incl. $40k §1250, STCL −$50k → net gain $50k all at 15%: $75,634 (was $79,634)', () => {
    expect(calcTaxReturn({ ...b, ltGain: 100000, unrecap1250: 40000, stGain: -50000 }).fedTax).toBe(75634)
  })
  it('SPEC: LTCG $100k incl. $40k collectibles, LT carryover $50k → $75,634 (was $80,834)', () => {
    expect(calcTaxReturn({ ...b, ltGain: 100000, collectiblesGain: 40000, capLossCarryforwardLT: 50000 }).fedTax).toBe(75634)
  })
  it('SPEC: partial — STCL −$20k leaves $20k of §1250 at 25% and $60k at 15%: $82,134', () => {
    expect(calcTaxReturn({ ...b, ltGain: 100000, unrecap1250: 40000, stGain: -20000 }).fedTax).toBe(82134)
  })
  it('SPEC: both slices — collectibles $30k absorbed first, then $10k of the §1250 $30k: $79,134', () => {
    expect(calcTaxReturn({ ...b, ltGain: 100000, unrecap1250: 30000, collectiblesGain: 30000, stGain: -40000 }).fedTax).toBe(79134)
  })
  it('CHAR: no loss — unchanged: $40k at 25% + $60k at 15% = $87,134', () => {
    expect(calcTaxReturn({ ...b, ltGain: 100000, unrecap1250: 40000 }).fedTax).toBe(87134)
  })
})

describe('OCT-19 M-3 — no officer W-2 ⇒ no §162(l) SEHI and no §402(h) SEP for an S-Corp shareholder', () => {
  it('SPEC: K-1-direct S-Corp with $300k Box 17V payroll and no officer salary: SEHI $0, SEP $0, AGI $200,000, tax $27,907 (was $10,090)', () => {
    const r = calcTaxReturn(base({ k1Total: 200000, entities: [{ type: 'S Corporation', own: '100', k1: 200000, k1DirectMode: true, box17V_wages: 300000, pnl: { netProfit: 200000 } }], selfEmpHealthIns: 30000, selfEmpRetirement: 70000 }))
    expect(r.selfEmpHealthDed).toBe(0)
    expect(r.scorpRetirementEntityDeduction).toBe(0)
    expect(r.agi).toBe(200000)
    expect(r.totalTax).toBe(27907)
  })
})

describe('OCT-19 M-4 — §6654(f): the required annual payment is measured net of the refundable ACTC', () => {
  it('SPEC: HOH, Sch C $60k, 2 children: tax $8,478, ACTC $1,719 → 90% safe harbor $6,083 (was $7,630, above the $6,759 balance)', () => {
    const r = calcTaxReturn(base({ status: 'hoh', k1Total: 60000, dependents: 2, entities: [{ type: 'Sole Proprietor / SMLLC', own: 100, pnl: { netProfit: 60000 } }] }))
    expect(r.totalTax).toBe(8478)
    expect(r.actc).toBe(1719)
    expect(r.safeHarborCurrentYear).toBe(6083)
    expect(r.quarterlyRecommended).toBeLessThanOrEqual(Math.ceil(r.balance / 4) + 1)
  })
})

describe('OCT-19 M-5 — §707(c) guaranteed payments are §461(l) trade-or-business income', () => {
  it('SPEC: partnership −$300k with $150k GP → net business loss $150k < $256k threshold → no EBL; AGI $150,000', () => {
    // assumeZeroBasisOnLoss off: the point is §461(l), not §704(d) (basis is not entered here).
    const r = calcTaxReturn(base({ w2: 300000, k1Total: -300000, assumeZeroBasisOnLoss: false, entities: [{ type: 'Partnership / LLC', own: '100', pnl: { netProfit: -300000 }, guaranteedPayments: 150000 }] }))
    expect(r.agi).toBe(150000)
  })
})

describe('OCT-19 M-6 — YTD mode scales the §1250 / collectibles slices with their parent', () => {
  it('SPEC: YTD ×2 of (LTCG $50k all §1250) equals the full-year LTCG $100k all §1250: $61,555', () => {
    const ytd  = calcTaxReturn(base({ w2: 100000, ltGain: 50000, unrecap1250: 50000, ytdFactor: 2 }))
    const full = calcTaxReturn(base({ w2: 200000, ltGain: 100000, unrecap1250: 100000 }))
    expect(ytd.fedTax).toBe(full.fedTax)
    expect(full.fedTax).toBe(61555)
  })
})

describe('OCT-19 M-7 — §63(f)(1) aged standard deduction and the AMT add-back of the §63(f)(5) senior deduction', () => {
  it('SPEC: getStdDed — $2,050 unmarried / $1,650 per married person for 2026; 2025 $2,000 / $1,600; 2024 $1,950 / $1,550', () => {
    expect(getStdDed(2026, 'single', 1)).toBe(18150)
    expect(getStdDed(2026, 'hoh', 1)).toBe(26200)
    expect(getStdDed(2026, 'mfj', 2)).toBe(35500)
    expect(getStdDed(2026, 'mfs', 1)).toBe(17750)
    expect(getStdDed(2026, 'qss', 1)).toBe(33850)
    expect(getStdDed(2025, 'single', 1)).toBe(17750)
    expect(getStdDed(2025, 'mfj', 2)).toBe(34700)
    expect(getStdDed(2024, 'single', 1)).toBe(16550)
    expect(getStdDed(2024, 'mfj', 1)).toBe(30750)
    expect(getStdDed(2026, 'single', 0)).toBe(16100)
  })
  it('SPEC: single 2026, W-2 $60k, 65+: deduction $18,150 + senior $6,000 → TI $35,850, tax $4,054 (was $4,300)', () => {
    const r = calcTaxReturn(base({ w2: 60000, age65Self: true }))
    expect(r.deduction).toBe(18150)
    expect(r.seniorDeduction).toBe(6000)
    expect(r.fedTax).toBe(4054)
  })
  it('SPEC: MFJ both 65, W-2 $100k: $35,500 + $12,000 → TI $52,500, tax $5,804 (was $6,200)', () => {
    const r = calcTaxReturn(base({ status: 'mfj', w2: 100000, age65Self: true, age65Spouse: true }))
    expect(r.deduction).toBe(35500)
    expect(r.fedTax).toBe(5804)
  })
  it('SPEC: MFS 65+ gets the §63(f)(1) amount but not the §63(f)(5) deduction; 2024 gets §63(f)(1) only', () => {
    const m = calcTaxReturn(base({ status: 'mfs', w2: 60000, age65Self: true }))
    expect(m.deduction).toBe(17750); expect(m.seniorDeduction).toBe(0)
    const y = calcTaxReturn(base({ taxYear: 2024, w2: 60000, age65Self: true }))
    expect(y.deduction).toBe(16550); expect(y.seniorDeduction).toBe(0)
  })
  it('SPEC: the $4,500 senior deduction is added back to AMTI — single, W-2 $100k, 65+, ISO spread $300k: total $81,882 (was $80,622)', () => {
    const r = calcTaxReturn(base({ w2: 100000, age65Self: true, hasISO: true, isoBargainElement: 300000 }))
    expect(r.seniorDeduction).toBe(4500)
    expect(r.totalTax).toBe(81882)
  })
})

describe('OCT-19 low items', () => {
  const rep = { isREP: true, rentalAggregationElection: true, repHoursRE: 900, repHoursTotal: 1500 }
  it('SPEC (L-a): a REP\'s nonpassive rental income stays in NII unless the property is attested as a §162 trade or business', () => {
    const noTB = calcTaxReturn(base({ w2: 300000, k1Total: 100000, entities: [rental(100000, { isREP: true, materiallyParticipates: true })], ...rep }))
    expect(noTB.niitAmount).toBe(3800)
    const tb = calcTaxReturn(base({ w2: 300000, k1Total: 100000, entities: [rental(100000, { isREP: true, materiallyParticipates: true, qbiEligible: true })], ...rep }))
    expect(tb.niitAmount).toBe(0)
  })
  it('SPEC (L-b): §68 can push itemized below the standard deduction — the standard deduction is then taken', () => {
    const r = calcTaxReturn(base({ w2: 900000, useItemized: true, itemizedAmt: 16500, saltAmount: 10000 }))
    expect(r.deduction).toBe(16100)
    expect(r.taxableIncome).toBe(883900)
  })
  it('SPEC (L-c): separately-stated §179 is not annualized in YTD mode', () => {
    const r = calcTaxReturn(base({ w2: 50000, ytdFactor: 2, k1Total: 50000, entities: [{ type: 'S Corporation', own: '100', pnl: { netProfit: 50000, officerSalary: 0 }, box11_12: '10000' }] }))
    expect(r.qbiBasis).toBe(90000)
  })
})
