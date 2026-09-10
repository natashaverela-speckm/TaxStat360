// src/whatif-simulator.test.js
//
// SIM-1 repair (Batch 7, Jul 2026) — the What-If Simulator's scenario math.
// The core guarantee: the simulator IS the engine. Every scenario figure must
// equal a direct calcTaxReturn() call on the equivalently-built input, so the
// simulator can never again show a number the Tax Tracker would disagree with.

import { describe, it, expect } from 'vitest'
import { computeSimulatorScenario, buildSimulatorBase } from './aiAnalysisTaxMath.js'
import { calcTaxReturn, calcEmployerFICA } from './taxCalc.js'
import { CURRENT_TAX_YEAR } from './constants.js'

// AUDIT H1 (Sep 2026): the S-Corp's EMPLOYER-side FICA on officer salary (IRC §3111)
// is a deductible expense of the entity and was subtracted nowhere — the simulator
// mirrored the Tax Tracker's bug, so a "what if I change my salary" scenario understated
// the true cost of every extra dollar of salary. These expectations are CORRECTED, not
// loosened: netBizIncome is now $4,590 lower on the $60,000 baseline salary. Derived
// rather than hardcoded so the figure follows the year's Social Security wage base.
const ctx = {
  base: {
    grossRevenue: 300000, cogs: 40000, operatingExpenses: 60000,
    officerSalary: 60000, depreciation: 10000, advertising: 5000,
    otherDeductions: 0, w2Income: 0, estPaid: 12000,
  },
  entityType: 'S Corp',
  ownerPctVal: 1,
  filing: 'single',
  taxYear: CURRENT_TAX_YEAR,
}

// Employer FICA on the baseline officer salary, from the same helper the app uses.
const EMPLOYER_FICA = calcEmployerFICA(ctx.base.officerSalary, CURRENT_TAX_YEAR)
// Net business income after the H1 correction. Was 125000.
const BASE_NET_BIZ = 125000 - EMPLOYER_FICA

function directEngine(overrides = {}) {
  const b = { ...ctx.base, ...overrides }
  // The invariant is "the simulator IS the engine", so this hand-built comparison must
  // deduct employer FICA exactly as computeSimulatorScenario now does.
  const empFICA = calcEmployerFICA(b.officerSalary, ctx.taxYear)
  const netBiz = b.grossRevenue - b.cogs - b.operatingExpenses - b.officerSalary - empFICA - b.depreciation - b.advertising - b.otherDeductions
  const k1 = Math.round(netBiz * ctx.ownerPctVal)
  return calcTaxReturn({
    taxYear: ctx.taxYear, status: ctx.filing, dependents: 0,
    k1Total: k1, rentalNet: 0, stGain: 0, ltGain: 0,
    intInc: 0, qualDiv: 0, f4797Inc: 0, taxableSS: 0,
    selfEmpHealthIns: 0, hsaDeduction: 0, studentLoanInt: 0,
    selfEmpRetirement: 0, nolCarryforward: 0, priorYearQBILoss: 0,
    saltAmount: 0, hasISO: false, isoBargainElement: 0,
    isREP: false, unrecap1250: 0, collectiblesGain: 0,
    w2Withheld: 0, estPaid: b.estPaid, ytdFactor: 1,
    useItemized: false, itemizedAmt: 0, priorPassiveLossCarryforward: 0,
    w2: b.w2Income + b.officerSalary,
    entities: [{ type: 'S Corp', k1, own: 100, officerW2: b.officerSalary }],
  })
}

