// src/utils/sessionState.js
// Typed reader/writer functions for all sessionStorage keys used across the
// Step 1 → Step 2 navigation boundary in TaxStat360.
//
// Rules:
//   - Every sessionStorage.setItem call in the app goes through a writer here.
//   - Every sessionStorage.getItem call in the app goes through a reader here.
//   - Readers always return a valid default if the key is missing or malformed.
//   - Never write different shapes for the same key from different call sites.
//
// Two related entity-list keys:
//   ts360_entities     — flat k1Data shape: { name, type, own, netProfit, k1, box11_12, ... }
//                        consumed by TaxReturn for tax-math (per-entity K-1 income)
//   ts360_entities_raw — raw entity shape: { name, type, own, ein, formationDate, pnl: {...}, connectedId, isManual }
//                        consumed by CalculateTaxInner on mount for entity-management UI
//
// Both keys are written together by writeStep1State and Dashboard.loadRecord
// so the two pages stay in sync. The split exists because the two consumers
// genuinely need different shapes — flat for math, nested for editable UI.
//
// Writers:
//   writeStep1State     — called by CalculateTaxInner after entity entry, Dashboard (loadRecord, tab-nav), AIAnalysis (Calculate Tax / Update Data buttons)
//   writePersonalContext — called by Dashboard (loadRecord, tab-nav) and TaxReturn (auto-save)
//   writeTaxYear        — called by Dashboard and TaxReturn
//   writeIsCoopPatron   — called by CalculateTaxInner (checkbox sync)
//   clearStep1State     — called by Dashboard ("+ New Calculation" buttons) to prevent stale entity data bleeding into a fresh session
//   writeBusinessInfo   — F-10 FIX: called by Onboarding.jsx BusinessScreen after O7 patch
//   readBusinessInfo    — F-10 FIX: called by AIAnalysis.jsx getOnboardingBizInfo()
//
// Readers:
//   readStep1State      — called by TaxReturn (mount) and AIAnalysis (getRecord: co-op patron, entities, k1, fallback entities)
//   readStep1StateRaw   — called by CalculateTaxInner (useState initializer for entities)
//   readPersonalContext — called by TaxReturn on mount, AIAnalysis
//   readTaxYear         — called by TaxReturn, EntityCompareModal
//   readIsCoopPatron    — called by CalculateTaxInner (useState initializer)
//   readBusinessInfo    — F-10 FIX: called by AIAnalysis.jsx getOnboardingBizInfo()
//
// ── AUDIT PASS 2 ADDITIONS ────────────────────────────────────────────────────
// F22 ADDITION: ts360_dismissed_risks
//   Risk Scan findings in AIAnalysis.jsx previously had no persistent dismiss
//   state — every risk appeared unresolved on every visit. The RiskScan
//   component now supports per-record dismissal via a "Mark as reviewed" control.
//   Dismissed item keys are stored as a JSON object keyed by record ID, so
//   dismissals persist per record without cross-contaminating other records.
//   writeRiskDismissal / readRiskDismissals / clearRiskDismissals are the
//   canonical accessors. Storage uses localStorage (not sessionStorage) because
//   dismissals should survive page reloads and new sessions — a "reviewed"
//   quarterly deadline shouldn't reappear the next morning.
//
// O4 ADDITION: ts360_first_run
//   Onboarding.jsx ImportScreen writes ts360_first_run = '1' to sessionStorage
//   when a user skips Step 3 (accounting software connection) and navigates to
//   the Tax Tracker. CalculateTaxInner reads this flag on mount to show a
//   contextual first-run banner: "Your entity is set up — now add your revenue
//   and expenses to see your tax estimate."
//   readFirstRun / clearFirstRun are the canonical accessors. The flag is
//   session-scoped (sessionStorage) because it should only fire once per login
//   session — reloading the app should not re-show the banner.
//
// ── AUDIT PASS 4 ADDITIONS ────────────────────────────────────────────────────
// F-10 FIX: ts360_biz_name / ts360_biz_ein / ts360_biz_address
//   AIAnalysis.jsx and CalculateTaxInner.jsx previously called
//   sessionStorage.getItem('ts360_biz_name') and related keys directly,
//   bypassing this abstraction layer. If a key is renamed, there is no single
//   place to update it — a missed rename produces a silent undefined read,
//   which becomes a $0 business-name field in the CPA export.
//   writeBusinessInfo / readBusinessInfo are the canonical accessors.
//   Replace ALL direct sessionStorage.getItem/setItem calls for ts360_biz_*
//   keys with these helpers.

