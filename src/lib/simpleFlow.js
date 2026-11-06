// src/lib/simpleFlow.js
//
// PHASE 1 (simple flow, Nov 2026) — the pure half of the three-screen front door
// (Start → Numbers → Result). Owns NO tax math and NO storage of its own:
//   • entities are built in the exact shape CalculateTaxInner persists (so the
//     Advanced pages restore them unchanged);
//   • figures come from calcSelector (engine-true) and the lifted opportunities
//     module;
//   • every write goes through sessionState.js (ARCHITECTURE §3, CI-enforced).
//
// Feature flag: VITE_SIMPLE_FLOW. On by default; build with VITE_SIMPLE_FLOW=false
// to put the welcome tour and the old first-login path back without a code change.

import { calcEmployerFICA, sumK1FlowThrough } from './taxCalc.js'
import { CURRENT_TAX_YEAR } from './constants.js'
import { summarizeRecord } from '../utils/calcSelector.js'
import { buildOpportunities } from './opportunities.js'
import { nf } from '../utils/money.js'
import { isCCorpEntity, isRealEstateEntity, isSCorpEntity, getEntityK1Share } from '../utils/entityPredicates.js'
import {
  readPersonalContext, writePersonalContext,
  readStep1State, writeStep1State,
  readTaxYear, writeTaxYear,
  writeDirtyFlag, clearActiveRecord, clearStep1State,
  readActiveRecordId, readUserRecords, writeActiveRecord, syncRecordToServer,
} from '../utils/sessionState.js'
import { formatTimestamp } from '../utils/money.js'

export const SIMPLE_FLOW_ENABLED = (() => {
  try {
    const v = import.meta.env && import.meta.env.VITE_SIMPLE_FLOW
    return String(v ?? 'true').trim().toLowerCase() !== 'false'
  } catch {
    // import.meta.env is absent outside Vite (plain node) — treat as the default (on).
    return true
  }
})()

/** Routes the simple flow owns. RequireWelcomeTour lets these through for a
 *  first-login user instead of bouncing to the tour. */
export const SIMPLE_ROUTES = Object.freeze(['/start', '/numbers', '/result', '/review'])

/** Screen 1 tiles. `entityType` strings MUST match the Tax Tracker entity picker
 *  (same contract as Dashboard.PRESET_ENTITY_TYPE). `fields` drives Screen 2. */
export const SIMPLE_TILES = Object.freeze([
  { key: 'scorp',       icon: '🏢', label: 'I run an S-Corp',                        entityType: 'S Corporation',             name: 'My S-Corp',        fields: ['revenue', 'expenses', 'officerSalary', 'filingStatus', 'w2Other'] },
  { key: 'soleprop',    icon: '💼', label: "I'm self-employed or a single-member LLC", entityType: 'Sole Proprietor / SMLLC',   name: 'My business',      fields: ['revenue', 'expenses', 'filingStatus', 'w2Other'] },
  { key: 'rental',      icon: '🏠', label: 'I own rental property',                  entityType: 'Real Estate (Schedule E)',  name: 'My rental',        fields: ['rent', 'rentalExpenses', 'depreciation', 'filingStatus', 'w2Other'] },
  { key: 'partnership', icon: '🤝', label: "I'm a partner in an LLC",                entityType: 'Partnership / LLC',         name: 'My partnership',   fields: ['revenue', 'expenses', 'ownership', 'filingStatus', 'w2Other'] },
  { key: 'sidebiz',     icon: '🧑‍💻', label: 'I have a job and a side business',       entityType: 'Sole Proprietor / SMLLC',   name: 'My side business', fields: ['revenue', 'expenses', 'w2Required', 'filingStatus'] },
])

export function tileByKey(key) {
  return SIMPLE_TILES.find(t => t.key === key) || null
}

/** Plain-English copy for every Screen 2 field. No section symbols, no form
 *  numbers, none of the jargon words the copy rule bans. The long explanations
 *  stay behind the Advanced pages' Learn-more tooltips. */
