// EIGHTH PASS (18 Sep 2026) — independent fresh-eyes calculation audit, engine findings.
//
// Every figure below was derived by hand from the statute / form instructions BEFORE the
// engine was run (SPEC), and each finding was reproduced on production first:
//   F-1  S-Corp SEHI: the S-Corp deducts the premium it paid (Rev. Rul. 91-26; Notice 2008-1)
//        — live: S-Corp gross $400k / expenses $100k / officer W-2 $100k, SEHI $20k → AGI
//        $292,350 shown, $272,350 correct.
//   F-2  S-Corp employer retirement contribution is a Form 1120-S deduction (§404(a),
//        §402(h)) — reduces the K-1 and the §199A base; capped at 25% of officer W-2 and
//        §415(c). Live: $40,000 contribution → §199A $38,470 shown, $30,470 correct on the
//        premium-free base; with the 25% cap the allowed contribution is $25,000.
//   F-5  Additional Medicare Tax the employer must withhold on wages above $200,000
//        (§3102(f)) is a payment (Form 1040 line 25c; Form 2210 line 6) — live: single, W-2
//        $500,000 showed the $2,700 as owed with no way to credit it.
//   F-10 HSA and self-employed retirement were deducted as entered — $10,000 HSA against
//        the $8,750 family limit; $100,000 SEP against a $300,000 Schedule C; $40,000 with no
//        SE income at all.
import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

const single2026 = (extra = {}) => calcTaxReturn({
  taxYear: 2026, status: 'single', dependents: 0, entities: [], w2: 0, k1Total: 0,
  w2Withheld: 0, estPaid: 0, ...extra,
})
// The live repro entity: gross $400,000, operating expenses $100,000, officer W-2 $100,000,
// employer FICA $7,650 → K-1 $192,350 (the Step 1 card figure).
const SCORP = { name: 'SC', type: 'S Corporation', own: '100', officerW2: '100000', k1: '192350' }
const SCHC  = (k1) => ({ name: 'SP', type: 'Sole Proprietor / SMLLC', own: '100', k1: String(k1) })

describe('EIGHTH PASS F-1 — the S-Corp deducts the health premium it paid (Form 1120-S), so the K-1 and the QBI base are smaller by the premium', () => {
  it('SPEC: live repro — SEHI $20,000: wages +20,000 (Box 1), K-1 −20,000, §162(l) −20,000 → AGI $272,350; QBI base $152,350 → §199A $30,470; tax $48,706', () => {
    const r = single2026({ entities: [SCORP], w2: 100000, k1Total: 192350, selfEmpHealthIns: 20000 })
    expect(r.sehiScorpWageGrossUp).toBe(20000)
    expect(r.sehiScorpEntityDeduction).toBe(20000)
    expect(r.selfEmpHealthDed).toBe(20000)
    expect(r.grossIncome).toBe(292350)                 // 100,000 + 20,000 + 192,350 − 20,000
    expect(r.agi).toBe(272350)
    // QBI: (192,350 − 20,000 entity deduction − 20,000 shareholder §162(l)) × 20% = 30,470;
    // TI before QBI 256,250 is inside the 2026 phase-in (201,750 + 75,000) but the wage
    // limit (50% × Box-1 wages 120,000 = 60,000) never binds.
    expect(r.nonSEk1ForQBI).toBe(152350)
    expect(r.qbi).toBe(30470)
    // TI 272,350 − 16,100 − 30,470 = 225,780 → 41,024 + 32% × 24,005 = 48,705.60
    expect(r.fedTax).toBe(48706)
  })
  it('SPEC: no SEHI → nothing changes (baseline of the same entity: AGI $292,350, §199A $38,470, tax $52,546 — matches the closeout live scenario)', () => {
    const r = single2026({ entities: [SCORP], w2: 100000, k1Total: 192350 })
    expect(r.sehiScorpEntityDeduction).toBe(0)
    expect(r.scorpEntityLevelDeductions).toBe(0)
    expect(r.agi).toBe(292350)
    expect(r.qbi).toBe(38470)
    expect(r.fedTax).toBe(52546)
  })
  it('SPEC: a sole proprietor is untouched — no entity-level leg, SEHI is a plain Schedule 1 deduction that also reduces QBI once', () => {
    const r = single2026({ entities: [SCHC(80000)], k1Total: 80000, selfEmpHealthIns: 20000 })
    expect(r.sehiScorpEntityDeduction).toBe(0)
    expect(r.selfEmpHealthDed).toBe(20000)
    expect(r.agi).toBe(80000 - r.halfSE - 20000)
  })
})

