// src/lib/priorYearReview.js
//
// PHASE 2 (Prior-Year Review, Nov 2026) — the pure half of "Review last year's return".
//
//   1. TAX_1040_REVIEW_FIELDS: everything the extractor is asked to read from a
//      prior-year Form 1040 package, with the plain-English label the confirm
//      table shows and the schedule/line it comes from. One list, copied verbatim
//      into the API stub and the extract profile (three repos, one field list).
//   2. buildReviewRecord(fields, taxYear): the confirmed figures as the record
//      shape calcSelector / buildOpportunities consume — the prior year, as filed.
//   3. buildPriorYearMemo(fields, taxYear): the memo of findings, in the order
//      Natasha teaches: §6001 → §162 → §168(k) → §469 (as filed / REPS / STR) →
//      §179 → reasonable compensation → everything else the engine finds.
//
// Owns NO tax math. Every figure is produced by calcSelector (engine-true),
// scenarioCompare, or a pure helper from taxCalc / aiAnalysisTaxMath.
// Language rule (spec): this is an OPPORTUNITY ANALYSIS. It never says the
// return was wrong, never computes an amended figure, never drafts anything to
// the IRS. Findings carry an estimate, the rule they rest on, and the conditions.

import { calcReasonableCompCore, calc179Limitation, getTable, calcEmployerFICA, sumK1FlowThrough } from './taxCalc.js'
import { compareEntityScenarios } from './scenarioCompare.js'
import { buildOpportunities } from './opportunities.js'
import { summarizeRecord } from '../utils/calcSelector.js'
import { nf, fmt } from '../utils/money.js'
import { CURRENT_TAX_YEAR, SCORP_REASONABLE_COMP_RATIO_THRESHOLD } from './constants.js'

export const PRIOR_YEAR_REVIEW_ENABLED = (() => {
  try {
    const v = import.meta.env && import.meta.env.VITE_PRIOR_YEAR_REVIEW
    return String(v ?? 'false').trim().toLowerCase() === 'true'
  } catch {
    // import.meta.env is absent outside Vite — the feature stays off.
    return false
  }
})()

export const REVIEW_PROFILE = 'tax-1040-review'

/** Everything the extractor is asked for. `group` drives the confirm table's
 *  sections; `kind` is 'money' | 'int' | 'enum' | 'bool'. Keys are the contract. */
export const TAX_1040_REVIEW_FIELDS = Object.freeze([
  { key: 'taxYear',                    group: 'Return',      kind: 'int',   label: 'Tax year of the return',                      source: 'Form 1040, top' },
  { key: 'filingStatus',               group: 'Return',      kind: 'enum',  label: 'Filing status',                              source: 'Form 1040, filing status box', options: ['single', 'mfj', 'mfs', 'hoh', 'qss'] },
  { key: 'dependents',                 group: 'Return',      kind: 'int',   label: 'Children under 17 claimed',                  source: 'Form 1040, Dependents' },
  { key: 'w2Wages',                    group: 'Income',      kind: 'money', label: 'Wages from W-2s',                             source: 'Form 1040 line 1a' },
  { key: 'w2Withheld',                 group: 'Income',      kind: 'money', label: 'Federal tax withheld',                       source: 'Form 1040 line 25a' },
  { key: 'officerW2',                  group: 'Income',      kind: 'money', label: 'Of those wages, salary from your own S-Corp', source: 'W-2 from the S-Corp' },
  { key: 'schedCGross',                group: 'Business',    kind: 'money', label: 'Self-employment income (gross)',             source: 'Schedule C line 1' },
  { key: 'schedCNet',                  group: 'Business',    kind: 'money', label: 'Self-employment profit (net)',               source: 'Schedule C line 31' },
  { key: 'k1ScorpOrdinary',            group: 'Business',    kind: 'money', label: 'S-Corp income (K-1)',                        source: 'Schedule K-1 (1120-S) box 1' },
  { key: 'k1PartnershipOrdinary',      group: 'Business',    kind: 'money', label: 'Partnership income (K-1)',                   source: 'Schedule K-1 (1065) box 1' },
  { key: 'schedEPropertyCount',        group: 'Rentals',     kind: 'int',   label: 'Number of rental properties',                source: 'Schedule E Part I' },
  { key: 'schedERent',                 group: 'Rentals',     kind: 'money', label: 'Rent received',                              source: 'Schedule E line 3' },
  { key: 'schedEExpenses',             group: 'Rentals',     kind: 'money', label: 'Rental expenses (not counting depreciation)', source: 'Schedule E lines 5–17' },
  { key: 'schedEDepreciation',         group: 'Rentals',     kind: 'money', label: 'Rental depreciation',                        source: 'Schedule E line 18' },
  { key: 'rentalBuildingBasis',        group: 'Rentals',     kind: 'money', label: 'Building cost basis (optional, all rentals)', source: 'Form 4562 / depreciation schedule' },
  { key: 'shortTermRental',            group: 'Rentals',     kind: 'bool',  label: 'Any rental with average stays of 7 days or less', source: 'Your records' },
  { key: 'depreciationTotal',          group: 'Deductions',  kind: 'money', label: 'Total depreciation claimed',                 source: 'Form 4562 line 22' },
  { key: 'sec179',                     group: 'Deductions',  kind: 'money', label: 'Equipment expensed in full',                 source: 'Form 4562 line 12' },
  { key: 'qbiDeduction',               group: 'Deductions',  kind: 'money', label: 'Business income deduction',                  source: 'Form 1040 line 13 (Form 8995)' },
  { key: 'selfEmpRetirement',          group: 'Deductions',  kind: 'money', label: 'Retirement contributions deducted',          source: 'Schedule 1 line 16' },
  { key: 'hsaDeduction',               group: 'Deductions',  kind: 'money', label: 'HSA contributions deducted',                 source: 'Schedule 1 line 13' },
  { key: 'selfEmpHealthIns',           group: 'Deductions',  kind: 'money', label: 'Self-employed health insurance deducted',    source: 'Schedule 1 line 17' },
  { key: 'homeOfficeClaimed',          group: 'Deductions',  kind: 'bool',  label: 'Home office claimed',                        source: 'Form 8829 or Schedule C line 30' },
  { key: 'agi',                        group: 'Totals',      kind: 'money', label: 'Adjusted gross income',                      source: 'Form 1040 line 11' },
  { key: 'totalTax',                   group: 'Totals',      kind: 'money', label: 'Total tax',                                  source: 'Form 1040 line 24' },
  { key: 'estimatedPaymentsMade',      group: 'Totals',      kind: 'money', label: 'Estimated payments made',                    source: 'Form 1040 line 26' },
  { key: 'underpaymentPenalty',        group: 'Totals',      kind: 'money', label: 'Underpayment penalty',                       source: 'Form 1040 line 38 (Form 2210)' },
  { key: 'priorPassiveLossCarryforward', group: 'Carryforwards', kind: 'money', label: 'Rental losses carried forward (suspended)', source: 'Form 8582' },
  { key: 'capLossCarryforwardST',      group: 'Carryforwards', kind: 'money', label: 'Short-term capital loss carried forward', source: 'Schedule D' },
  { key: 'capLossCarryforwardLT',      group: 'Carryforwards', kind: 'money', label: 'Long-term capital loss carried forward',  source: 'Schedule D' },
  { key: 'nolCarryforward',            group: 'Carryforwards', kind: 'money', label: 'Net operating loss carried forward',      source: 'Form 1040 Schedule 1 / NOL statement' },
  { key: 'priorYearQBILoss',           group: 'Carryforwards', kind: 'money', label: 'Business-income-deduction loss carried forward', source: 'Form 8995 line 3' },
])