export const FIELD_COPY = Object.freeze({
  revenue:        { label: 'What the business took in this year',                help: 'Total sales before any expenses. An estimate is fine.' },
  expenses:       { label: "What the business spent (not counting your own pay)", help: "Rent, software, contractors, supplies, employees. Don't include what you paid yourself." },
  officerSalary:  { label: 'What you paid yourself on payroll (W-2)',            help: 'Your own salary from the S-Corp. If none yet, enter 0.' },
  rent:           { label: 'Rent you collected',                                 help: 'All rent received this year.' },
  rentalExpenses: { label: 'Rental expenses',                                    help: 'Mortgage interest, taxes, insurance, repairs, management.' },
  depreciation:   { label: 'Depreciation on the property (optional)',            help: 'The yearly write-off your tax pro computed. Leave blank if you are not sure.' },
  ownership:      { label: 'Your share of the business (%)',                     help: 'If you own half, enter 50.' },
  filingStatus:   { label: 'Your filing status',                                 help: '' },
  w2Other:        { label: 'Wages from a job (W-2 from someone else)',           help: 'Leave blank if the business is your only income.' },
  w2Required:     { label: 'Your wages from your job (W-2)',                     help: 'The gross pay on your W-2 or year-to-date pay stub.' },
  w2Withheld:     { label: 'Federal tax already withheld',                       help: 'Box 2 on your W-2, or the year-to-date federal withholding on your pay stub.' },
})

export const FILING_STATUS_OPTIONS = Object.freeze([
  { value: 'single', label: 'Single' },
  { value: 'mfj',    label: 'Married filing jointly' },
  { value: 'hoh',    label: 'Head of household' },
])

/**
 * Build one entity in the shape CalculateTaxInner's manual P&L persists, so the
 * Advanced pages restore it as if it had been typed there. Officer salary and the
 * employer payroll tax on it are folded into totalExpenses exactly as the Tracker
 * does (see CalculateTaxInner: totalExpenses = ex + dep + sal + employerPayrollTax + …).
 */
export function buildEntityFromNumbers({ tile, revenue = 0, expenses = 0, officerSalary = 0, depreciation = 0, ownership = 100, taxYear = CURRENT_TAX_YEAR, id = Date.now() }) {
  const t = typeof tile === 'string' ? tileByKey(tile) : tile
  if (!t) throw new Error('simpleFlow: unknown tile')
  const rv  = Math.max(0, nf(revenue))
  const ex  = Math.max(0, nf(expenses))
  const dep = Math.max(0, nf(depreciation))
  const isSCorp = isSCorpEntity(t.entityType)
  const sal = isSCorp ? Math.max(0, nf(officerSalary)) : 0
  const employerPayrollTax = isSCorp ? calcEmployerFICA(sal, taxYear) : 0
  const totalExpenses = ex + dep + sal + employerPayrollTax
  const own = Number.isFinite(parseFloat(ownership)) ? String(parseFloat(ownership)) : '100'
  return {
    id,
    type: t.entityType,
    name: t.name,
    own,
    officerW2: sal,
    k1DirectMode: false,
    pnl: {
      grossRevenue:    rv,
      totalExpenses,
      officerSalary:   sal,
      employerPayrollTax,
      guaranteedPayments: 0,
      depreciation:    dep,
      advertising:     0,
      otherDeductions: 0,
      netProfit:       rv - totalExpenses,
      categories: {},
    },
    isManual: true,
    connectedId: null,
    box17V_wages: '', box17V_ubia: '', box11_12: '', box12_13: '', qbiLossCarryforward: '',
    box17V_sstb: false,
    stockBasis: '', debtBasis: '', distributions: '',
    // "I own rental property" is a landlord who approves tenants and sets terms,
    // which is all §469(i) active participation asks; the $25,000 allowance (and
    // its AGI phase-out) is the normal case for a small landlord, so the simple
    // tile starts there. REPS stays off until claimed on the Advanced page.
    isREP: false, isActiveParticipant: isRealEstateEntity(t.entityType),
    priorPAL: '',
    simpleFlowTile: t.key,
  }
}

