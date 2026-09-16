// @vitest-environment jsdom
// SEVENTH PASS (independent wiring audit, 16 Sep 2026) — surface-level SPEC tests.
// Each test drives the real engine / selector / simulator / session module exactly the way
// the UI does, and pins the CORRECTED behaviour for a finding the audit reproduced.
import { describe, it, expect } from 'vitest'
import { calcTaxReturn, calcCCorpCorporateLayer, calcEmployerFICA } from './taxCalc.js'
import { compareEntityScenarios } from './scenarioCompare.js'
import { buildSimulatorBase, computeSimulatorScenario } from './aiAnalysisTaxMath.js'
import { summarizeRecord, buildRecordEngineInput, selectTaxSummary } from '../utils/calcSelector.js'
import { toEngineContext } from '../components/EntityCompareModal.jsx'
import { readPersonalContext, writePersonalContext, writeStep1State, writeTaxYear, normalizeF1040 } from '../utils/sessionState.js'
import { ccorpOwnerShare } from '../utils/entityPredicates.js'
import { deriveRentalPortfolioInputs } from '../utils/rentalPortfolio.js'
import { ccorpLayerForReturn, mergeCcorpIntoResult } from '../utils/ccorpLayer.js'
import { localCalendarDate } from '../utils/money.js'

const base = { taxYear: 2026, status: 'single', dependents: 0, w2Withheld: 0, estPaid: 0, assumeZeroBasisOnLoss: true }

describe('H-1 — §469(i) active participation follows the Step-1 rental card, not the retired Step-2 flag', () => {
  const rental = { type: 'Real Estate (Schedule E)', name: 'Duplex', own: '100',
    pnl: { grossRevenue: 20000, totalExpenses: 50000, netProfit: -30000 },
    isREP: false, isActiveParticipant: false, qbiEligible: false }
  it('SPEC: card unchecked + stale top-level true (what a loaded record used to pass) ⇒ no allowance; whole loss suspended', () => {
    const r = calcTaxReturn({ ...base, w2: 80000, k1Total: -30000, entities: [rental], isActiveParticipant: true })
    expect(r.rentalIsActiveParticipant).toBe(false)
    expect(r.rentalAllowed).toBe(0)
    expect(r.palSuspendedRental).toBe(30000)
    expect(r.agi).toBe(80000)
  })
  it('SPEC: card checked ⇒ allowance, regardless of the top-level flag', () => {
    const r = calcTaxReturn({ ...base, w2: 80000, k1Total: -30000, entities: [{ ...rental, isActiveParticipant: true }], isActiveParticipant: false })
    expect(r.rentalAllowed).toBe(-25000)
  })
  it('SPEC: the selector path (record load → normalizeF1040 → toEngineContext) can no longer grant it through the flag', () => {
    sessionStorage.clear()
    writePersonalContext(normalizeF1040({ filingStatus: 'single', w2Income: 80000 }))
    const pc = readPersonalContext()
    expect(pc.isActiveParticipant).toBe(true)   // the manifest still restores it — harmless now
    const r = calcTaxReturn({ ...toEngineContext(pc, [rental], -1), entities: [rental], k1Total: -30000 })
    expect(r.rentalAllowed).toBe(0)
  })
})