describe('computeSimulatorScenario — the simulator IS the engine', () => {

  it('SPEC-invariant: baseline totalTax equals a direct engine call on the same facts', () => {
    const sim = computeSimulatorScenario(ctx, {})
    const eng = directEngine()
    expect(sim.totalTax).toBe(eng.totalTax)
    expect(sim.qbi).toBe(eng.qbi)
    expect(sim.seTax).toBe(eng.seTax)
    expect(sim.taxableInc).toBe(eng.taxableAfterQBI)
  })

  it('SPEC-invariant: a +$30,000 advertising delta equals the engine on the adjusted facts', () => {
    const sim = computeSimulatorScenario(ctx, { advertising: 30000 })
    const eng = directEngine({ advertising: ctx.base.advertising + 30000 })
    expect(sim.totalTax).toBe(eng.totalTax)
    expect(sim.netBizIncome).toBe(BASE_NET_BIZ - 30000)
  })

  it('CHAR: baseline is no longer $0 — the SIM-1 failure mode is gone', () => {
    const sim = computeSimulatorScenario(ctx, {})
    expect(sim.totalTax).toBeGreaterThan(0)
    expect(Number.isFinite(sim.k1)).toBe(true)
    expect(sim.netBizIncome).toBe(BASE_NET_BIZ)
    expect(sim.k1).toBe(BASE_NET_BIZ)
  })

  it('CHAR: a deductible-expense increase reduces total tax (savings direction)', () => {
    const base = computeSimulatorScenario(ctx, {})
    const scen = computeSimulatorScenario(ctx, { depreciation: 20000 })
    expect(scen.totalTax).toBeLessThan(base.totalTax)
  })

  it('CHAR: zero-delta scenario is exactly the baseline (no drift from packing)', () => {
    const a = computeSimulatorScenario(ctx, {})
    const b = computeSimulatorScenario(ctx, { grossRevenue: 0, advertising: 0 })
    expect(b).toEqual(a)
  })

  it('CHAR: 50% ownership halves the K-1 share before the engine runs', () => {
    const sim = computeSimulatorScenario({ ...ctx, ownerPctVal: 0.5 }, {})
    expect(sim.k1).toBe(Math.round(BASE_NET_BIZ * 0.5))
  })

  // ── AUDIT H1 ───────────────────────────────────────────────────────────────
  it('H1: employer-side FICA is deducted from S-Corp net business income', () => {
    const sim = computeSimulatorScenario(ctx, {})
    expect(sim.employerPayrollTax).toBe(EMPLOYER_FICA)
    expect(sim.employerPayrollTax).toBeGreaterThan(0)
    // 6.2% SS (under the wage base at $60K) + 1.45% Medicare = 7.65% of salary.
    expect(sim.employerPayrollTax).toBe(Math.round(ctx.base.officerSalary * 0.0765))
    expect(sim.netBizIncome).toBe(125000 - sim.employerPayrollTax)
  })

  it('H1: raising officer salary raises the payroll tax that comes out of K-1', () => {
    const base = computeSimulatorScenario(ctx, {})
    const more = computeSimulatorScenario(ctx, { officerSalary: 40000 })   // $60K -> $100K
    expect(more.employerPayrollTax).toBeGreaterThan(base.employerPayrollTax)
    expect(more.employerPayrollTax).toBe(calcEmployerFICA(100000, CURRENT_TAX_YEAR))
    // Each extra dollar of salary costs the entity the dollar AND its employer FICA.
    expect(base.netBizIncome - more.netBizIncome)
      .toBe(40000 + (more.employerPayrollTax - base.employerPayrollTax))
  })

  it('H1: the Social Security half stops at the wage base; Medicare does not', () => {
    const { ssWageBase } = { ssWageBase: 184500 }   // 2026, Rev. Proc. / SSA
    const atBase  = calcEmployerFICA(ssWageBase, 2026)
    const overBy  = calcEmployerFICA(ssWageBase + 50000, 2026)
    // Above the base only the 1.45% Medicare side keeps accruing.
    expect(overBy - atBase).toBe(Math.round(50000 * 0.0145))
  })

  it('H1: a sole proprietor has no officer salary and no employer FICA', () => {
    const sp = computeSimulatorScenario({ ...ctx, entityType: 'Sole Proprietor / SMLLC' }, {})
    expect(sp.employerPayrollTax).toBe(0)
  })

  // The pre-launch audit's Scenario B, re-run end to end. Every figure below was
  // computed BY HAND from Rev. Proc. 2025-32 and the 2026 Form 1040-ES before being
  // compared to the engine, and the engine matched to the dollar. Before H1 this same
  // scenario produced $61,134 — $1,071 too much, exactly 35% (the marginal rate) of
  // the $3,060 of employer FICA that was never deducted.
  it('H1 SPEC: audit Scenario B — S-Corp $500K receipts / $200K opex / $40K salary, single, 2026', () => {
    const sim = computeSimulatorScenario({
      base: {
        grossRevenue: 500000, cogs: 0, operatingExpenses: 200000, officerSalary: 40000,
        depreciation: 0, advertising: 0, otherDeductions: 0, w2Income: 0, estPaid: 0,
      },
      entityType: 'S Corp', ownerPctVal: 1, filing: 'single', taxYear: 2026,
    }, {})

    expect(sim.employerPayrollTax).toBe(3060)      // 7.65% of $40,000, under the wage base
    expect(sim.netBizIncome).toBe(256940)          // 500,000 - 200,000 - 40,000 - 3,060
    expect(sim.k1).toBe(256940)
    expect(sim.w2).toBe(40000)
    expect(sim.agi).toBe(296940)
    // Taxable income before QBI ($280,840) exceeds the 2026 single phase-in top
    // ($276,750), so §199A(b)(2)(B) applies in full: 50% of W-2 wages = $20,000,
    // which is less than 20% of QBI ($51,388).
    expect(sim.qbi).toBe(20000)
    expect(sim.taxableInc).toBe(260840)
    // $260,840 lands in the 35% bracket (starts $256,225): 58,448 + 35% x 4,615.
    expect(sim.fedTax).toBe(60063)
    expect(sim.totalTax).toBe(60063)               // no SE tax on S-Corp K-1
  })

  it('CHAR: display fields the modal renders are all present and finite', () => {
    const sim = computeSimulatorScenario(ctx, { officerSalary: 20000 })
    for (const f of ['rev','opex','sal','dep','adv','other','netBizIncome','k1','w2','qbi','taxableInc','fedTax','totalTax']) {
      expect(Number.isFinite(sim[f]), f).toBe(true)
    }
    expect(sim.sal).toBe(80000)
    expect(sim.w2).toBe(80000)
  })
})