// ─── Step 1 state (entity list + totals) ──────────────────────────────────
// Written by: CalculateTaxInner (proceed() and AI Analysis nav)
// Read by: TaxReturn, AIAnalysis

export function writeStep1State({ entities = [], entitiesRaw = null, k1Total = 0, isCoopPatron = false } = {}) {
  sessionStorage.setItem('ts360_entities', JSON.stringify(entities))
  sessionStorage.setItem('ts360_k1', String(k1Total))
  sessionStorage.setItem('ts360_isCoopPatron', String(isCoopPatron))
  // entitiesRaw is optional. When null (the default), leave ts360_entities_raw
  // untouched — preserves backward compatibility for callers that only know
  // about the flat shape. When provided (Dashboard.loadRecord, eventually
  // CalculateTaxInner.proceed), write the raw entity-shape array so
  // CalculateTaxInner can restore on mount with the full pnl breakdown.
  if (entitiesRaw !== null) {
    sessionStorage.setItem('ts360_entities_raw', JSON.stringify(entitiesRaw))
  }
}

export function readStep1State() {
  let entities = []
  try { entities = JSON.parse(sessionStorage.getItem('ts360_entities') || '[]') } catch {}
  const k1Total = parseFloat(sessionStorage.getItem('ts360_k1') || '0') || 0
  const isCoopPatron = sessionStorage.getItem('ts360_isCoopPatron') === 'true'
  return { entities, k1Total, isCoopPatron }
}

/**
 * Reader for ts360_entities_raw — the raw entity-shape array CalculateTaxInner
 * needs to restore its useState on mount. Returns an empty array if the key
 * is missing or malformed; callers should fall back to their default entity.
 */