describe('EIGHTH PASS F-2 — S-Corp employer retirement contribution: entity-level, capped at 25% of officer W-2 and §415(c), reduces QBI', () => {
  it('SPEC: live repro — $40,000 entered against a $100,000 officer W-2: $25,000 allowed (25%), $15,000 disallowed; K-1 $167,350; §199A $33,470; AGI $267,350; tax $46,146', () => {
    const r = single2026({ entities: [SCORP], w2: 100000, k1Total: 192350, selfEmpRetirement: 40000 })
    expect(r.selfEmpRetirementEntered).toBe(40000)
    expect(r.retirementSeLegCap).toBe(0)               // no SE earnings on this return
    expect(r.retirementScorpLegCap).toBe(25000)
    expect(r.selfEmpRetirementDed).toBe(0)             // nothing on Schedule 1 line 16
    expect(r.scorpRetirementEntityDeduction).toBe(25000)
    expect(r.selfEmpRetirementDisallowed).toBe(15000)
    expect(r.selfEmpRetirementClamped).toBe(true)
    expect(r.agi).toBe(267350)
    expect(r.nonSEk1ForQBI).toBe(167350)
    expect(r.qbi).toBe(33470)                          // 167,350 × 20%; wage limit 50,000 does not bind
    // TI 267,350 − 16,100 − 33,470 = 217,780 → 41,024 + 32% × 16,005 = 46,145.60
    expect(r.fedTax).toBe(46146)
  })
  it('SPEC: within the cap ($20,000 on a $100,000 officer W-2) the whole contribution is the entity deduction and QBI drops by it', () => {
    const r = single2026({ entities: [SCORP], w2: 100000, k1Total: 192350, selfEmpRetirement: 20000 })
    expect(r.scorpRetirementEntityDeduction).toBe(20000)
    expect(r.selfEmpRetirementDisallowed).toBe(0)
    expect(r.agi).toBe(272350)
    expect(r.qbi).toBe(Math.round((192350 - 20000) * 0.20))   // 34,470
  })
  it('SPEC: the §415(c) dollar limit caps the S-Corp leg ($400,000 officer W-2 → 25% = $100,000, capped at $72,000 for 2026)', () => {
    const big = { ...SCORP, officerW2: '400000', k1: '100000' }
    const r = single2026({ entities: [big], w2: 400000, k1Total: 100000, selfEmpRetirement: 100000 })
    expect(r.retirementScorpLegCap).toBe(72000)
    expect(r.scorpRetirementEntityDeduction).toBe(72000)
    expect(r.selfEmpRetirementDisallowed).toBe(28000)
  })
  it('SPEC: the SE leg comes first, then the S-Corp leg (Schedule C $50,000 + S-Corp W-2 $100,000, $40,000 entered)', () => {
    // Sch C 50,000: NESE 46,175 → SE tax 7,064.78 → 7,065; ½ = 3,532.5 → 3,533 (Schedule SE rounding);
    // earned income 46,467 → SE-leg cap = min(46,467, 72,000, 20% × 46,467 + 24,500 = 33,793) = 33,793.
    const r = single2026({ entities: [SCORP, SCHC(50000)], w2: 100000, k1Total: 242350, selfEmpRetirement: 40000 })
    expect(r.halfSE).toBe(3533)
    expect(r.retirementSeLegCap).toBe(33793)
    expect(r.selfEmpRetirementDed).toBe(33793)                // Schedule 1 line 16
    expect(r.scorpRetirementEntityDeduction).toBe(40000 - 33793)   // 6,207 through the S-Corp
    expect(r.selfEmpRetirementDisallowed).toBe(0)
    expect(r.adjustments).toBe(3533 + 33793)
  })
})