export const TAX_1040_REVIEW_FIELD_KEYS = Object.freeze(TAX_1040_REVIEW_FIELDS.map(f => f.key))

/** Coerce an extract payload (strings, nulls, confidence map) into typed fields. */
export function normalizeReviewFields(raw = {}) {
  const out = {}
  for (const f of TAX_1040_REVIEW_FIELDS) {
    const v = raw[f.key]
    if (f.kind === 'money') out[f.key] = v == null || v === '' ? 0 : nf(v)
    else if (f.kind === 'int') out[f.key] = v == null || v === '' ? 0 : Math.max(0, parseInt(v, 10) || 0)
    else if (f.kind === 'bool') out[f.key] = v === true || v === 'true' || v === 1
    else if (f.kind === 'enum') out[f.key] = f.options.includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : f.options[0]
  }
  if (!out.taxYear) out.taxYear = CURRENT_TAX_YEAR - 1
  return out
}

// ── Entity returns (PHASE 2b) ───────────────────────────────────────────────
// An S-Corp or partnership owner's strategy lives on the 1120-S / 1065, not the
// 1040: officer pay against distributions, what the entity already deducts, and
// what Form 4562 shows was placed in service. Keys mirror app/tax_extract.py
// SCORP_FIELDS / PARTNERSHIP_FIELDS on the API (two repos, one list each).

export const ENTITY_RETURN_KINDS = Object.freeze({
  '1120s': { profile: 'tax-1120s-review', label: 'S-Corp return (1120-S)', short: '1120-S' },
  '1065':  { profile: 'tax-1065-review',  label: 'Partnership return (1065)', short: '1065' },
})