/** The K-1 aggregate the analysis layer uses (mirrors AIAnalysis.getRecord's
 *  _k1NonPassive: every non-C-Corp, non-rental entity's share, net of §179). */
function k1IncomeForAnalysis(entities) {
  return (Array.isArray(entities) ? entities : []).reduce((sum, e) => {
    if (!e || isCCorpEntity(e.type) || isRealEstateEntity(e.type)) return sum
    return sum + getEntityK1Share(e) - nf(e.box11_12)
  }, 0)
}

/** Record-shaped view of a (personal context, entities, year) triple — the shape
 *  summarizeRecord() and buildOpportunities() consume. Pure. */
export function buildRecordFromInputs({ pc, entities, taxYear }) {
  const ents = Array.isArray(entities) ? entities : []
  const primary = ents.find(e => !isRealEstateEntity(e?.type) && nf(e?.pnl?.grossRevenue) > 0) || ents[0] || {}
  return {
    type: 'personal-return',
    _source: 'simple-flow',
    taxYear,
    k1Income: k1IncomeForAnalysis(ents),
    entities: ents,
    biz: {
      entityType: primary.type || 'Unknown',
      year: taxYear,
      ownershipPct: primary.own || '100',
      grossRevenue: String(nf(primary?.pnl?.grossRevenue) || 0),
      operatingExpenses: String(nf(primary?.pnl?.totalExpenses) || 0),
      officerSalary: String(nf(primary?.pnl?.officerSalary) || 0),
      depreciation: String(nf(primary?.pnl?.depreciation) || 0),
      pnl: primary.pnl || {},
    },
    f1040: { ...pc, taxYear },
  }
}

/**
 * Pure preview for Screen 2's live card: the engine summary and the card list for
 * a set of typed numbers, WITHOUT persisting anything.
 */
export function previewFromNumbers(input) {
  const taxYear = parseInt(input.taxYear) || readTaxYear() || CURRENT_TAX_YEAR
  const entity = buildEntityFromNumbers({ ...input, taxYear, id: 1 })
  const pc = {
    ...readPersonalContext(),
    filingStatus: input.filingStatus || 'single',
    w2Income: Math.max(0, nf(input.w2Other)),
    w2Withheld: Math.max(0, nf(input.w2Withheld)),
  }
  const rec = buildRecordFromInputs({ pc, entities: [entity], taxYear })
  return { summary: summarizeRecord(rec), rec }
}

/**
 * Persist Screen 2's answers as the live session, through the sanctioned writers,
 * so Screen 3, the Dashboard card, Aria and the Advanced pages all read the same
 * state. Replaces the working entity list (one entity) — the simple flow is a
 * fresh calculation, never a merge into a loaded record.
 */
export function writeSimpleFlowState(input) {
  const taxYear = parseInt(input.taxYear) || readTaxYear() || CURRENT_TAX_YEAR
  const entity = buildEntityFromNumbers({ ...input, taxYear })
  const entities = [entity]
  writeTaxYear(taxYear)
  writeStep1State({
    entities,
    entitiesRaw: entities,
    k1Total: sumK1FlowThrough(entities),
    isCoopPatron: readStep1State().isCoopPatron,
  })
  writePersonalContext({
    ...readPersonalContext(),
    taxYear,
    filingStatus: input.filingStatus || 'single',
    w2Income: Math.max(0, nf(input.w2Other)),
    w2Withheld: Math.max(0, nf(input.w2Withheld)),
  })
  clearActiveRecord()
  writeDirtyFlag(true)
  return entity
}

/** The few personal figures the Result screen edits in place (with Advanced
 *  hidden these are the only ways in). Each maps to a personal-context key the
 *  engine already reads. */