export function readStep1StateRaw() {
  try {
    const raw = sessionStorage.getItem('ts360_entities_raw')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Clear all Step 1 sessionStorage keys atomically. Called when the user starts
 * a fresh calculation (Dashboard "+ New Calculation" buttons) so a previously-
 * loaded record's entity data doesn't bleed into the new session.
 *
 * Does NOT clear ts360_f1040 or ts360_taxyear — those are Step 2 keys with
 * their own reset semantics owned by TaxReturn / Dashboard's loadRecord.
 */
export function clearStep1State() {
  sessionStorage.removeItem('ts360_entities')
  sessionStorage.removeItem('ts360_entities_raw')
  sessionStorage.removeItem('ts360_k1')
  sessionStorage.removeItem('ts360_isCoopPatron')
  // AUDIT FIX (finding #5 — "+ New Calculation" did not reset): CalculateTaxInner
  // hydrates its entity list on mount from ts360_step1_entities (its own working-copy
  // key), NOT from ts360_entities_raw. Clearing the canonical keys above left this one
  // untouched, so a previously-entered entity bled into every fresh calculation.
  sessionStorage.removeItem('ts360_step1_entities')
}

// ─── Personal 1040 context (filing status, year, income, deductions, payments) ─
// Written by: Dashboard (loadRecord, tab-nav handler), TaxReturn (auto-save on navigate)
// Read by: TaxReturn on mount, AIAnalysis
//
// Canonical field names (no legacy aliases):
//   useItemized — true = itemizing deductions (NOT useStandardDed)
//   itemizedAmt — itemized deduction total (NOT itemizedDed)
//   estPaid     — estimated tax payments made (NOT estimatedPayments)
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
  taxYear = new Date().getFullYear(),
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
  repHoursRE = 0,      // F-11
  repHoursTotal = 0,   // F-11
  priorSuspendedLoss = 0, // F-01
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
    form4797, manualK1s, isREP, repHoursRE, repHoursTotal, priorSuspendedLoss,
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
    taxYear: new Date().getFullYear(),
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
    repHoursRE: 0,
    repHoursTotal: 0,
    priorSuspendedLoss: 0,
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
  let parsed
  try {
    const raw = sessionStorage.getItem('ts360_f1040')
    if (!raw) return defaults
    parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return defaults
  } catch {
    return defaults
  }
  // Explicit field extraction (NOT a spread merge). Spread would let unknown
  // keys from older sessionStorage data — including legacy field names like
  // useStandardDed, itemizedDed, estimatedPayments — sit alongside the
  // canonical fields, masking missing-data bugs and making the contract
  // ambiguous. `??` preserves valid falsy values (false, 0, '') while
  // falling through to defaults only when the field is missing/undefined.
  //
  // Legacy-name fallbacks below preserve user choice when sessionStorage
  // contains pre-migration data (e.g. from a dev browser tested before
  // this PR landed). These fallbacks are pre-launch transition aids
  // and can be removed once the app is launched and no stale browser
  // sessions remain. Tracked as a follow-up.
  return {
    filingStatus:      parsed.filingStatus      ?? defaults.filingStatus,
    taxYear:           parsed.taxYear           ?? defaults.taxYear,
    dependents:        parsed.dependents        ?? defaults.dependents,
    w2Income:          parsed.w2Income          ?? defaults.w2Income,
    w2Withheld:        parsed.w2Withheld        ?? defaults.w2Withheld,
    rentalIncome:      parsed.rentalIncome      ?? defaults.rentalIncome,
    rentalExpenses:    parsed.rentalExpenses    ?? defaults.rentalExpenses,
    capitalGains:      parsed.capitalGains      ?? defaults.capitalGains,
    interest:          parsed.interest          ?? defaults.interest,
    dividends:         parsed.dividends         ?? defaults.dividends,
    qualifiedDividends: parsed.qualifiedDividends ?? defaults.qualifiedDividends,
    form4797:          parsed.form4797          ?? defaults.form4797,
    manualK1s:         Array.isArray(parsed.manualK1s) ? parsed.manualK1s : defaults.manualK1s,
    isREP:             parsed.isREP             ?? defaults.isREP,
    repHoursRE:        parsed.repHoursRE        ?? defaults.repHoursRE,
    repHoursTotal:     parsed.repHoursTotal     ?? defaults.repHoursTotal,
    priorSuspendedLoss: parsed.priorSuspendedLoss ?? defaults.priorSuspendedLoss,
    // Renamed-field migrations — read new name first, fall back to legacy
    // name to preserve choice from pre-migration sessionStorage data.
    useItemized:       parsed.useItemized ?? (parsed.useStandardDed !== undefined ? !parsed.useStandardDed : defaults.useItemized),
    itemizedAmt:       parsed.itemizedAmt  ?? parsed.itemizedDed       ?? defaults.itemizedAmt,
    estPaid:           parsed.estPaid      ?? parsed.estimatedPayments  ?? defaults.estPaid,
    saltAmount:        parsed.saltAmount        ?? defaults.saltAmount,
    hasISO:            parsed.hasISO            ?? defaults.hasISO,
    isoBargainElement: parsed.isoBargainElement ?? defaults.isoBargainElement,
    priorYearQBILoss:  parsed.priorYearQBILoss  ?? defaults.priorYearQBILoss,
    socialSecurity:    parsed.socialSecurity    ?? defaults.socialSecurity,
    iraDistributions:  parsed.iraDistributions  ?? defaults.iraDistributions,
    selfEmpHealthIns:  parsed.selfEmpHealthIns  ?? defaults.selfEmpHealthIns,
    hsaDeduction:      parsed.hsaDeduction      ?? defaults.hsaDeduction,
    studentLoanInt:    parsed.studentLoanInt    ?? defaults.studentLoanInt,
    selfEmpRetirement: parsed.selfEmpRetirement ?? defaults.selfEmpRetirement,
    nolCarryforward:   parsed.nolCarryforward   ?? defaults.nolCarryforward,
  }
}

// ─── Tax year (standalone, because Dashboard writes it separately) ─────────
export function writeTaxYear(year) {
  sessionStorage.setItem('ts360_taxyear', String(parseInt(year) || new Date().getFullYear()))
}

export function readTaxYear() {
  return parseInt(sessionStorage.getItem('ts360_taxyear') || String(new Date().getFullYear())) || new Date().getFullYear()
}

// ─── Co-op patron flag ────────────────────────────────────────────────────
// CalculateTaxInner manages isCoopPatron as local React state and writes it
// to storage via useEffect on every change. Using writeStep1State there would
// also rewrite entities and k1Total on every checkbox toggle, which is
// unnecessary churn. Atomic helpers keep the contract clean while letting
// callers update one managed key at a time when that's what they want.
export function writeIsCoopPatron(value) {
  sessionStorage.setItem('ts360_isCoopPatron', String(!!value))
}

export function readIsCoopPatron() {
  return sessionStorage.getItem('ts360_isCoopPatron') === 'true'
}

// ─── F-10 FIX: Business info (onboarding biz name / EIN / address) ────────
// Written by: Onboarding.jsx BusinessScreen (O7 patch) via sessionStorage.setItem.
// Previously, AIAnalysis.jsx called sessionStorage.getItem('ts360_biz_name') etc.
// directly — bypassing this abstraction. If any key is renamed, every direct call
// site must be updated manually. A missed rename produces a silent undefined read,
// which becomes an empty business-name field in the CPA export.
//
// Migration: replace all direct sessionStorage.getItem/setItem calls for
// ts360_biz_* keys with these helpers in AIAnalysis.jsx and any other consumers.
//
// Storage key inventory:
//   ts360_biz_name    — business display name (e.g. "Acme S-Corp LLC")
//   ts360_biz_ein     — Employer Identification Number (XX-XXXXXXX format)
//   ts360_biz_address — business mailing address (single-line string)
//
// Storage: sessionStorage — business info is session-scoped (tied to the
// onboarding flow). It persists until the tab is closed or clearStep1State is called.

const BIZ_KEYS = {
  name:    'ts360_biz_name',
  ein:     'ts360_biz_ein',
  address: 'ts360_biz_address',
}

/**
 * Write business info captured during onboarding to sessionStorage.
 * Called by Onboarding.jsx BusinessScreen after the O7 patch.
 *
 * @param {{ bizName?: string, bizEin?: string, bizAddress?: string }} info
 */
export function writeBusinessInfo({ bizName = '', bizEin = '', bizAddress = '' } = {}) {
  sessionStorage.setItem(BIZ_KEYS.name,    bizName)
  sessionStorage.setItem(BIZ_KEYS.ein,     bizEin)
  sessionStorage.setItem(BIZ_KEYS.address, bizAddress)
}

/**
 * Read business info from sessionStorage.
 * Called by AIAnalysis.jsx in place of direct sessionStorage.getItem calls.
 * Falls back gracefully to empty strings if not set (pre-patch sessions, skipped step).
 *
 * @returns {{ bizName: string, bizEin: string, bizAddress: string }}
 */
export function readBusinessInfo() {
  return {
    bizName:    sessionStorage.getItem(BIZ_KEYS.name)    || '',
    bizEin:     sessionStorage.getItem(BIZ_KEYS.ein)     || '',
    bizAddress: sessionStorage.getItem(BIZ_KEYS.address) || '',
  }
}

// ─── F22: Risk Scan dismissals (per record) ───────────────────────────────
// Storage: localStorage (not sessionStorage) — dismissals must survive
// page reloads and new sessions. A "reviewed" quarterly deadline should
// not reappear the next morning when the user opens a new tab.
//
// Data shape: { [recordId: string]: { [findingKey: string]: true } }
// findingKey is a short stable identifier derived from the finding title
// in RiskScan — e.g. 'no-officer-salary', 'next-deadline-june-15'.
// Using the title-slug (not array index) means the dismissed state
// survives risk scan reorderings when new findings are added.
//
// Storage key: ts360_dismissed_risks
// Written by: AIAnalysis.jsx RiskScan "Mark as reviewed" handler
// Read by: AIAnalysis.jsx RiskScan on render to filter / section findings

const DISMISSED_RISKS_KEY = 'ts360_dismissed_risks'

/**
 * Mark a specific risk finding as dismissed for a given record.
 * @param {string} recordId   - rec.id as a string
 * @param {string} findingKey - stable slug for the finding (e.g. 'no-officer-salary')
 */
export function writeRiskDismissal(recordId, findingKey) {
  if (!recordId || !findingKey) return
  try {
    const raw = localStorage.getItem(DISMISSED_RISKS_KEY)
    const all = raw ? JSON.parse(raw) : {}
    if (!all[recordId]) all[recordId] = {}
    all[recordId][findingKey] = true
    localStorage.setItem(DISMISSED_RISKS_KEY, JSON.stringify(all))
  } catch (e) {
    console.error('writeRiskDismissal error:', e)
  }
}

/**
 * Read all dismissed finding keys for a given record.
 * @param {string} recordId - rec.id as a string
 * @returns {{ [findingKey: string]: true }} — empty object if none dismissed
 */
export function readRiskDismissals(recordId) {
  if (!recordId) return {}
  try {
    const raw = localStorage.getItem(DISMISSED_RISKS_KEY)
    if (!raw) return {}
    const all = JSON.parse(raw)
    return (all && typeof all[recordId] === 'object') ? all[recordId] : {}
  } catch {
    return {}
  }
}

/**
 * Remove all dismissals for a specific record (e.g. when the record is deleted).
 * @param {string} recordId
 */
export function clearRiskDismissals(recordId) {
  if (!recordId) return
  try {
    const raw = localStorage.getItem(DISMISSED_RISKS_KEY)
    if (!raw) return
    const all = JSON.parse(raw)
    if (all && all[recordId]) {
      delete all[recordId]
      localStorage.setItem(DISMISSED_RISKS_KEY, JSON.stringify(all))
    }
  } catch (e) {
    console.error('clearRiskDismissals error:', e)
  }
}

// ─── O4: First-run banner flag ────────────────────────────────────────────
// Written by: Onboarding.jsx ImportScreen goToDashboard() when user skips
// Step 3 (accounting software connection) before entering revenue data.
// Read by: CalculateTaxInner on mount to decide whether to show the
// contextual first-run banner: "Your entity is set up — now add your
// revenue and expenses to see your tax estimate."
//
// Storage: sessionStorage — the banner should show once per login session.
// Reloading the browser or starting a new tab should not re-show it. The
// Onboarding.jsx patch (O4 fix) writes this directly via sessionStorage —
// the reader and clear functions here make CalculateTaxInner's usage
// canonical and testable without raw sessionStorage.getItem calls scattered
// across the component.

/**
 * Returns true if the user just completed onboarding and skipped the
 * accounting software step — CalculateTaxInner should show the first-run
 * banner guiding them to add revenue and expenses.
 */
export function readFirstRun() {
  return sessionStorage.getItem('ts360_first_run') === '1'
}

/**
 * Clear the first-run flag after the banner has been shown.
 * Call once the banner renders so it doesn't persist across navigation.
 */
export function clearFirstRun() {
  sessionStorage.removeItem('ts360_first_run')
}

// ─── Coercion helper for saved-record data ────────────────────────────────
// Saved records (from localStorage ts360_records_*) are produced by Dashboard's
// UI forms which store every numeric field as a string. Passing those strings
// directly to writePersonalContext violates the "I accept numbers" contract —
// downstream tax math may behave differently for '' vs 0.
//
// normalizeF1040(rec) takes a possibly-stringly-typed f1040 object and returns
// a copy with every numeric field coerced via parseFloat or parseInt. Boolean
// fields are coerced to true booleans. String and array fields pass through.
//
// Usage: writePersonalContext(normalizeF1040(rec.f1040 || {}))
//
// Field list mirrors writePersonalContext's accepted parameters. Adding a new
// field to the contract means adding it here too — track them together.
export function normalizeF1040(rec = {}) {
  return {
    filingStatus:      rec.filingStatus || 'single',
    taxYear:           parseInt(rec.taxYear)           || new Date().getFullYear(),
    dependents:        parseInt(rec.dependents)        || 0,
    w2Income:          parseFloat(rec.w2Income)        || 0,
    w2Withheld:        parseFloat(rec.w2Withheld)      || 0,
    rentalIncome:      parseFloat(rec.rentalIncome)    || 0,
    rentalExpenses:    parseFloat(rec.rentalExpenses)  || 0,
    capitalGains:      parseFloat(rec.capitalGains)    || 0,
    interest:          parseFloat(rec.interest)        || 0,
    dividends:         parseFloat(rec.dividends)       || 0,
    qualifiedDividends: parseFloat(rec.qualifiedDividends ?? rec.qualDividends) || 0,
    form4797:          parseFloat(rec.form4797)        || 0,
    manualK1s:         Array.isArray(rec.manualK1s) ? rec.manualK1s : [],
    isREP:             !!rec.isREP,
    // Renamed-field migration: if the saved record was written before the
    // PR #136 contract migration, it contains useStandardDed / itemizedDed /
    // estimatedPayments instead of the canonical names. Read the canonical
    // name first, fall back to the legacy name to preserve user choice.
    useItemized:       rec.useItemized !== undefined
                         ? !!rec.useItemized
                         : (rec.useStandardDed !== undefined ? !rec.useStandardDed : false),
    itemizedAmt:       parseFloat(rec.itemizedAmt ?? rec.itemizedDed)          || 0,
    saltAmount:        parseFloat(rec.saltAmount)      || 0,
    hasISO:            !!rec.hasISO,
    isoBargainElement: parseFloat(rec.isoBargainElement) || 0,
    estPaid:           parseFloat(rec.estPaid ?? rec.estimatedPayments)        || 0,
    priorYearQBILoss:  parseFloat(rec.priorYearQBILoss) || 0,
    socialSecurity:    parseFloat(rec.socialSecurity)   || 0,
    iraDistributions:  parseFloat(rec.iraDistributions) || 0,
    selfEmpHealthIns:  parseFloat(rec.selfEmpHealthIns) || 0,
    hsaDeduction:      parseFloat(rec.hsaDeduction)     || 0,
    studentLoanInt:    parseFloat(rec.studentLoanInt)   || 0,
    selfEmpRetirement: parseFloat(rec.selfEmpRetirement) || 0,
    nolCarryforward:   parseFloat(rec.nolCarryforward)  || 0,
  }
}