export const ENTITY_RETURN_FIELDS = Object.freeze({
  '1120s': Object.freeze([
    { key: 'taxYear',                 group: 'Return',         kind: 'int',   label: 'Tax year of the return',                         source: 'Form 1120-S, top' },
    { key: 'shareholderCount',        group: 'Return',         kind: 'int',   label: 'Number of shareholders',                         source: 'Form 1120-S item I' },
    { key: 'grossReceipts',           group: 'Income',         kind: 'money', label: 'Gross receipts',                                 source: 'Form 1120-S line 1a' },
    { key: 'totalIncome',             group: 'Income',         kind: 'money', label: 'Total income',                                   source: 'Form 1120-S line 6' },
    { key: 'officerCompensation',     group: 'Pay',            kind: 'money', label: 'Officer salary (W-2 from the company)',          source: 'Form 1120-S line 7 (Form 1125-E)' },
    { key: 'salariesWages',           group: 'Pay',            kind: 'money', label: 'Other employee wages',                           source: 'Form 1120-S line 8' },
    { key: 'shareholderHealthIns',    group: 'Pay',            kind: 'money', label: 'Owner health insurance paid by the company',     source: 'K-1 box 17 code AD / statement' },
    { key: 'pensionProfitSharing',    group: 'Pay',            kind: 'money', label: 'Retirement plan contributions by the company',   source: 'Form 1120-S line 17' },
    { key: 'employeeBenefits',        group: 'Pay',            kind: 'money', label: 'Employee benefit programs',                      source: 'Form 1120-S line 18' },
    { key: 'distributions',           group: 'Pay',            kind: 'money', label: 'Distributions to shareholders',                  source: 'Schedule K line 16d' },
    { key: 'rentsPaid',               group: 'Deductions',     kind: 'money', label: 'Rent paid',                                      source: 'Form 1120-S line 11' },
    { key: 'taxesAndLicenses',        group: 'Deductions',     kind: 'money', label: 'Taxes and licenses',                             source: 'Form 1120-S line 12' },
    { key: 'depreciation',            group: 'Deductions',     kind: 'money', label: 'Depreciation',                                   source: 'Form 1120-S line 14' },
    { key: 'sec179',                  group: 'Deductions',     kind: 'money', label: 'Equipment expensed in full',                     source: 'Schedule K line 11' },
    { key: 'bonusDepreciation',       group: 'Deductions',     kind: 'money', label: 'Bonus depreciation',                             source: 'Form 4562 line 14' },
    { key: 'vehicleOrTravel',         group: 'Deductions',     kind: 'money', label: 'Vehicle, travel and meals',                      source: 'Other-deductions statement' },
    { key: 'homeOfficeOrAccountablePlan', group: 'Deductions', kind: 'bool',  label: 'Accountable-plan or home-office reimbursement shown', source: 'Other-deductions statement' },
    { key: 'otherDeductions',         group: 'Deductions',     kind: 'money', label: 'Other deductions',                               source: 'Form 1120-S line 19' },
    { key: 'totalDeductions',         group: 'Deductions',     kind: 'money', label: 'Total deductions',                               source: 'Form 1120-S line 20' },
    { key: 'ordinaryBusinessIncome',  group: 'Result',         kind: 'money', label: 'Ordinary business income',                       source: 'Form 1120-S line 21' },
    { key: 'loansToShareholders',     group: 'Balance sheet',  kind: 'money', label: 'Loans to shareholders (year end)',               source: 'Schedule L line 7' },
    { key: 'loansFromShareholders',   group: 'Balance sheet',  kind: 'money', label: 'Loans from shareholders (year end)',             source: 'Schedule L line 19' },
    { key: 'totalAssets',             group: 'Balance sheet',  kind: 'money', label: 'Total assets (year end)',                        source: 'Schedule L line 15' },
  ]),
  '1065': Object.freeze([
    { key: 'taxYear',                 group: 'Return',         kind: 'int',   label: 'Tax year of the return',                         source: 'Form 1065, top' },
    { key: 'partnerCount',            group: 'Return',         kind: 'int',   label: 'Number of partners',                             source: 'Form 1065 item I' },
    { key: 'grossReceipts',           group: 'Income',         kind: 'money', label: 'Gross receipts',                                 source: 'Form 1065 line 1a' },
    { key: 'totalIncome',             group: 'Income',         kind: 'money', label: 'Total income',                                   source: 'Form 1065 line 8' },
    { key: 'netRentalRealEstate',     group: 'Income',         kind: 'money', label: 'Net rental real estate income',                  source: 'Schedule K line 2 (Form 8825)' },
    { key: 'guaranteedPayments',      group: 'Pay',            kind: 'money', label: 'Guaranteed payments to partners',                source: 'Form 1065 line 10' },
    { key: 'salariesWages',           group: 'Pay',            kind: 'money', label: 'Employee wages (not partners)',                  source: 'Form 1065 line 9' },
    { key: 'retirementPlans',         group: 'Pay',            kind: 'money', label: 'Retirement plan contributions by the partnership', source: 'Form 1065 line 18' },
    { key: 'employeeBenefits',        group: 'Pay',            kind: 'money', label: 'Employee benefit programs',                      source: 'Form 1065 line 19' },
    { key: 'distributions',           group: 'Pay',            kind: 'money', label: 'Distributions to partners',                      source: 'Schedule K line 19a' },
    { key: 'selfEmploymentEarnings',  group: 'Pay',            kind: 'money', label: 'Self-employment earnings (all partners)',        source: 'Schedule K line 14a' },
    { key: 'rentsPaid',               group: 'Deductions',     kind: 'money', label: 'Rent paid',                                      source: 'Form 1065 line 13' },
    { key: 'taxesAndLicenses',        group: 'Deductions',     kind: 'money', label: 'Taxes and licenses',                             source: 'Form 1065 line 14' },
    { key: 'depreciation',            group: 'Deductions',     kind: 'money', label: 'Depreciation',                                   source: 'Form 1065 line 16c' },
    { key: 'sec179',                  group: 'Deductions',     kind: 'money', label: 'Equipment expensed in full',                     source: 'Schedule K line 12' },
    { key: 'bonusDepreciation',       group: 'Deductions',     kind: 'money', label: 'Bonus depreciation',                             source: 'Form 4562 line 14' },
    { key: 'vehicleOrTravel',         group: 'Deductions',     kind: 'money', label: 'Vehicle, travel and meals',                      source: 'Other-deductions statement' },
    { key: 'otherDeductions',         group: 'Deductions',     kind: 'money', label: 'Other deductions',                               source: 'Form 1065 line 20' },
    { key: 'totalDeductions',         group: 'Deductions',     kind: 'money', label: 'Total deductions',                               source: 'Form 1065 line 21' },
    { key: 'ordinaryBusinessIncome',  group: 'Result',         kind: 'money', label: 'Ordinary business income',                       source: 'Form 1065 line 22' },
    { key: 'totalAssets',             group: 'Balance sheet',  kind: 'money', label: 'Total assets (year end)',                        source: 'Schedule L line 14' },
  ]),
})

/** Coerce an entity-return extract payload into typed fields. */
export function normalizeEntityFields(kind, raw = {}) {
  const defs = ENTITY_RETURN_FIELDS[kind]
  if (!defs) throw new Error(`Unknown entity return kind: ${kind}`)
  const out = {}
  for (const f of defs) {
    const v = raw[f.key]
    if (f.kind === 'money') out[f.key] = v == null || v === '' ? 0 : nf(v)
    else if (f.kind === 'int') out[f.key] = v == null || v === '' ? 0 : Math.max(0, parseInt(v, 10) || 0)
    else if (f.kind === 'bool') out[f.key] = v === true || v === 'true' || v === 1
  }
  return out
}

/**
 * Which federal return a text layer is. Reads the form title on page 1, which is
 * the one string every preparer's software prints verbatim; a 1040 package also
 * contains "Schedule K-1 (Form 1120-S)", so form numbers alone are not enough.
 * Falls back to whichever form name appears first.
 * @returns {'1040'|'1120s'|'1065'|null}
 */
export function detectReturnType(text) {
  const t = String(text || '')
  if (/Income\s+Tax\s+Return\s+for\s+an\s+S\s+Corporation/i.test(t)) return '1120s'
  if (/Return\s+of\s+Partnership\s+Income/i.test(t)) return '1065'
  if (/Individual\s+Income\s+Tax\s+Return/i.test(t)) return '1040'
  const first = [
    ['1120s', t.search(/Form\s*1120-?S\b/i)],
    ['1065', t.search(/Form\s*1065\b/i)],
    ['1040', t.search(/Form\s*1040\b/i)],
  ].filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1])
  return first.length ? first[0][0] : null
}

/** Fill 1040 figures the extractor usually cannot tell apart (which W-2 is the
 *  S-Corp's; the K-1 share) from the entity return when the 1040 left them blank. */
export function mergeEntityReturns(f, entityReturns = []) {
  const out = { ...f }
  const scorp = (entityReturns || []).find(r => r && r.kind === '1120s')
  const pship = (entityReturns || []).find(r => r && r.kind === '1065')
  if (scorp) {
    const e = scorp.fields || {}
    const share = 1 / Math.max(1, nf(e.shareholderCount) || 1)
    if (!nf(out.officerW2) && nf(e.officerCompensation) > 0) out.officerW2 = Math.round(nf(e.officerCompensation) * share)
    if (!nf(out.k1ScorpOrdinary) && nf(e.ordinaryBusinessIncome) !== 0) out.k1ScorpOrdinary = Math.round(nf(e.ordinaryBusinessIncome) * share)
    if (nf(out.officerW2) > nf(out.w2Wages)) out.w2Wages = nf(out.officerW2)
  }
  if (pship) {
    const e = pship.fields || {}
    const share = 1 / Math.max(1, nf(e.partnerCount) || 1)
    if (!nf(out.k1PartnershipOrdinary) && nf(e.ordinaryBusinessIncome) !== 0) out.k1PartnershipOrdinary = Math.round(nf(e.ordinaryBusinessIncome) * share)
  }
  return out
}