export const RESULT_FIELDS = Object.freeze([
  { key: 'estPaid',           label: "Estimated payments I've made this year",      help: 'What you have already sent the IRS for this year.' },
  { key: 'w2Withheld',        label: 'Federal tax withheld from paychecks',          help: 'From your pay stubs or W-2 so far this year.' },
  { key: 'selfEmpRetirement', label: 'Retirement contributions deducted',           help: 'SEP, SIMPLE or solo 401(k) employer contributions for this year.' },
  { key: 'hsaDeduction',      label: 'HSA contributions',                            help: 'Only if you have a high-deductible health plan.' },
])

export function writeResultField(key, value) {
  if (!RESULT_FIELDS.some(f => f.key === key)) throw new Error(`simpleFlow: unknown result field ${key}`)
  writePersonalContext({ ...readPersonalContext(), [key]: Math.max(0, nf(value)) })
  writeDirtyFlag(true)
}

/** Save the live session as a record the rest of the app (records list, AI
 *  Analysis, Aria, CPA export) reads: same shape the Advanced return saves.
 *  Upserts the active record when there is one, else creates one. */
export async function saveSimpleRecord(name) {
  const { summary, rec, taxYear } = selectSimpleResult()
  const activeId = readActiveRecordId()
  const existing = readUserRecords().find(r => activeId != null && String(r.id) === String(activeId))
  const id = existing ? existing.id : Date.now()
  const label = (name && String(name).trim()) || (existing && existing.name) || `${rec.biz?.entityType || 'Estimate'} ${taxYear}`
  const pc = rec.f1040 || {}
  const record = {
    ...rec,
    id,
    name: label,
    savedAt: formatTimestamp(new Date()),
    filingStatus: pc.filingStatus || 'single',
    dependents: nf(pc.dependents),
    w2Income: nf(pc.w2Income),
    w2Withheld: nf(pc.w2Withheld),
    estPaid: nf(pc.estPaid),
    quarterly: summary?.ok ? nf(summary.quarterlyRecommended) : 0,
    totalTax: summary?.ok ? nf(summary.totalTax) : 0,
    step2Computed: !!(summary && summary.ok),
  }
  const saved = await syncRecordToServer(record)
  writeActiveRecord(saved.id, saved.name || saved.savedAt)
  writeDirtyFlag(false)
  return saved
}

/** "Start over": drop the working figures (entities, personal context, active
 *  record) so the next scenario does not silently inherit carryforwards,
 *  withholding or deductions from a review or an earlier scenario. Keeps the
 *  session owner, sign-in and tax year. */
export function resetWorkingFigures() {
  clearStep1State()
  writePersonalContext({})   // manifest defaults
  clearActiveRecord()
  writeDirtyFlag(false)
}

/** Screen 3's inputs from the live session: engine summary + cards + the record. */
export function selectSimpleResult() {
  const taxYear = readTaxYear() || CURRENT_TAX_YEAR
  const pc = { ...readPersonalContext(), taxYear }
  const { entities } = readStep1State()
  const rec = buildRecordFromInputs({ pc, entities, taxYear })
  const summary = summarizeRecord(rec)
  const cards = markAlreadySaving(buildOpportunities(rec))
  return { summary, cards, rec, taxYear, entities }
}

/** Cards that describe a saving the structure already delivers (the S-Corp's
 *  SE-tax position versus a sole proprietorship) are not "ways to lower it".
 *  They keep their figure as `alreadySaving` and sort after the real ones. */
export const ALREADY_SAVING_TITLES = Object.freeze(['S-Corp Salary vs. Distribution Split'])
export function markAlreadySaving(cards) {
  const opportunities = (cards?.opportunities || []).map(c =>
    ALREADY_SAVING_TITLES.includes(c.title) && nf(c.saving) > 0 ? { ...c, alreadySaving: c.saving, saving: 0 } : c)
  return Object.freeze({ ...cards, opportunities: Object.freeze(opportunities) })
}

/** Sort for the result screen: dollar savings descending, unquantified cards after,
 *  original (priority) order preserved among equals. Stable. */
export function sortCardsBySaving(cards) {
  return [...(cards || [])]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const sa = nf(a.c.saving), sb = nf(b.c.saving)
      if (sa !== sb) return sb - sa
      return a.i - b.i
    })
    .map(x => x.c)
}