describe('EIGHTH PASS F-10 — the sole-proprietor retirement cap and the HSA ceiling', () => {
  it('SPEC: Schedule C $300,000 with $100,000 entered → $72,000 allowed (20% × $284,544 + $24,500 deferral = $81,409, capped at the 2026 §415(c) $72,000)', () => {
    // NESE 277,050 → SS 22,878 + Medicare 8,034.45 = 30,912.45 → 30,912; ½ = 15,456
    const r = single2026({ entities: [SCHC(300000)], k1Total: 300000, selfEmpRetirement: 100000 })
    expect(r.halfSE).toBe(15456)
    expect(r.retirementSeLegCap).toBe(72000)
    expect(r.selfEmpRetirementDed).toBe(72000)
    expect(r.selfEmpRetirementDisallowed).toBe(28000)
    expect(r.agi).toBe(300000 - 15456 - 72000)
  })
  it('SPEC: a small Schedule C cannot defer more than its earned income ($20,000 net → cap $18,470)', () => {
    // NESE 18,470 → SE tax 2,825.91 → 2,826; ½ 1,413; earned income 18,587;
    // 20% × 18,587 + 24,500 = 28,217 > earned income → cap = 18,587.
    const r = single2026({ entities: [SCHC(20000)], k1Total: 20000, selfEmpRetirement: 25000 })
    expect(r.halfSE).toBe(1413)
    expect(r.retirementSeLegCap).toBe(18587)
    expect(r.selfEmpRetirementDed).toBe(18587)
  })
  it('SPEC: HSA $10,000 → $9,750 single (family $8,750 + one §223(b)(3) catch-up), $10,750 joint (two catch-ups); 2025 single $9,550', () => {
    const s = single2026({ w2: 100000, hsaDeduction: 10000 })
    expect(s.hsaEntered).toBe(10000)
    expect(s.hsaLimit).toBe(9750)
    expect(s.hsaDed).toBe(9750)
    expect(s.hsaClamped).toBe(true)
    expect(s.agi).toBe(100000 - 9750)
    const j = calcTaxReturn({ taxYear: 2026, status: 'mfj', w2: 100000, hsaDeduction: 11000 })
    expect(j.hsaLimit).toBe(10750)
    expect(j.hsaDed).toBe(10750)
    const p = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 100000, hsaDeduction: 9000 })
    expect(p.hsaLimit).toBe(9550)
    expect(p.hsaDed).toBe(9000)
    expect(p.hsaClamped).toBe(false)
  })
})

describe('EIGHTH PASS F-5 — Additional Medicare Tax withheld by the employer (§3102(f)) is credited as withholding', () => {
  it('SPEC: single, W-2 $500,000 → liability $2,700, withheld $2,700 → balance due unchanged by the tax (line 25c credit)', () => {
    const r = single2026({ w2: 500000 })
    expect(r.additionalMedicare).toBe(2700)
    expect(r.addlMedicareWithheld).toBe(2700)
    expect(r.withheldEntered).toBe(0)
    expect(r.withheld).toBe(2700)
    expect(r.totalPayments).toBe(2700)
    expect(r.balance).toBe(r.totalTax - 2700)
  })
  it('SPEC: withholding is per PAYING employer — S-Corp officer W-2 $150,000 + other employer $150,000: liability on $300,000 (single) is $900, but no employer crossed $200,000, so nothing was withheld', () => {
    const sc = { ...SCORP, officerW2: '150000', k1: '50000' }
    const r = single2026({ entities: [sc], w2: 300000, k1Total: 50000 })
    expect(r.additionalMedicare).toBe(900)
    expect(r.addlMedicareWithheld).toBe(0)
  })
  it('SPEC: joint return, one W-2 of $300,000: the employer withholds on $100,000 ($900) although the joint liability is on $50,000 ($450) — the excess is a refundable credit', () => {
    const r = calcTaxReturn({ taxYear: 2026, status: 'mfj', w2: 300000 })
    expect(r.additionalMedicare).toBe(450)
    expect(r.addlMedicareWithheld).toBe(900)
    expect(r.totalPayments).toBe(900)
  })
  it('SPEC: YTD mode — the credit is measured on wages paid TO DATE, not the annualized figure (half-year W-2 $150,000 → annualized $300,000, but the employer has withheld nothing yet)', () => {
    const r = single2026({ w2: 150000, ytdFactor: 2 })
    expect(r.additionalMedicare).toBe(900)             // liability on the annualized $300,000
    expect(r.addlMedicareWithheld).toBe(0)
    const later = single2026({ w2: 240000, ytdFactor: 1.2 })   // ten months in: $240,000 paid so far
    expect(later.addlMedicareWithheld).toBe(360)       // 0.9% × (240,000 − 200,000)
  })
})
