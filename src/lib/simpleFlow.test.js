// @vitest-environment jsdom
// PHASE 1 (simple flow, Nov 2026): the pure half of the three-screen front door.
// Acceptance figures from the spec: S-Corp, $300,000 revenue, $100,000 opex,
// $80,000 officer salary, Single, 2026 — the Tax Tracker walkthrough produced
// $29,799. The simple flow must produce the SAME engine figure for the same inputs.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SIMPLE_TILES, tileByKey, FIELD_COPY,
  buildEntityFromNumbers, buildRecordFromInputs,
  previewFromNumbers, writeSimpleFlowState, selectSimpleResult, sortCardsBySaving,
} from './simpleFlow.js'
import { calcEmployerFICA, sumK1FlowThrough } from './taxCalc.js'
import { summarizeRecord } from '../utils/calcSelector.js'
import { readStep1State, readPersonalContext, readTaxYear, readDirtyFlag, clearAllSessionState } from '../utils/sessionState.js'

const SCORP = { tile: 'scorp', revenue: '300000', expenses: '100000', officerSalary: '80000', filingStatus: 'single', taxYear: 2026 }

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('tiles and copy', () => {
  it('every tile maps to a Tax Tracker entity-type string', () => {
    const allowed = ['S Corporation', 'Sole Proprietor / SMLLC', 'Real Estate (Schedule E)', 'Partnership / LLC']
    for (const t of SIMPLE_TILES) expect(allowed).toContain(t.entityType)
    expect(tileByKey('scorp').entityType).toBe('S Corporation')
    expect(tileByKey('nope')).toBeNull()
  })

  it('copy rule: no section symbols, form numbers, or banned jargon on Screens 1–2', () => {
    const banned = /§|Form \d|\bK-1\b|SE tax|\bQBI\b|\bUBIA\b|\bSSTB\b|\bNIIT\b|\bbasis\b|\bAGI\b/
    for (const t of SIMPLE_TILES) expect(t.label).not.toMatch(banned)
    for (const f of Object.values(FIELD_COPY)) {
      expect(f.label).not.toMatch(banned)
      expect(f.help).not.toMatch(banned)
    }
  })
})

describe('buildEntityFromNumbers — same shape the Tax Tracker persists', () => {
  it('S-Corp folds salary and employer payroll tax into totalExpenses, like CalculateTaxInner', () => {
    const e = buildEntityFromNumbers({ ...SCORP, id: 1 })
    const fica = calcEmployerFICA(80000, 2026)
    expect(e.type).toBe('S Corporation')
    expect(e.officerW2).toBe(80000)
    expect(e.pnl.officerSalary).toBe(80000)
    expect(e.pnl.employerPayrollTax).toBe(fica)
    expect(e.pnl.totalExpenses).toBe(100000 + 80000 + fica)
    expect(e.pnl.netProfit).toBe(300000 - (100000 + 80000 + fica))
    expect(e.isManual).toBe(true)
    expect(e.k1DirectMode).toBe(false)
    expect(e.isREP).toBe(false)
  })

  it('sole prop records no officer salary even if one is passed', () => {
    const e = buildEntityFromNumbers({ tile: 'soleprop', revenue: 90000, expenses: 20000, officerSalary: 50000, id: 2 })
    expect(e.pnl.officerSalary).toBe(0)
    expect(e.pnl.employerPayrollTax).toBe(0)
    expect(e.pnl.netProfit).toBe(70000)
  })

  it('rental carries depreciation and the Schedule E type; losses are allowed', () => {
    const e = buildEntityFromNumbers({ tile: 'rental', revenue: 40000, expenses: 35000, depreciation: 30000, id: 3 })
    expect(e.type).toBe('Real Estate (Schedule E)')
    expect(e.pnl.depreciation).toBe(30000)
    expect(e.pnl.netProfit).toBe(-25000)
  })

  it('partnership honours ownership %', () => {
    const e = buildEntityFromNumbers({ tile: 'partnership', revenue: 200000, expenses: 50000, ownership: 50, id: 4 })
    expect(e.own).toBe('50')
  })
})