// ── Record builder ──────────────────────────────────────────────────────────

function entity(type, name, extra = {}) {
  return {
    id: name, type, name, own: '100', isManual: true, connectedId: null, k1DirectMode: false,
    pnl: { grossRevenue: 0, totalExpenses: 0, officerSalary: 0, employerPayrollTax: 0, guaranteedPayments: 0, depreciation: 0, advertising: 0, otherDeductions: 0, netProfit: 0, categories: {} },
    box17V_wages: '', box17V_ubia: '', box11_12: '', box12_13: '', qbiLossCarryforward: '', box17V_sstb: false,
    stockBasis: '', debtBasis: '', distributions: '', isREP: false, isActiveParticipant: false, priorPAL: '',
    ...extra,
  }
}

/** The confirmed figures as engine entities. `rental` controls the §469 position
 *  the rental is modelled under: 'filed' (passive), 'reps', or 'str'. */
export function buildReviewEntities(f, rental = 'filed') {
  const ents = []
  const taxYear = f.taxYear
  if (f.k1ScorpOrdinary || f.officerW2) {
    const sal = Math.max(0, nf(f.officerW2))
    const fica = sal ? calcEmployerFICA(sal, taxYear) : 0
    ents.push(entity('S Corporation', 'Your S-Corp', {
      officerW2: sal,
      k1DirectMode: true,
      pnl: { grossRevenue: 0, totalExpenses: 0, officerSalary: sal, employerPayrollTax: fica, depreciation: 0, advertising: 0, otherDeductions: 0, netProfit: nf(f.k1ScorpOrdinary), categories: {} },
    }))
  }
  if (f.k1PartnershipOrdinary) {
    ents.push(entity('Partnership / LLC', 'Your partnership', {
      k1DirectMode: true,
      pnl: { grossRevenue: 0, totalExpenses: 0, officerSalary: 0, employerPayrollTax: 0, depreciation: 0, advertising: 0, otherDeductions: 0, netProfit: nf(f.k1PartnershipOrdinary), categories: {} },
    }))
  }
  if (f.schedCGross || f.schedCNet) {
    const gross = Math.max(0, nf(f.schedCGross)), net = nf(f.schedCNet)
    ents.push(entity('Sole Proprietor / SMLLC', 'Your business', {
      pnl: { grossRevenue: gross, totalExpenses: Math.max(0, gross - net), officerSalary: 0, employerPayrollTax: 0, depreciation: 0, advertising: 0, otherDeductions: 0, netProfit: net, categories: {} },
    }))
  }
  if (f.schedERent || f.schedEExpenses || f.schedEDepreciation) {
    const rent = Math.max(0, nf(f.schedERent)), ex = Math.max(0, nf(f.schedEExpenses)), dep = Math.max(0, nf(f.schedEDepreciation))
    const nonpassive = rental === 'reps' || rental === 'str'
    ents.push(entity('Real Estate (Schedule E)', 'Your rentals', {
      pnl: { grossRevenue: rent, totalExpenses: ex + dep, officerSalary: 0, employerPayrollTax: 0, depreciation: dep, advertising: 0, otherDeductions: 0, netProfit: rent - ex - dep, categories: {} },
      priorPAL: nf(f.priorPassiveLossCarryforward) || '',
      // Engine position. 'reps': REPS with the §1.469-9(g) grouping election. 'str':
      // the STR exception reaches nonpassive treatment through §1.469-1T(e)(3) by
      // material participation in the property itself; the engine has no separate
      // STR switch, so it is modelled as per-property material participation
      // without the grouping election.
      isREP: nonpassive,
      materiallyParticipates: nonpassive ? true : undefined,
      rentalAggregationElection: rental === 'reps',
    }))
  }
  return ents
}

export function buildReviewRecord(f, rental = 'filed') {
  const taxYear = f.taxYear
  const entities = buildReviewEntities(f, rental)
  const primary = entities.find(e => e.type !== 'Real Estate (Schedule E)') || entities[0] || {}
  const pc = {
    filingStatus: f.filingStatus || 'single',
    taxYear,
    dependents: nf(f.dependents),
    w2Income: Math.max(0, nf(f.w2Wages) - nf(f.officerW2)),   // the S-Corp salary flows from the entity
    w2Withheld: nf(f.w2Withheld),
    estPaid: nf(f.estimatedPaymentsMade),
    selfEmpRetirement: nf(f.selfEmpRetirement),
    hsaDeduction: nf(f.hsaDeduction),
    selfEmpHealthIns: nf(f.selfEmpHealthIns),
    capLossCarryforwardST: nf(f.capLossCarryforwardST),
    capLossCarryforwardLT: nf(f.capLossCarryforwardLT),
    nolCarryforward: nf(f.nolCarryforward),
    priorYearQBILoss: nf(f.priorYearQBILoss),
    isREP: rental === 'reps' || rental === 'str',
  }
  return {
    type: 'personal-return', _source: 'prior-year-review', taxYear,
    k1Income: sumK1FlowThrough(entities.filter(e => e.type !== 'Real Estate (Schedule E)')),
    entities,
    biz: { entityType: primary.type || 'Unknown', year: taxYear, ownershipPct: '100', officerSalary: String(nf(f.officerW2)), grossRevenue: String(nf(primary?.pnl?.grossRevenue) || 0), depreciation: String(nf(f.depreciationTotal)), pnl: primary.pnl || {} },
    f1040: pc,
  }
}

// ── Memo ────────────────────────────────────────────────────────────────────

const SECTIONS = Object.freeze([
  { id: 'records',  title: 'Books and records',                    rule: 'IRC §6001' },
  { id: 'ordinary', title: 'Ordinary and necessary business expenses', rule: 'IRC §162' },
  { id: 'bonus',    title: 'Bonus depreciation on rental property', rule: 'IRC §168(k)' },
  { id: 'passive',  title: 'Passive activity rules, REPS and the short-term rental exception', rule: 'IRC §469' },
  { id: 'sec179',   title: 'Expensing equipment',                   rule: 'IRC §179' },
  { id: 'comp',     title: 'Reasonable compensation',               rule: 'Rev. Rul. 74-44; Treas. Reg. §1.162-7' },
  { id: 'more',     title: 'Everything else the engine found',      rule: '' },
])

