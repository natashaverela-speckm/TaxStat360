// src/utils/sessionState.js
// Typed reader/writer functions for all sessionStorage keys used across the
// Step 1 → Step 2 navigation boundary in TaxStat360.
//
// Rules:
// - Every sessionStorage.setItem call in the app goes through a writer here.
// - Every sessionStorage.getItem call in the app goes through a reader here.
// - Readers always return a valid default if the key is missing or malformed.
// - Never write different shapes for the same key from different call sites.
//
// Writers:
// writeStep1State — called by CalculateTaxInner after entity entry
// writePersonalContext — called by Dashboard (loadRecord, tab-nav) and TaxReturn (auto-save)
// writeTaxYear — called by Dashboard and TaxReturn
//
// Readers:
// readStep1State — called by TaxReturn, AIAnalysis
// readPersonalContext — called by TaxReturn on mount, AIAnalysis
// readTaxYear — called by TaxReturn, EntityCompareModal

// ─── Step 1 state (entity list + totals) ──────────────────────────────────────
// Written by: CalculateTaxInner (proceed() and AI Analysis nav)
// Read by: TaxReturn, AIAnalysis

export function writeStep1State({ entities = [], k1Total = 0, isCoopPatron = false } = {}) {
  sessionStorage.setItem('ts360_entities', JSON.stringify(entities))
  sessionStorage.setItem('ts360_k1', String(k1Total))
  sessionStorage.setItem('ts360_isCoopPatron', String(isCoopPatron))
}

export function readStep1State() {
  let entities = []
  try { entities = JSON.parse(sessionStorage.getItem('ts360_entities') || '[]') } catch {}
  const k1Total = parseFloat(sessionStorage.getItem('ts360_k1') || '0') || 0
  const isCoopPatron = sessionStorage.getItem('ts360_isCoopPatron') === 'true'
  return { entities, k1Total, isCoopPatron }
}

// ─── Personal 1040 context (filing status, year, income, deductions, payments) ─
// Written by: Dashboard (loadRecord, tab-nav handler), TaxReturn (auto-save on navigate)
// Read by: TaxReturn on mount, AIAnalysis
//
// Canonical field names (no legacy aliases):
//   useItemized   — true = itemizing deductions (NOT useStandardDed)
//   itemizedAmt   — itemized deduction total (NOT itemizedDed)
//   estPaid       — estimated tax payments made (NOT estimatedPayments)
//
// nolCarryforward is included here so values entered on TaxReturn persist across
// sessions. Previously the field was read on mount but silently dropped from the
// auto-save write. This is fixed as a consequence of the contract migration.
// Seeding nolCarryforward from Dashboard (loadRecord) is deferred — Dashboard
// never captured this field from saved records.

/**
 * Typed writer for ts360_f1040. All numeric fields must be numbers at the call
 * site — coerce with parseFloat/parseInt before passing. The contract is
 * "I accept numbers; callers coerce at the boundary."
 *
 * @param {{
 *   filingStatus?: string,
 *   taxYear?: number,
 *   dependents?: number,
 *   w2Income?: number,
 *   w2Withheld?: number,
 *   rentalIncome?: number,
 *   rentalExpenses?: number,
 *   capitalGains?: number,
 *   interest?: number,
 *   dividends?: number,
 *   qualifiedDividends?: number,
 *   form4797?: number,
 *   manualK1s?: Array,
 *   isREP?: boolean,
 *   useItemized?: boolean,
 *   itemizedAmt?: number,
 *   saltAmount?: number,
 *   hasISO?: boolean,
 *   isoBargainElement?: number,
 *   estPaid?: number,
 *   priorYearQBILoss?: number,
 *   socialSecurity?: number,
 *   iraDistributions?: number,
 *   selfEmpHealthIns?: number,
 *   hsaDeduction?: number,
 *   studentLoanInt?: number,
 *   selfEmpRetirement?: number,
 *   nolCarryforward?: number,
 * }} ctx
 */
export function writePersonalContext({
  filingStatus = 'single',
  taxYear = 2025,
  dependents = 0,
  w2Income = 0,
  w2Withheld = 0,
  rentalIncome = 0,
  rentalExpenses = 0,
  capitalGains = 0,
  interest = 0,
  dividends = 0,
  qualifiedDividends = 0,
  form4797 = 0,
  manualK1s = [],
  isREP = false,
  useItemized = false,
  itemizedAmt = 0,
  saltAmount = 0,
  hasISO = false,
  isoBargainElement = 0,
  estPaid = 0,
  priorYearQBILoss = 0,
  socialSecurity = 0,
  iraDistributions = 0,
  selfEmpHealthIns = 0,
  hsaDeduction = 0,
  studentLoanInt = 0,
  selfEmpRetirement = 0,
  nolCarryforward = 0,
} = {}) {
  sessionStorage.setItem('ts360_f1040', JSON.stringify({
    filingStatus, taxYear, dependents, w2Income, w2Withheld,
    rentalIncome, rentalExpenses, capitalGains, interest, dividends, qualifiedDividends,
    form4797, manualK1s, isREP,
    useItemized, itemizedAmt, saltAmount, hasISO, isoBargainElement, estPaid,
    priorYearQBILoss, socialSecurity, iraDistributions,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward,
  }))
}

/**
 * @returns {{
 *   filingStatus: string,
 *   taxYear: number,
 *   dependents: number,
 *   w2Income: number,
 *   w2Withheld: number,
 *   rentalIncome: number,
 *   rentalExpenses: number,
 *   capitalGains: number,
 *   interest: number,
 *   dividends: number,
 *   qualifiedDividends: number,
 *   form4797: number,
 *   manualK1s: Array,
 *   isREP: boolean,
 *   useItemized: boolean,
 *   itemizedAmt: number,
 *   saltAmount: number,
 *   hasISO: boolean,
 *   isoBargainElement: number,
 *   estPaid: number,
 *   priorYearQBILoss: number,
 *   socialSecurity: number,
 *   iraDistributions: number,
 *   selfEmpHealthIns: number,
 *   hsaDeduction: number,
 *   studentLoanInt: number,
 *   selfEmpRetirement: number,
 *   nolCarryforward: number,
 * }}
 */
export function readPersonalContext() {
  const defaults = {
    filingStatus: 'single',
    taxYear: 2025,
    dependents: 0,
    w2Income: 0,
    w2Withheld: 0,
    rentalIncome: 0,
    rentalExpenses: 0,
    capitalGains: 0,
    interest: 0,
    dividends: 0,
    qualifiedDividends: 0,
    form4797: 0,
    manualK1s: [],
    isREP: false,
    useItemized: false,
    itemizedAmt: 0,
    saltAmount: 0,
    hasISO: false,
    isoBargainElement: 0,
    estPaid: 0,
    priorYearQBILoss: 0,
    socialSecurity: 0,
    iraDistributions: 0,
    selfEmpHealthIns: 0,
    hsaDeduction: 0,
    studentLoanInt: 0,
    selfEmpRetirement: 0,
    nolCarryforward: 0,
  }
  try {
    const raw = sessionStorage.getItem('ts360_f1040')
    if (!raw) return defaults
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

// ─── Tax year (standalone, because Dashboard writes it separately) ─────────────
export function writeTaxYear(year) {
  sessionStorage.setItem('ts360_taxyear', String(parseInt(year) || 2025))
}

export function readTaxYear() {
  return parseInt(sessionStorage.getItem('ts360_taxyear') || '2025') || 2025
}