describe('acceptance: $300K / $100K / $80K Single 2026 matches the Tax Tracker figure', () => {
  it('preview and persisted result both equal the engine, and the engine says $29,799', () => {
    const { summary: preview } = previewFromNumbers(SCORP)
    expect(preview.ok).toBe(true)
    expect(preview.totalTax).toBe(29799)

    writeSimpleFlowState(SCORP)
    const { summary, cards, entities } = selectSimpleResult()
    expect(summary.ok).toBe(true)
    expect(summary.totalTax).toBe(29799)
    expect(summary.totalTax).toBe(preview.totalTax)
    expect(entities).toHaveLength(1)
    expect(cards.hasIncome).toBe(true)
    expect(cards.opportunities.map(o => o.title)).toContain('Solo 401(k) — Higher Contribution than SEP-IRA')

    // Direct engine cross-check through the same façade the Advanced pages use.
    const rec = buildRecordFromInputs({ pc: readPersonalContext(), entities, taxYear: 2026 })
    expect(summarizeRecord(rec).totalTax).toBe(29799)
  })

  it('writes through the sanctioned session writers so Advanced restores the same state', () => {
    writeSimpleFlowState(SCORP)
    const s1 = readStep1State()
    expect(s1.entities).toHaveLength(1)
    expect(s1.k1Total).toBe(sumK1FlowThrough(s1.entities))
    expect(readTaxYear()).toBe(2026)
    expect(readPersonalContext().filingStatus).toBe('single')
    expect(readDirtyFlag()).toBe(true)
    // the Tracker's working copy is populated too
    expect(JSON.parse(sessionStorage.getItem('ts360_step1_entities'))).toHaveLength(1)
  })

  it('side-business tile: W-2 wages and withholding reach the personal context', () => {
    writeSimpleFlowState({ tile: 'sidebiz', revenue: 40000, expenses: 10000, w2Other: 120000, w2Withheld: 18000, filingStatus: 'mfj', taxYear: 2026 })
    const pc = readPersonalContext()
    expect(pc.w2Income).toBe(120000)
    expect(pc.w2Withheld).toBe(18000)
    expect(pc.filingStatus).toBe('mfj')
    const { summary } = selectSimpleResult()
    expect(summary.ok).toBe(true)
    expect(summary.totalTax).toBeGreaterThan(0)
  })

  it('a fresh session with no inputs yields an empty, non-throwing result', () => {
    clearAllSessionState()
    const r = selectSimpleResult()
    expect(r.entities).toEqual([])
    expect(r.cards.hasIncome).toBe(false)
  })
})

describe('sortCardsBySaving', () => {
  it('dollar savings descending, unquantified after, stable among equals', () => {
    const cards = [
      { title: 'a', saving: null }, { title: 'b', saving: 500 }, { title: 'c', saving: 9000 },
      { title: 'd', saving: null }, { title: 'e', saving: 500 },
    ]
    expect(sortCardsBySaving(cards).map(c => c.title)).toEqual(['c', 'b', 'e', 'a', 'd'])
  })

  it('the rental tile starts as an active participant (§469(i) allowance), never as a REP', () => {
    const e = buildEntityFromNumbers({ tile: 'rental', revenue: 42000, expenses: 30000, depreciation: 28000 })
    expect(e.isActiveParticipant).toBe(true)
    expect(e.isREP).toBe(false)
    expect(buildEntityFromNumbers({ tile: 'scorp', revenue: 1 }).isActiveParticipant).toBe(false)
  })
})

// ── Basis default (Nov 2026): a loss year in the simple flow is deducted ──────
import { summarizeRecord as _sumRec } from '../utils/calcSelector.js'
import { calcTaxReturn as _calc } from './taxCalc.js'
import { buildRecordEngineInput as _engineInput } from '../utils/calcSelector.js'
describe('simple flow assumes the owner has basis for a loss year', () => {
  const loss = { tile: 'scorp', revenue: '226484', expenses: '267844', officerSalary: '48000', filingStatus: 'single', w2Other: '0', taxYear: 2026 }
  it('S-Corp and partnership tiles carry basisCoversLoss; Schedule C and rental do not', () => {
    expect(buildEntityFromNumbers({ tile: 'scorp' }).basisCoversLoss).toBe(true)
    expect(buildEntityFromNumbers({ tile: 'partnership' }).basisCoversLoss).toBe(true)
    expect(buildEntityFromNumbers({ tile: 'soleprop' }).basisCoversLoss).toBe(false)
    expect(buildEntityFromNumbers({ tile: 'rental' }).basisCoversLoss).toBe(false)
  })
  it('the loss is deducted (nothing suspended) and the engine says the basis was assumed', () => {
    const entity = buildEntityFromNumbers(loss)
    const rec = { taxYear: 2026, f1040: { filingStatus: 'single', taxYear: 2026 }, entities: [entity] }
    const s = _sumRec(rec)
    expect(s.ok).toBe(true)
    expect(s.totalSuspendedLoss).toBe(0)
    expect(s.agi).toBeLessThan(48000)          // the K-1 loss offsets the salary
    const r = _calc(_engineInput(rec))
    expect(r.entityBasisResults[0].basisAssumedSufficient).toBe(true)
    expect(r.entityBasisResults[0].suspended).toBe(0)
  })
  it('an entered basis figure still wins over the assumption', () => {
    const entity = { ...buildEntityFromNumbers(loss), stockBasis: '10000' }
    const rec = { taxYear: 2026, f1040: { filingStatus: 'single', taxYear: 2026 }, entities: [entity] }
    const r = _calc(_engineInput(rec))
    expect(r.entityBasisResults[0].basisAssumedSufficient).toBe(false)
    expect(r.entityBasisResults[0].suspended).toBeGreaterThan(0)
    expect(r.entityBasisResults[0].k1Allowed).toBe(-10000)
  })
  it('without the attestation the conservative $0-basis default still suspends the loss', () => {
    const entity = { ...buildEntityFromNumbers(loss), basisCoversLoss: false }
    const rec = { taxYear: 2026, f1040: { filingStatus: 'single', taxYear: 2026 }, entities: [entity] }
    expect(_sumRec(rec).totalSuspendedLoss).toBeGreaterThan(0)
  })
})