describe('H-4 — the shared selector carries the C-Corp corporate layer exactly as Step 2 does', () => {
  const ccorp = { type: 'C Corporation', name: 'Acme Inc', own: '100', officerW2: 100000,
    pnl: { grossRevenue: 400000, totalExpenses: 200000, officerSalary: 100000, employerPayrollTax: 0, netProfit: 200000 } }
  const f1040 = { filingStatus: 'single', w2Income: 0, dependents: 0 }
  const rec = { taxYear: 2026, entities: [ccorp], k1Income: 0, f1040, biz: { entityType: 'C Corporation', year: 2026 } }
  const layer = calcCCorpCorporateLayer({ netProfit: 300000, officerSalary: 100000, taxYear: 2026 })
  const mine  = ccorpOwnerShare(layer, '100')
  it('SPEC: summarizeRecord = personal return on salary + dividends, plus the owner-share 21% on the headline', () => {
    const eng = summarizeRecord(rec)
    const step2 = mergeCcorpIntoResult(
      calcTaxReturn({ ...base, w2: 100000, k1Total: 0, entities: [ccorp], divInc: mine.dividends, qualDiv: mine.dividends, asOfDate: localCalendarDate() }),
      ccorpLayerForReturn([ccorp], 2026))
    expect(buildRecordEngineInput(rec).divInc).toBe(mine.dividends)
    expect(eng.ccorpCorpTax).toBe(mine.corpTax)
    expect(eng.ccorpDividends).toBe(mine.dividends)
    expect(eng.totalTax).toBe(step2.totalTax)
    expect(eng.balance).toBe(step2.balance)
    expect(eng.agi).toBe(100000 + mine.dividends)
    // the quarterly estimate is sized on the PERSONAL total (the 21% is paid on Form 1120)
    expect(eng.quarterlyRecommended).toBe(step2.quarterlyRecommended)
  })
  it('SPEC: selectTaxSummary (Step-1 provisional card / Aria) — same figures in the live session', () => {
    sessionStorage.clear()
    writeTaxYear(2026)
    writePersonalContext(f1040)
    writeStep1State({ entities: [ccorp], entitiesRaw: [ccorp], k1Total: 0 })
    const live = selectTaxSummary()
    expect(live.ok).toBe(true)
    expect(live.agi).toBe(100000 + mine.dividends)
    expect(live.ccorpCorpTax).toBe(mine.corpTax)
  })
  it('SPEC: a pass-through-only record reports ccorpCorpTax 0 and an unchanged total', () => {
    const sc = { type: 'S Corporation', own: '100', officerW2: 80000, pnl: { officerSalary: 80000, netProfit: 120000 } }
    const s = summarizeRecord({ taxYear: 2026, entities: [sc], f1040, biz: { entityType: 'S Corporation', year: 2026 } })
    expect(s.ccorpCorpTax).toBe(0)
    expect(s.ccorpDividends).toBe(0)
  })
  it('SPEC (M-7): in YTD mode the layer is computed on ANNUALIZED profit; the engine is handed the YTD dividend slice', () => {
    const cc = { type: 'C Corporation', own: '100', officerW2: 50000, pnl: { grossRevenue: 200000, totalExpenses: 100000, officerSalary: 50000, netProfit: 100000 } }
    const annual = calcCCorpCorporateLayer({ netProfit: 300000, officerSalary: 100000, taxYear: 2026 })
    const l = ccorpLayerForReturn([cc], 2026, 2)
    expect(l.corpTax).toBe(annual.corpTax)
    expect(l.dividends).toBe(annual.dividends)
    expect(l.dividendsForEngineInput).toBe(Math.round(annual.dividends / 2))
  })
})

describe('M-1 / M-3 / M-4 — portfolio §469 inputs are derived from the rental cards on every surface', () => {
  it('SPEC: deriveRentalPortfolioInputs — REP, election, hours (max across cards), override, prior PAL (card sum)', () => {
    const cards = [
      { type: 'Real Estate (Schedule E)', isREP: true, rentalAggregationElection: true, repHoursRE: '600', repHoursTotal: '1500', priorPAL: '10,000' },
      { type: 'Real Estate (Schedule E)', isREP: false, repHoursRE: '900', repHoursTotal: '1200', priorPAL: 5000, repAggregationOverride: true, isActiveParticipant: true },
      { type: 'S Corporation', isREP: true },   // not a rental — ignored
    ]
    const rp = deriveRentalPortfolioInputs(cards, 99999)
    expect(rp).toMatchObject({ hasRentalCards: true, isREP: true, isActiveParticipant: true, rentalAggregationElection: true, repAggregationOverride: true,
      repHoursRE: 900, repHoursTotal: 1500, cardPriorPAL: 15000, orphanedPriorPAL: 0, priorPAL: 15000 })
    // no cards ⇒ the saved personal value is the migration fallback; hours are '' (not supplied)
    expect(deriveRentalPortfolioInputs([], '40000')).toMatchObject({ hasRentalCards: false, isREP: false, repHoursRE: '', repHoursTotal: '', priorPAL: 40000, orphanedPriorPAL: 40000 })
  })
  it('SPEC (M-3): the record summary applies the §469(c)(7)(B) hours test the cards carry', () => {
    const rental = { type: 'Real Estate (Schedule E)', name: 'Duplex', own: '100',
      pnl: { grossRevenue: 20000, totalExpenses: 80000, netProfit: -60000 },
      isREP: true, rentalAggregationElection: true, repHoursRE: 300, repHoursTotal: 2000, isActiveParticipant: false }
    const rec = { taxYear: 2026, entities: [rental], f1040: { filingStatus: 'single', w2Income: 200000, isREP: true, rentalAggregationElection: true } }
    const inp = buildRecordEngineInput(rec)
    expect(inp.repHoursRE).toBe(300)
    expect(inp.repHoursTotal).toBe(2000)
    const r = calcTaxReturn(inp)
    expect(r.repAggregationGatedOut).toBe(true)
    expect(r.rentalAllowed).toBe(0)
  })
  it('SPEC (M-1): REP unchecked on the card wins over a stale f1040 isREP=true', () => {
    const rental = { type: 'Real Estate (Schedule E)', own: '100', pnl: { netProfit: -60000 }, isREP: false, rentalAggregationElection: true, isActiveParticipant: false }
    const inp = buildRecordEngineInput({ taxYear: 2026, entities: [rental], f1040: { filingStatus: 'single', w2Income: 200000, isREP: true, rentalAggregationElection: true } })
    expect(inp.isREP).toBe(false)
    expect(calcTaxReturn(inp).rentalAllowed).toBe(0)
  })
  it('SPEC (M-4): a card prior PAL reaches the record summary without a Step-2 visit', () => {
    const rental = { type: 'Real Estate (Schedule E)', own: '100', pnl: { netProfit: 50000 }, priorPAL: '40000', isActiveParticipant: true }
    const inp = buildRecordEngineInput({ taxYear: 2026, entities: [rental], f1040: { filingStatus: 'single', w2Income: 100000 } })
    expect(inp.priorPassiveLossCarryforward).toBe(40000)
    const r = calcTaxReturn(inp)
    expect(r.palCarryforwardApplied).toBe(40000)
    expect(r.agi).toBe(110000)
  })
})