function finding(section, code, title, { impact = null, basis = '', conditions = '', detail = '', exposure = false, link = null } = {}) {
  return Object.freeze({ section, code, title, impact, basis, conditions, detail, exposure, link })
}

const REPS_LINK = 'https://repsrecord.com'

/**
 * @returns frozen { taxYear, asFiled: summary, scenarios: {filed, reps, str}, sections: [{...SECTION, findings: []}], questions: [] }
 */
export function buildPriorYearMemo(fieldsIn, { entityReturns = [] } = {}) {
  const f = mergeEntityReturns(normalizeReviewFields(fieldsIn), entityReturns)
  const taxYear = f.taxYear
  const scorpRet = (entityReturns || []).find(r => r && r.kind === '1120s')
  const pshipRet = (entityReturns || []).find(r => r && r.kind === '1065')
  const S = scorpRet ? normalizeEntityFields('1120s', scorpRet.fields || {}) : null
  const P = pshipRet ? normalizeEntityFields('1065', pshipRet.fields || {}) : null
  const rec = buildReviewRecord(f, 'filed')
  const asFiled = summarizeRecord(rec)
  const marginal = asFiled.ok ? asFiled.marginalRate : 0.24
  const hasRental = nf(f.schedERent) > 0 || nf(f.schedEExpenses) > 0 || nf(f.schedEDepreciation) > 0
  const rentalNet = nf(f.schedERent) - nf(f.schedEExpenses) - nf(f.schedEDepreciation)
  const hasScorp = nf(f.k1ScorpOrdinary) > 0 || nf(f.officerW2) > 0
  const hasSchedC = nf(f.schedCNet) !== 0 || nf(f.schedCGross) > 0
  const hasPship = nf(f.k1PartnershipOrdinary) !== 0
  const hasBusiness = hasScorp || hasSchedC || hasPship
  const F = {}
  for (const s of SECTIONS) F[s.id] = []

  // 1. §6001 — what has to be on file for what the return claims. Listed as exposure, not savings.
  if (hasRental) {
    F.records.push(finding('records', 'hours-log', 'Contemporaneous hour log for the rentals', {
      exposure: true,
      basis: 'IRC §6001; Temp. Reg. §1.469-5T(f)(4); Moss v. Commissioner, 135 T.C. 365 (2010)',
      conditions: 'Applies if any rental loss was treated as nonpassive, or will be in a later year.',
      detail: `The return reports ${fmt(Math.abs(rentalNet))} of net rental ${rentalNet < 0 ? 'loss' : 'income'}. A loss offsets other income only with records showing the hours behind it, kept as the year goes, not reconstructed in April. Logs built after the fact routinely fail on examination.`,
      link: REPS_LINK,
    }))
  }
  if (f.homeOfficeClaimed) {
    F.records.push(finding('records', 'home-office-records', 'Home office: square footage and exclusive-use evidence', {
      exposure: true, basis: 'IRC §280A(c)(1); IRC §6001',
      conditions: 'The space must be used regularly and exclusively for the business.',
      detail: 'Keep a floor plan with measurements, photos of the space, and the expense bills the percentage was applied to.',
    }))
  }
  if (nf(f.depreciationTotal) > 0 || nf(f.sec179) > 0) {
    F.records.push(finding('records', 'asset-records', 'Purchase records for every depreciated or expensed asset', {
      exposure: true, basis: 'IRC §6001; Treas. Reg. §1.6001-1',
      conditions: 'Each asset needs the invoice, the date placed in service, and the business-use percentage.',
      detail: `The return claims ${fmt(nf(f.depreciationTotal) + nf(f.sec179))} of depreciation and expensing. The depreciation schedule (Form 4562 detail) is what an examiner asks for first.`,
    }))
  }
  if (S && nf(S.loansToShareholders) > 0) {
    F.records.push(finding('records', 'shareholder-loan', 'Loan to shareholder needs a note, interest and repayments', {
      exposure: true, basis: 'IRC §7872; IRC §1368; Treas. Reg. §1.1368-1; IRC §6001',
      conditions: 'A written note, a stated rate at or above the applicable federal rate, a repayment schedule that is actually followed, and board minutes.',
      detail: `The 1120-S balance sheet shows ${fmt(nf(S.loansToShareholders))} owed by a shareholder to the company. Without the paperwork an examiner treats it as a distribution, taxable to the extent it exceeds stock basis.`,
    }))
  }
  if (S && nf(S.distributions) > Math.max(0, nf(S.ordinaryBusinessIncome))) {
    F.records.push(finding('records', 'basis-schedule', 'Stock-basis schedule: distributions exceeded this year’s income', {
      exposure: true, basis: 'IRC §1368(b); IRC §1367; Form 7203',
      conditions: 'Distributions are tax-free only up to stock basis; the excess is capital gain. Form 7203 is required when distributions are received.',
      detail: `Distributions of ${fmt(nf(S.distributions))} against ${fmt(nf(S.ordinaryBusinessIncome))} of ordinary income. Whether the ${fmt(nf(S.distributions) - Math.max(0, nf(S.ordinaryBusinessIncome)))} excess is tax-free depends on accumulated basis from earlier years, which the basis schedule has to show.`,
    }))
  }
  if (hasBusiness) {
    F.records.push(finding('records', 'books', 'A general ledger that ties to the return', {
      exposure: true, basis: 'IRC §6001; Treas. Reg. §1.6001-1(a)',
      conditions: 'Every Schedule C, K-1 and E figure should trace to a ledger and bank statements.',
      detail: 'Connecting QuickBooks, Xero, Wave or FreshBooks to TaxStat360 keeps this year’s figures tied to the books automatically.',
    }))
  }

  // 2. §162 — the ordinary-and-necessary strategies Natasha teaches, led by family payroll.
  if (hasBusiness) {
    const childFicaExempt = (hasSchedC || hasPship) && !hasScorp
    F.ordinary.push(finding('ordinary', 'hire-children', 'Hire your children for real work at a reasonable wage', {
      basis: 'IRC §162(a); IRC §3121(b)(3)(A); IRC §63(c) (standard deduction)',
      conditions: childFicaExempt
        ? 'Bona fide work, a written job description, timesheets, pay by check or payroll, and compliance with federal and state child-labor rules. Wages paid by a parent’s sole proprietorship or parent-only partnership to a child under 18 are exempt from FICA.'
        : 'Bona fide work, a written job description, timesheets, payroll with a W-2, and compliance with federal and state child-labor rules. Wages paid by an S-Corp or C-Corp to a child are fully subject to FICA; the exemption applies only to a parent’s sole proprietorship or parent-only partnership.',
      detail: `Wages up to the standard deduction (${fmt(getTable(taxYear)?.std?.single || 0)} for ${taxYear}) are deductible to the business and taxed at the child’s rate, usually zero. At your ${Math.round(marginal * 100)}% marginal rate, each child paid that amount shifts roughly ${fmt(Math.round((getTable(taxYear)?.std?.single || 0) * marginal))} of tax.`,
      impact: Math.round((getTable(taxYear)?.std?.single || 0) * marginal),
    }))
    if (!f.homeOfficeClaimed) {
      F.ordinary.push(finding('ordinary', 'home-office', 'Home office deduction not taken', {
        basis: hasScorp ? 'IRC §280A(c); IRC §62(a)(2)(A); Treas. Reg. §1.62-2 (accountable plan)' : 'IRC §280A(c); Form 8829',
        conditions: 'A space used regularly and exclusively for the business.',
        detail: hasScorp
          ? 'For an S-Corp the correct route is an accountable-plan reimbursement from the company for the business-use share of home costs; it is deductible to the S-Corp and not income to you.'
          : 'Claim on Form 8829 (actual costs) or the simplified method ($5 per square foot, up to 300 square feet).',
      }))
    }
    if (hasScorp) {
      F.ordinary.push(finding('ordinary', 'augusta', 'Rent your home to your S-Corp for up to 14 days', {
        basis: 'IRC §280A(g)',
        conditions: 'Real business meetings held at the home, fair-market rent supported by comparables, a written agreement, and minutes.',
        detail: S && nf(S.rentsPaid) > 0
          ? `The 1120-S already deducts ${fmt(nf(S.rentsPaid))} of rent. Up to 14 days of rent for meetings at your home can be added, deductible to the S-Corp and excluded from your income.`
          : 'The rent is deductible to the S-Corp and excluded from your income for up to 14 days a year.',
      }))
    }
    // What the entity return itself shows is, or is not, being deducted.
    const E = S || P
    if (E) {
      const which = S ? '1120-S' : '1065'
      const retire = S ? nf(S.pensionProfitSharing) : nf(P.retirementPlans)
      const ownerPay = S ? nf(S.officerCompensation) : nf(P.guaranteedPayments)
      if (retire <= 0 && ownerPay > 0) {
        const employer = Math.min(Math.round(ownerPay * 0.25), 70000)
        F.ordinary.push(finding('ordinary', 'entity-retirement', `No retirement plan deducted on the ${which}`, {
          impact: Math.round(employer * marginal),
          basis: 'IRC §404(a)(3); IRC §401(k); IRC §408(k) (SEP); IRC §415(c)',
          conditions: S
            ? 'Employer contributions are limited to 25% of W-2 compensation; a Solo 401(k) adds the employee deferral on top. A plan that covers employees has to cover them on the same terms.'
            : 'For a partner the employer contribution is computed on net self-employment earnings; the plan is adopted at the partnership level.',
          detail: `The ${which} shows ${fmt(ownerPay)} of ${S ? 'officer salary' : 'guaranteed payments'} and no retirement-plan line. An employer contribution of up to ${fmt(employer)} would be deductible to the company, worth about ${fmt(Math.round(employer * marginal))} at your marginal rate.`,
        }))
      }
      if (S && nf(S.shareholderHealthIns) <= 0 && nf(S.officerCompensation) > 0 && nf(f.selfEmpHealthIns) <= 0) {
        F.ordinary.push(finding('ordinary', 'scorp-health', 'Health insurance is not being run through the S-Corp', {
          basis: 'IRC §162(l); IRS Notice 2008-1; IRC §1372',
          conditions: 'The policy is in the company’s name or reimbursed by it, the premium is added to the owner’s W-2 box 1 (not FICA wages), and the owner deducts it above the line.',
          detail: 'Neither the 1120-S nor the 1040 shows the more-than-2% shareholder health-insurance route. Premiums paid personally and deducted only on Schedule A are usually lost to the 7.5% floor.',
        }))
      }
      if (nf(E.vehicleOrTravel) <= 0) {
        F.ordinary.push(finding('ordinary', 'entity-vehicle', `No vehicle, travel or meals on the ${which}`, {
          basis: 'IRC §162(a); IRC §274(d) (substantiation); IRC §280F',
          conditions: 'Business use documented with a contemporaneous mileage log or, for a company-owned vehicle, the personal-use share added to the W-2.',
          detail: 'Owners who drive for the business and do not reimburse themselves through the company leave the deduction on the table; an S-Corp owner cannot deduct it personally.',
        }))
      }
      if (S && !S.homeOfficeOrAccountablePlan) {
        const ho = F.ordinary.find(x => x.code === 'home-office')
        if (ho) {
          F.ordinary[F.ordinary.indexOf(ho)] = finding('ordinary', 'home-office', 'No accountable-plan reimbursement on the 1120-S', {
            basis: ho.basis, conditions: 'A written accountable plan, a monthly expense report, and reimbursement by the company for the business-use share of home, phone and internet costs.',
            detail: 'The other-deductions statement shows no accountable-plan or office-in-home line. Set the plan up this year; the reimbursement is deductible to the S-Corp and not income to you.',
          })
        }
      }
      if (P && nf(P.guaranteedPayments) > 0) {
        F.ordinary.push(finding('ordinary', 'guaranteed-payments', 'Guaranteed payments carry self-employment tax in full', {
          basis: 'IRC §707(c); IRC §1402(a)',
          conditions: 'Guaranteed payments are for services or capital regardless of profit; they are ordinary income to the partner and subject to SE tax.',
          detail: `The 1065 shows ${fmt(nf(P.guaranteedPayments))} of guaranteed payments. Whether a partnership should pay partners this way, or whether an S-Corp election would fit, depends on the services performed and the other partners.`,
        }))
      }
    }
  }

  // 3. §168(k) — cost segregation / bonus depreciation on the rentals.
  if (hasRental) {
    const basis = nf(f.rentalBuildingBasis)
    const depRatio = nf(f.schedERent) > 0 ? nf(f.schedEDepreciation) / nf(f.schedERent) : 0
    const est = basis > 0 ? Math.round(basis * 0.25) : null   // typical 20–30% of basis reclassified to 5/7/15-year property
    F.bonus.push(finding('bonus', 'cost-seg', basis > 0 ? 'Cost segregation study and 100% bonus depreciation' : 'Cost segregation candidate: building basis needed to size it', {
      impact: est ? Math.round(est * marginal) : null,
      basis: 'IRC §168(k) as amended by P.L. 119-21 §70301; Rev. Proc. 87-56 (asset classes); Hospital Corp. of America v. Commissioner, 109 T.C. 21 (1997)',
      conditions: '100% bonus applies to qualified property acquired after January 19, 2025 and placed in service after that date. Earlier acquisitions stay on the TCJA phase-down for their placed-in-service year. The resulting loss is still subject to §469 (next section) and creates recapture on sale.',
      detail: basis > 0
        ? `A study typically reclassifies 20–30% of building basis into 5-, 7- and 15-year property. On ${fmt(basis)} of basis that is roughly ${fmt(est)} of first-year deduction, worth about ${fmt(Math.round(est * marginal))} at your marginal rate, if the loss is usable (see §469 below).`
        : `Depreciation on the return is ${fmt(nf(f.schedEDepreciation))}${depRatio > 0 ? ` (${Math.round(depRatio * 100)}% of rent)` : ''}, which is consistent with straight-line only. Enter the building cost basis in the confirm step to size a study.`,
    }))
  }

  // 4. §469 — the same figures three ways.
  let scenarios = null
  if (hasRental) {
    const filed = asFiled
    const reps = summarizeRecord(buildReviewRecord(f, 'reps'))
    const str = summarizeRecord(buildReviewRecord(f, 'str'))
    scenarios = Object.freeze({
      filed: filed.ok ? filed.totalTax : null,
      reps: reps.ok ? reps.totalTax : null,
      str: str.ok ? str.totalTax : null,
      suspended: filed.ok ? nf(filed.totalSuspendedLoss) : 0,
    })
    const saving = filed.ok && reps.ok ? Math.max(0, filed.totalTax - reps.totalTax) : null
    F.passive.push(finding('passive', 'three-way', 'The rental loss as filed, with REPS, and with the short-term rental exception', {
      impact: saving,
      basis: 'IRC §469(c)(7)(B) (REPS: 750 hours and more than half of personal services); Temp. Reg. §1.469-5T(a) (material participation); Temp. Reg. §1.469-1T(e)(3)(ii)(A) (average stay of 7 days or less is not a rental activity)',
      conditions: rentalNet < 0
        ? 'REPS needs both hour tests plus material participation in each property (or the §1.469-9(g) grouping election). The STR exception needs only material participation in the short-term property, with contemporaneous hour logs either way.'
        : 'The rentals show net income this year, so the nonpassive election mainly matters for future loss years and for the net investment income tax.',
      detail: scenarios.filed != null && scenarios.reps != null
        ? `Total federal tax as filed: ${fmt(scenarios.filed)}. If the rentals were nonpassive under REPS with the grouping election: ${fmt(scenarios.reps)}. Under the STR exception, property by property: ${fmt(scenarios.str)}. Both paths make the loss usable; they differ in what has to be proven (two hour tests plus material participation for REPS; material participation alone for a 7-day-or-less rental) and, for the engine, in how the grouped activity is treated.${scenarios.suspended > 0 ? ` ${fmt(scenarios.suspended)} of loss is suspended on Form 8582 as filed.` : ''}`
        : 'The engine could not compute one of the scenarios from the figures entered.',
      link: REPS_LINK,
    }))
    if (nf(f.priorPassiveLossCarryforward) > 0) {
      F.passive.push(finding('passive', 'suspended', 'Suspended losses waiting on Form 8582', {
        basis: 'IRC §469(b); Form 8582',
        conditions: 'Released against passive income, on a fully taxable disposition of the activity, or when the activity becomes nonpassive.',
        detail: `${fmt(nf(f.priorPassiveLossCarryforward))} of prior rental losses is carried forward. Qualifying under REPS or the STR exception in a later year unlocks the current-year loss, not the carryforward; the carryforward is released against passive income or on sale.`,
      }))
    }
  }

  // 5. §179.
  if (hasBusiness) {
    const lim = calc179Limitation({ k1NonPassive: rec.k1Income, entities: rec.entities, w2Income: rec.f1040.w2Income, taxYear })
    const E179 = S || P
    const ent179 = E179 ? nf(E179.sec179) : 0
    const entBonus = E179 ? nf(E179.bonusDepreciation) : 0
    const entDep = E179 ? nf(E179.depreciation) : 0
    const claimed179 = nf(f.sec179) + ent179
    F.sec179.push(finding('sec179', 'sec179', claimed179 > 0 ? 'Equipment expensing claimed; check the business-income limit next year' : 'Equipment, vehicles and improvements bought for the business', {
      basis: 'IRC §179(b)(3) (business-income limit); IRC §179(d)(1); IRC §168(k) (bonus as the alternative)',
      conditions: 'Property used more than 50% in the active conduct of a trade or business. §179 cannot create a loss (the excess carries forward); bonus can.',
      detail: `${E179
        ? `The ${S ? '1120-S' : '1065'} shows ${fmt(entDep)} of depreciation, ${ent179 > 0 ? `${fmt(ent179)} expensed under §179` : 'nothing expensed under §179'} and ${entBonus > 0 ? `${fmt(entBonus)} of bonus depreciation` : 'no bonus depreciation'}.${entDep > 0 && ent179 <= 0 && entBonus <= 0 ? ' Assets are being written off over their full recovery period; anything placed in service after January 19, 2025 qualifies for 100% bonus.' : ''}`
        : nf(f.sec179) > 0 ? `${fmt(nf(f.sec179))} was expensed under §179.` : 'Nothing was expensed under §179.'} The ${taxYear} business-income limit on these figures is ${fmt(nf(lim?.activeBusinessIncome))}. Bonus depreciation is the alternative when purchases exceed income.`,
    }))
  }

  // 6. Reasonable compensation.
  if (hasScorp) {
    // With the 1120-S in hand the test runs on the company's own lines (all
    // shareholders); otherwise on this owner's W-2 and K-1 share.
    const sal = S ? nf(S.officerCompensation) : nf(f.officerW2)
    const inc = S ? nf(S.ordinaryBusinessIncome) : nf(f.k1ScorpOrdinary)
    const rc = calcReasonableCompCore(sal, inc)
    if (rc.applicable) {
      const tooHigh = rc.ratio > 0.7 && inc > 0
      const dist = S ? nf(S.distributions) : 0
      F.comp.push(finding('comp', 'reasonable-comp', rc.triggered ? 'Officer salary is low relative to S-Corp income' : tooHigh ? 'Officer salary is high relative to S-Corp income' : 'Officer salary is within the range practitioners cite', {
        exposure: rc.triggered,
        basis: 'Rev. Rul. 74-44; Treas. Reg. §1.162-7; David E. Watson, P.C. v. United States, 668 F.3d 1008 (8th Cir. 2012)',
        conditions: 'There is no safe-harbor percentage. Salary must reflect the value of the services actually performed; document the role, hours and comparable wages.',
        detail: `${S ? 'Per the 1120-S, officer' : 'Officer'} salary ${fmt(sal)} is ${rc.ratioPct}% of total S-Corp compensation (${fmt(sal + inc)})${S && dist > 0 ? `, with ${fmt(dist)} taken as distributions` : ''}. ${rc.triggered ? `Below the ${Math.round(SCORP_REASONABLE_COMP_RATIO_THRESHOLD * 100)}% starting benchmark some practitioners use; treat this as a prompt to document how the salary reflects the services.` : tooHigh ? 'A salary this high relative to profit pays FICA on income that could be distribution; review whether it reflects the services.' : 'Keep the documentation that supports it.'}`,
      }))
    }
    if (!S) {
      F.comp.push(finding('comp', 'upload-1120s', 'Upload the 1120-S for the full compensation and deduction review', {
        basis: '', conditions: '',
        detail: 'The 1040 only shows your K-1 share. The S-Corp return has officer pay, distributions, what the company already deducts (retirement, health insurance, vehicle, rent) and the depreciation schedule. Add it on the upload step for those findings.',
      }))
    }
  }
  if (hasPship && !P) {
    F.ordinary.push(finding('ordinary', 'upload-1065', 'Upload the 1065 for the partnership deduction review', {
      basis: '', conditions: '',
      detail: 'The 1040 only shows your K-1 share. The partnership return has guaranteed payments, what the partnership already deducts, and the depreciation schedule. Add it on the upload step for those findings.',
    }))
  }

  // 7. Everything else the engine already finds, from the prior-year record.
  const cards = buildOpportunities(rec)
  const covered = new Set(['Hire Your Children', 'Home Office Deduction', 'Augusta Rule — IRC §280A(g)', 'Bonus Depreciation', 'Track Your Real Estate Hours', '§179 Equipment Deduction'])
  const entityRetire = F.ordinary.some(x => x.code === 'entity-retirement')
  for (const c of cards.opportunities) {
    if (covered.has(c.title)) continue
    if (entityRetire && /^(SEP-IRA|Solo 401\(k\))/.test(c.title)) continue
    F.more.push(finding('more', c.title, c.title, { impact: c.saving || null, detail: c.detail, conditions: c.howTo }))
  }
  if (hasSchedC && nf(f.schedCNet) > 40000) {
    const cmp = compareEntityScenarios({ personalContext: rec.f1040, entities: rec.entities, entityIdx: rec.entities.findIndex(e => e.type === 'Sole Proprietor / SMLLC'), netProfitShare: nf(f.schedCNet) })
    const byKey = Object.fromEntries((cmp && cmp.scenarios ? cmp.scenarios : []).map(s => [s.key, s]))
    const sp = byKey.soleProp ? byKey.soleProp.totalTax : null
    const sc = byKey.sCorp ? byKey.sCorp.totalTax : null
    if (sp != null && sc != null && sp - sc > 1000) {
      F.more.push(finding('more', 'scorp-election', 'S-Corp election on the self-employment income', {
        impact: Math.round(sp - sc),
        basis: 'IRC §1362; Rev. Rul. 74-44 (reasonable salary first)',
        conditions: 'Payroll for the owner, a separate return (1120-S), and state fees; the saving is after those costs.',
        detail: `On ${fmt(nf(f.schedCNet))} of profit, the engine estimates ${fmt(Math.round(sp - sc))} less total tax as an S-Corp with a reasonable salary than as a sole proprietor.`,
      }))
    }
  }
  if (nf(f.underpaymentPenalty) > 0) {
    F.more.push(finding('more', 'penalty', 'Underpayment penalty paid', {
      exposure: true, impact: nf(f.underpaymentPenalty), basis: 'IRC §6654; Form 2210',
      conditions: 'Avoided by paying the smaller of 90% of this year’s tax or 100% (110% above $150K AGI) of last year’s, in four installments.',
      detail: `${fmt(nf(f.underpaymentPenalty))} went to a penalty. TaxStat360’s quarterly figure uses the safe-harbor rule, so paying it on time removes this.`,
    }))
  }

  const sections = SECTIONS.map(s => Object.freeze({ ...s, findings: Object.freeze(F[s.id]) })).filter(s => s.findings.length)
  const questions = []
  if (hasRental) questions.push('How many hours did I spend on the rentals last year, and where is the log?')
  if (hasScorp) questions.push('How was my officer salary set, and what documents support it?')
  if (S && nf(S.distributions) > 0) questions.push('Where is my stock-basis schedule (Form 7203), and does it support the distributions taken?')
  if (hasBusiness) questions.push('Which of these strategies fit my business, and what records would you want to see first?')
  questions.push('If any of this suggests amending last year, is it worth it after the cost?')
  // Headline total: savings items only, and never two that exclude each other
  // (a SEP-IRA and a Solo 401(k) are alternatives; count the larger).
  const all = sections.flatMap(s => s.findings).filter(x => !x.exposure && nf(x.impact) > 0)
  const hasSolo = all.some(x => x.code.startsWith('Solo 401(k)'))
  const totalImpact = all.reduce((t, x) => t + ((hasSolo && x.code === 'SEP-IRA') ? 0 : nf(x.impact)), 0)

  const missingReturns = [...(hasScorp && !S ? ['1120s'] : []), ...(hasPship && !P ? ['1065'] : [])]
  return Object.freeze({ taxYear, asFiled, scenarios, sections, questions, totalImpact, fields: f, entityReturns: Object.freeze((entityReturns || []).map(r => r.kind)), missingReturns: Object.freeze(missingReturns) })
}