describe('buildSimulatorBase — officer W-2 is not double-counted (audit re-review, Jul 2026)', () => {
  // Live-repro record: single-filer S-Corp, $400K receipts, $100K opex, $70K officer
  // salary, $0 personal W-2. The base must carry PERSONAL W-2 only (0 here);
  // computeSimulatorScenario adds the $70K officer salary itself. Before the fix the
  // component used getTotalW2(rec) = personal + officer = 70000, so wages became $140K
  // and the simulator baseline overstated tax and disagreed with Step 2.
  const rec = {
    biz: { entityType: 'S Corporation', grossRevenue: 400000, operatingExpenses: 100000, officerSalary: 70000, ownershipPct: '100', year: 2026 },
    f1040: { filingStatus: 'single', w2Income: 0 },
    entities: [{ type: 'S Corporation', own: 100, pnl: { grossRevenue: 400000, totalExpenses: 100000, officerSalary: 70000, netProfit: 230000 } }],
  }

  it('carries PERSONAL W-2 only (getTotalW2 would wrongly return 70000 here)', () => {
    const base = buildSimulatorBase(rec)
    expect(base.w2Income).toBe(0)
    expect(base.officerSalary).toBe(70000)
  })

  it('SPEC: scenario wages = personal + officer counted ONCE (70000, not 140000)', () => {
    const base = buildSimulatorBase(rec)
    const sim = computeSimulatorScenario({ base, entityType: 'S Corporation', ownerPctVal: 1, filing: 'single', taxYear: 2026 }, {})
    expect(sim.w2).toBe(70000)
  })
})


describe('simulator SE-awareness — Sole Prop totals reconcile (audit re-review #2, Jul 2026)', () => {
  // Sole proprietor: $200K receipts, $40K expenses -> $160K net SE income, single.
  // The simulator card/reconciliation now present TOTAL federal tax (income + SE), so
  // the returned figures must expose a material SE tax and a total that includes it.
  const ctx = {
    base: {
      grossRevenue: 200000, cogs: 0, operatingExpenses: 40000,
      officerSalary: 0, depreciation: 0, advertising: 0,
      otherDeductions: 0, w2Income: 0, estPaid: 0,
    },
    entityType: 'Sole Proprietor / SMLLC',
    ownerPctVal: 1, filing: 'single', taxYear: 2026,
  }
  it('SPEC: self-employment tax is material and totalTax includes it', () => {
    const sim = computeSimulatorScenario(ctx, {})
    expect(sim.seTax).toBeGreaterThan(0)
    expect(sim.totalTax).toBeGreaterThan(sim.fedTax)      // total > income-tax-only
    expect(sim.totalTax).toBe(sim.fedTax + sim.seTax)     // income + SE reconcile (no NIIT/AMT here)
  })
  it('CHAR: an S-Corp (no SE tax) keeps totalTax === fedTax', () => {
    const scorp = computeSimulatorScenario({ ...ctx, entityType: 'S Corporation',
      base: { ...ctx.base, officerSalary: 60000 } }, {})
    expect(scorp.seTax).toBe(0)
    expect(scorp.totalTax).toBe(scorp.fedTax)
  })
})