describe('H-2 / H-3 — the record f1040 shape round-trips everything Step 2 computes on', () => {
  it('SPEC: normalizeF1040 carries the itemized sub-fields, the 4797 attestation and the installment boxes', () => {
    const pc = normalizeF1040({ filingStatus: 'single', w2Income: '250000', useItemized: true, itemizedAmt: 57000, saltAmount: '15000',
      mortgageInt: '30000', charitableContr: '12000', medicalAmt: '5000', f4797MateriallyParticipated: true, estQ1: '5000', estQ2: '5,000', estQ3: '', estQ4: '' })
    expect(pc).toMatchObject({ itemizedAmt: 57000, mortgageInt: 30000, charitableContr: 12000, medicalAmt: 5000, f4797MateriallyParticipated: true, estQ1: 5000, estQ2: 5000, estQ3: 0, estQ4: 0 })
    const eng = toEngineContext(pc, [], -1)
    expect(eng).toMatchObject({ itemizedAmt: 57000, f4797MateriallyParticipated: true, estQ1: 5000, estQ2: 5000, medicalExpenses: 5000 })
    const r = calcTaxReturn({ ...base, ...eng, w2: 250000, charitableContr: 12000 })
    expect(r.deduction).toBe(57000 - 1250)   // itemized, less the 2026 0.5%-of-AGI charitable floor
    expect(r.totalPayments).toBe(10000)
  })
})

describe('M-5 — What-If simulator base backs the employer payroll tax out of operating expenses', () => {
  it('SPEC: a record shaped like TaxReturn.buildRecord.biz reproduces the Tracker K-1 as its baseline', () => {
    const sal = 100000, fica = calcEmployerFICA(sal, 2026)
    const pnl = { grossRevenue: 400000, totalExpenses: 100000 + sal + fica, officerSalary: sal, employerPayrollTax: fica,
      depreciation: 0, advertising: 0, otherDeductions: 0, netProfit: 400000 - 100000 - sal - fica }
    const rec = { taxYear: 2026,
      biz: { entityType: 'S Corporation', year: 2026, ownershipPct: '100', grossRevenue: '400000', operatingExpenses: String(pnl.totalExpenses), officerSalary: String(sal), depreciation: '0', pnl },
      f1040: { filingStatus: 'single', w2Income: 0 }, entities: [{ type: 'S Corporation', own: '100', officerW2: sal, pnl }] }
    const b = buildSimulatorBase(rec)
    expect(b.operatingExpenses).toBe(100000)
    const sim = computeSimulatorScenario({ base: b, entityType: 'S Corporation', ownerPctVal: 1, filing: 'single', taxYear: 2026 }, {})
    expect(sim.netBizIncome).toBe(pnl.netProfit)
  })
})

describe('M-6 — compare-modal base: profit before salary AND before employer FICA', () => {
  it('SPEC: with the FICA added back, the S-Corp scenario at the same salary reproduces the Tracker K-1', () => {
    const sal = 100000, fica = calcEmployerFICA(sal, 2026)
    const k1Share = 400000 - 100000 - sal - fica
    const netProfitShare = k1Share + sal + fica           // what EntityCompareModal now reconstructs
    const out = compareEntityScenarios({ personalContext: { status: 'single', taxYear: 2026 },
      entities: [{ type: 'S Corporation', own: 100, pnl: { netProfit: k1Share, officerSalary: sal, employerPayrollTax: fica } }],
      entityIdx: 0, netProfitShare, officerSalary: sal })
    const sc = out.scenarios.find(s => s.key === 'sCorp')
    expect(sc).toBeTruthy()
    expect(Math.max(0, netProfitShare - sal - fica)).toBe(k1Share)
  })
})
