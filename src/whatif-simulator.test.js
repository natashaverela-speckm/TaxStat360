// src/whatif-simulator.test.js
//
// SIM-1 repair (Batch 7, Jul 2026) — the What-If Simulator's scenario math.
// The core guarantee: the simulator IS the engine. Every scenario figure must
// equal a direct calcTaxReturn() call on the equivalently-built input, so the
// simulator can never again show a number the Tax Tracker would disagree with.

import { describe, it, expect } from 'vitest'
import { computeSimulatorScenario, buildSimulatorBase } from './aiAnalysisTaxMath.js'
import { calcTaxReturn } from './taxCalc.js'
import { CURRENT_TAX_YEAR } from './constants.js'

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

function directEngine(overrides = {}) {
  const b = { ...ctx.base, ...overrides }
  const netBiz = b.grossRevenue - b.cogs - b.operatingExpenses - b.officerSalary - b.depreciation - b.advertising - b.otherDeductions
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
    expect(sim.netBizIncome).toBe(125000 - 30000)
  })

  it('CHAR: baseline is no longer $0 — the SIM-1 failure mode is gone', () => {
    const sim = computeSimulatorScenario(ctx, {})
    expect(sim.totalTax).toBeGreaterThan(0)
    expect(Number.isFinite(sim.k1)).toBe(true)
    expect(sim.netBizIncome).toBe(125000)
    expect(sim.k1).toBe(125000)
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
    expect(sim.k1).toBe(Math.round(125000 * 0.5))
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
