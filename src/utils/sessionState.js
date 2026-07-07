// src/utils/sessionState.js
import {
  fetchRecordsFromServer,
  upsertRecordOnServer,
  deleteRecordOnServer,
  migrateLocalRecordsToServer,
} from './serverApi.js'

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
//   clearStep1State     — called by Dashboard ("+ New Calculation" buttons) to prevent stale entity data bleeding into a fresh session
//   writeBusinessInfo   — F-10 FIX: called by Onboarding.jsx BusinessScreen after O7 patch
//   readBusinessInfo    — F-10 FIX: called by AIAnalysis.jsx getOnboardingBizInfo()
//
// Readers:
//   readStep1State      — called by TaxReturn (mount) and AIAnalysis (getRecord: co-op patron, entities, k1, fallback entities)
//   readStep1StateRaw   — called by CalculateTaxInner (useState initializer for entities)
//   readPersonalContext — called by TaxReturn on mount, AIAnalysis
//   readTaxYear         — called by TaxReturn, EntityCompareModal
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

import { DEFAULT_TAX_YEAR } from '../constants.js'

// C-15: a new calculation's default Tax Year is the current calendar year, but never
// beyond the latest year the engine has tax tables for (CURRENT_TAX_YEAR). This keeps the
// default on a year that exists in the dropdown and has real brackets, instead of silently
// using substitute tables once the calendar rolls past the last supported year.
//
// FINDING-7 ROOT FIX: the original Math.min(new Date().getFullYear(), CURRENT_TAX_YEAR)
// resolves to CURRENT_TAX_YEAR for the ENTIRE calendar year that matches it — e.g. all of
// 2026, even though the 2025 return isn't due until mid-October 2026 (with extension) and
// most users opening a fresh session in Jan–Sep 2026 are planning/filing for 2025, not 2026.
// This was the actual source of the "tax year always defaults to 2026" bug — the component-
// level `readTaxYear() || CURRENT_TAX_YEAR` fallbacks in CalculateTaxInner.jsx/TaxReturn.jsx
// never even ran, because readTaxYear() below ALWAYS returns a concrete year via
// defaultTaxYear() and is never falsy.
// Cap at DEFAULT_TAX_YEAR (the most recently COMPLETED tax year) instead of CURRENT_TAX_YEAR
// (the latest year the engine has brackets for, which may not be filing-ready yet).
// ⚠ ANNUAL UPDATE: this now tracks constants.js DEFAULT_TAX_YEAR — no separate edit needed
// here when the new year rolls over, as long as DEFAULT_TAX_YEAR is advanced each January.
const defaultTaxYear = () => Math.min(new Date().getFullYear(), DEFAULT_TAX_YEAR)

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
    // CC-F3 FIX: also sync ts360_step1_entities (CalculateTaxInner's working-copy key)
    // so all three entity keys stay in sync when this function is called. Previously
    // CalculateTaxInner wrote ts360_step1_entities directly in 8 places, bypassing
    // this abstraction. Those writes still exist for in-component mutations; this write
    // handles the load-from-server / navigate-between-steps path.
    sessionStorage.setItem('ts360_step1_entities', JSON.stringify(entitiesRaw))
  }
}

export function readStep1State() {
  let entities = []
  // M5 (audit F-10): corrupt working-copy JSON → empty entity list (module convention:
  // storage readers degrade to a sane default rather than throw into render paths).
  try { entities = JSON.parse(sessionStorage.getItem('ts360_entities') || '[]') } catch { /* default [] stands */ }
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
    return []   // M5: corrupt JSON → empty list (module convention)
  }
}

/**
 * Clear all Step 1 sessionStorage keys atomically. Called when the user starts
 * a fresh calculation (Dashboard "+ New Calculation" buttons) so a previously-
 * loaded record's entity data doesn't bleed into the new session.
 *
 * Also clears ts360_f1040 and ts360_taxyear — those are Step 2 keys with
 * their own writers; clearing here keeps a fresh "+ New Calculation" from inheriting them.
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
  sessionStorage.removeItem('ts360_step1_entities'); sessionStorage.removeItem('ts360_f1040'); sessionStorage.removeItem('ts360_taxyear')
  // F-FUNC-02: a fresh calculation is NOT an edit of the previously-loaded record.
  // Drop the active-record pointer so the next "Save This Record" mints a new
  // record instead of upserting over (and overwriting) the record last loaded.
  clearActiveRecord()
  // F-FUNC-05: drop any stale entity-preset hint so a plain "+ New Calculation"
  // starts genuinely empty. A preset card re-stashes its hint AFTER calling this.
  clearPresetEntityType()
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
  taxYear = defaultTaxYear(),
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
  // Note: §469(c)(7)(B) REP hours (repHoursRE / repHoursTotal) are NOT stored here.
  // They live per-rental-entity (entity.repHoursRE / entity.repHoursTotal) — the single
  // source of truth consumed by the engine via TaxReturn and the scenario comparison.
  // A legacy personal-context copy was removed to prevent a stale-read path.
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
  // AUDIT F3 RESIDUAL FIX (write-side strip): TaxReturn passes all of the
  // fields below on every edit, but this destructuring silently discarded
  // them, so ts360_f1040 never carried YTD state (or the others) and the
  // component re-seeded from defaults on every mount. This list is the exact
  // set TaxReturn reads back via savedCtx.* — keep the three lists in sync:
  // writePersonalContext / readPersonalContext / normalizeF1040.
  ytdMode = false,
  ytdMonth = 0,
  stGain = 0,
  ltGain = 0,
  qualDividends = 0,
  unrecap1250 = 0,
  collectiblesGain = 0,
  nonrecap1231 = 0,
  isActiveParticipant = true,
  rentalAggregationElection = false,
  priorPassiveLossCarryforward = 0,
  priorYearTax = 0,
  priorYearAGI = 0,
  priorYearLosses = 0,
  mortgageInt = 0,
  charitableContr = 0,
  medicalAmt = 0,
} = {}) {
  sessionStorage.setItem('ts360_f1040', JSON.stringify({
    filingStatus, taxYear, dependents, w2Income, w2Withheld,
    rentalIncome, rentalExpenses, capitalGains, interest, dividends, qualifiedDividends,
    form4797, manualK1s, isREP, priorSuspendedLoss,
    useItemized, itemizedAmt, saltAmount, hasISO, isoBargainElement, estPaid,
    priorYearQBILoss, socialSecurity, iraDistributions,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward,
    // AUDIT F3 RESIDUAL FIX — see parameter block above.
    ytdMode, ytdMonth, stGain, ltGain, qualDividends,
    unrecap1250, collectiblesGain, nonrecap1231,
    isActiveParticipant, rentalAggregationElection,
    priorPassiveLossCarryforward, priorYearTax, priorYearAGI, priorYearLosses,
    mortgageInt, charitableContr, medicalAmt,
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
    taxYear: defaultTaxYear(),
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
    return defaults   // M5: corrupt JSON → documented defaults (module convention)
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
    // repHoursRE / repHoursTotal intentionally omitted — REP hours live per-rental-entity.
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
    // AUDIT F3 RESIDUAL FIX (read-side strip): the fields TaxReturn reads back
    // via savedCtx.* but which this extraction previously dropped — most
    // visibly ytdMode/ytdMonth, which made a saved YTD projection revert to
    // full-year on every reload. Defaults mirror writePersonalContext's.
    ytdMode:           parsed.ytdMode           ?? false,
    ytdMonth:          parsed.ytdMonth          ?? 0,
    stGain:            parsed.stGain            ?? 0,
    ltGain:            parsed.ltGain            ?? (parsed.capitalGains ?? 0),
    qualDividends:     parsed.qualDividends     ?? (parsed.qualifiedDividends ?? 0),
    unrecap1250:       parsed.unrecap1250       ?? 0,
    collectiblesGain:  parsed.collectiblesGain  ?? 0,
    nonrecap1231:      parsed.nonrecap1231      ?? 0,
    isActiveParticipant: parsed.isActiveParticipant ?? true,
    rentalAggregationElection: parsed.rentalAggregationElection ?? false,
    priorPassiveLossCarryforward: parsed.priorPassiveLossCarryforward ?? 0,
    priorYearTax:      parsed.priorYearTax      ?? 0,
    priorYearAGI:      parsed.priorYearAGI      ?? 0,
    priorYearLosses:   parsed.priorYearLosses   ?? 0,
    mortgageInt:       parsed.mortgageInt       ?? 0,
    charitableContr:   parsed.charitableContr   ?? 0,
    medicalAmt:        parsed.medicalAmt        ?? 0,
  }
}

// ─── Tax year (standalone, because Dashboard writes it separately) ─────────
export function writeTaxYear(year) {
  sessionStorage.setItem('ts360_taxyear', String(parseInt(year) || defaultTaxYear()))
}

export function readTaxYear() {
  return parseInt(sessionStorage.getItem('ts360_taxyear') || String(defaultTaxYear())) || defaultTaxYear()
}

// ─── Co-op patron flag ────────────────────────────────────────────────────
// CalculateTaxInner manages isCoopPatron as local React state and writes it
// to storage via useEffect on every change. Using writeStep1State there would
// also rewrite entities and k1Total on every checkbox toggle, which is
// unnecessary churn. Atomic helpers keep the contract clean while letting
// callers update one managed key at a time when that's what they want.


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
  // Only persist non-empty values, so a blank field never clobbers a previously
  // stored one. This preserves the skip-if-empty behavior of the inline writes this
  // replaces in Onboarding (audit E-1); readBusinessInfo() coalesces missing keys to ''.
  if (bizName)    sessionStorage.setItem(BIZ_KEYS.name,    bizName)
  if (bizEin)     sessionStorage.setItem(BIZ_KEYS.ein,     bizEin)
  if (bizAddress) sessionStorage.setItem(BIZ_KEYS.address, bizAddress)
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
    return {}   // M5: corrupt JSON → empty map (module convention)
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

/**
 * Remove a single finding's dismissal (undo "mark reviewed").
 * @param {string} recordId
 * @param {string} findingKey
 */
export function removeRiskDismissal(recordId, findingKey) {
  if (!recordId || !findingKey) return
  try {
    const raw = localStorage.getItem(DISMISSED_RISKS_KEY)
    if (!raw) return
    const all = JSON.parse(raw)
    if (all && all[recordId] && all[recordId][findingKey]) {
      delete all[recordId][findingKey]
      localStorage.setItem(DISMISSED_RISKS_KEY, JSON.stringify(all))
    }
  } catch (e) {
    console.error('removeRiskDismissal error:', e)
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

// ─── writeFirstRun ────────────────────────────────────────────────────────────
// Writer to match the existing readFirstRun / clearFirstRun pair. Onboarding.jsx
// previously wrote ts360_first_run directly via sessionStorage (audit R-05). Call
// this instead so all three accessors are in the same place.
export function writeFirstRun() {
  sessionStorage.setItem('ts360_first_run', '1')
}

// ─── writeStep1Entities ──────────────────────────────────────────────────────
// CalculateTaxInner.jsx previously wrote ts360_step1_entities directly via
// sessionStorage.setItem in 8 places (audit R-05). This helper centralises
// every in-component mutation of that key so renames and validation can be
// applied in one place. It does NOT call writeStep1State (which writes the
// full set of canonical entity keys) — this is a lighter, in-flight mutation
// for the working-copy key that CalculateTaxInner manages internally.
export function writeStep1Entities(entities) {
  sessionStorage.setItem('ts360_step1_entities', JSON.stringify(entities))
}

// M4 (audit F-06): reader companion to writeStep1Entities above — CalculateTaxInner's
// mount hydration previously called sessionStorage.getItem + JSON.parse inline.
// Corrupt JSON returns [] (module convention, matching readStep1State at the top of
// this file) rather than throwing out of a mount effect.
export function readStep1Entities() {
  try { return JSON.parse(sessionStorage.getItem('ts360_step1_entities') || '[]') }
  catch { return [] }
}

// M7 (audit OBS-4): readLoadedRecordRaw / readConnectingEntityRaw removed — both
// were readers for keys with no writer anywhere in src/ (dead fallbacks from
// flows replaced long ago). Their call sites in CalculateTaxInner were removed
// in the same batch.

// ─── New-registration flag (M4, audit F-06) ──────────────────────────────────
// Set at signup completion (Onboarding), consumed by the verify-email continue
// handler and the welcome tour to distinguish a brand-new account from a
// returning user on a fresh device. Previously raw sessionStorage calls in
// Onboarding.jsx and WelcomeTourScreen.jsx — the last contract violations in
// the signup path. NOTE: these three accessors are the ONLY sanctioned touch
// points; the Stripe subscribe block in Onboarding.jsx is deliberately not
// refactored (owner directive: payment flow stays untouched).
export function writeNewRegistration() {
  sessionStorage.setItem('ts360_new_registration', '1')
}
export function readNewRegistration() {
  return sessionStorage.getItem('ts360_new_registration') === '1'
}
export function clearNewRegistration() {
  sessionStorage.removeItem('ts360_new_registration')
}

// ─── Full session wipe (M4, audit F-06) ──────────────────────────────────────
// Sign-out is the one flow allowed to clear the whole session store; routing it
// through here keeps the ARCHITECTURE §3 grep clean and gives the wipe a single
// audited home. Swallowing the (vanishingly rare) storage exception preserves
// SignOut's prior behavior — sign-out must never fail on a storage error.
export function clearAllSessionState() {
  try { sessionStorage.clear() } catch { /* noop: sign-out must not fail on storage errors */ }
}

// ─── 2FA nudge helpers ────────────────────────────────────────────────────────
// Dashboard.jsx previously read/wrote ts360_2fa_nudge_dismissed directly (audit
// R-05). These two helpers centralise the key so a rename requires one edit.
export function write2FANudge(dismissed) {
  if (dismissed) {
    sessionStorage.setItem('ts360_2fa_nudge_dismissed', '1')
  } else {
    sessionStorage.removeItem('ts360_2fa_nudge_dismissed')
  }
}

export function read2FANudge() {
  return sessionStorage.getItem('ts360_2fa_nudge_dismissed') === '1'
}

// ─── Go-to-form flag helpers ─────────────────────────────────────────────────
// Dashboard.jsx used sessionStorage.getItem / removeItem on ts360_goto_form
// directly (audit R-05). Used to signal that the user should be sent to the
// Tax Tracker form immediately after login. Centralised here.
export function readGotoForm() {
  return sessionStorage.getItem('ts360_goto_form') === '1'
}

export function clearGotoForm() {
  sessionStorage.removeItem('ts360_goto_form')
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
    taxYear:           parseInt(rec.taxYear)           || defaultTaxYear(),
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
    // AUDIT F3 RESIDUAL FIX (load-path strip): the save path writes these fields
    // (TaxReturn.jsx writePersonalContext / record f1040), but this whitelist
    // dropped them on rehydration — so a saved YTD projection silently reverted
    // to full-year on reload even though the server record carried
    // ytdMode/ytdMonth correctly, and the fields below were quietly lost on
    // every Load & Continue.
    ytdMode:           !!rec.ytdMode,
    ytdMonth:          parseInt(rec.ytdMonth)            || (new Date().getMonth() + 1),
    stGain:            parseFloat(rec.stGain)            || 0,
    unrecap1250:       parseFloat(rec.unrecap1250)       || 0,
    collectiblesGain:  parseFloat(rec.collectiblesGain)  || 0,
    nonrecap1231:      parseFloat(rec.nonrecap1231)      || 0,
    isActiveParticipant: rec.isActiveParticipant !== false,
    rentalAggregationElection: !!rec.rentalAggregationElection,
    priorPassiveLossCarryforward: parseFloat(rec.priorPassiveLossCarryforward) || 0,
    priorSuspendedLoss: parseFloat(rec.priorSuspendedLoss) || 0,
    priorYearTax:      parseFloat(rec.priorYearTax)      || 0,
    priorYearAGI:      parseFloat(rec.priorYearAGI)      || 0,
    priorYearLosses:   parseFloat(rec.priorYearLosses)   || 0,
    mortgageInt:       parseFloat(rec.mortgageInt)       || 0,
    charitableContr:   parseFloat(rec.charitableContr)   || 0,
    medicalAmt:        parseFloat(rec.medicalAmt)        || 0,
    qualDividends:     parseFloat(rec.qualDividends ?? rec.qualifiedDividends) || 0,
  }
}

// ─── Saved records: per-user scoping + one-time legacy migration ───────────────
// Records are stored per user under ts360_records_<email>. Historically the app
// ALSO wrote a shared global key (ts360_records) plus a ts360_records_default
// bucket (for saves made before ts360_email was set), and the Dashboard /
// AIAnalysis loaders scanned EVERY ts360_records* key and merged them. That
// (a) leaked records across different accounts sharing one browser and (b) let a
// stale copy in another bucket resurrect a deleted record. These helpers make the
// per-email bucket the single source of truth: reads return only the current
// user's records, never another account's ts360_records_<otheremail> bucket.
//
// IMPORTANT: use the email exactly as the rest of the app does
// (localStorage 'ts360_email', no case/space normalization) so the key computed
// here matches the keys the save paths write.

function _recordsEmail() {
  return localStorage.getItem('ts360_email') || 'default'
}

// Single source of truth for the per-account records bucket key. Exported so other
// modules (Tax Tracker, TaxReturn) build the exact same key instead of inlining the
// 'ts360_records_' + email string, which could silently drift and orphan saved
// returns under a mismatched bucket (audit D-2).
export function recordsKeyFor(email) {
  return 'ts360_records_' + email
}

function _parseRecArray(raw) {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch (e) { return [] /* M5: corrupt record array → [] */ }
}

// One-time-per-user migration of the legacy shared buckets (the global
// ts360_records key and the pre-login ts360_records_default bucket) into the
// current user's own bucket. Guarded by a per-email flag so it runs exactly once
// and NEVER re-merges (re-merging is what used to resurrect deleted records). The
// shared buckets are removed afterward so they can't leak into a different account
// on the same browser later. The flag key is deliberately NOT prefixed
// 'ts360_records_' so it can't be misread as a records bucket or as an email by
// Settings' email-recovery scan.
function _migrateLegacyRecordsOnce(email) {
  if (!email || email === 'default') return // not signed in — leave shared buckets untouched
  const flag = 'ts360_migrated_records_v2_' + email
  if (localStorage.getItem(flag)) return
  const myKey = recordsKeyFor(email)
  const byId = new Map(_parseRecArray(localStorage.getItem(myKey)).map(r => [r.id, r]))
  let changed = false
  for (const legacyKey of ['ts360_records', 'ts360_records_default']) {
    if (legacyKey === myKey) continue
    const legacy = _parseRecArray(localStorage.getItem(legacyKey))
    if (legacy.length) {
      for (const rec of legacy) {
        if (rec && rec.id != null && !byId.has(rec.id)) { byId.set(rec.id, rec); changed = true }
      }
    }
    localStorage.removeItem(legacyKey) // retire the shared bucket regardless
  }
  if (changed) localStorage.setItem(myKey, JSON.stringify([...byId.values()]))
  localStorage.setItem(flag, '1')
}

/**
 * Read the current user's saved records — and ONLY theirs — newest first.
 * Runs the one-time legacy migration on first call per user. Never reads another
 * account's ts360_records_<otheremail> bucket (that was the cross-account leak).
 */
export function readUserRecords() {
  const email = _recordsEmail()
  _migrateLegacyRecordsOnce(email)
  return _parseRecArray(localStorage.getItem(recordsKeyFor(email)))
    .sort((a, b) => (b.id || 0) - (a.id || 0))
}

/**
 * Persist the current user's saved records to their own bucket only, so writes
 * never re-create the shared global key. Returns the written list.
 */
export function writeUserRecords(recs) {
  const list = Array.isArray(recs) ? recs : []
  localStorage.setItem(recordsKeyFor(_recordsEmail()), JSON.stringify(list))
  return list
}

function _upsertRecordInCache(record) {
  const list = readUserRecords()
  const idx = list.findIndex(r => r && String(r.id) === String(record.id))
  const updated = (idx >= 0
    ? [record, ...list.filter((_, i) => i !== idx)]
    : [record, ...list]
  ).slice(0, 50)
  writeUserRecords(updated)
  return updated
}

/** Fetch records from the server (with one-time local migration); fall back to cache. */
export async function loadUserRecordsFromServer() {
  const email = _recordsEmail()
  const local = readUserRecords()
  if (email === 'default') return local
  await migrateLocalRecordsToServer(local)
  try {
    const server = await fetchRecordsFromServer()
    const sorted = server.sort((a, b) => (b.id || 0) - (a.id || 0))
    writeUserRecords(sorted)
    return sorted
  } catch (e) {
    console.warn('records server fetch failed, using local cache', e)
    return local
  }
}

/** Upsert one record on the server and in the per-user localStorage cache. */
export async function syncRecordToServer(record) {
  if (!record || record.id == null) return record
  const email = _recordsEmail()
  let merged = record
  if (email !== 'default') {
    try {
      const saved = await upsertRecordOnServer(record)
      merged = { ...record, ...saved }
    } catch (e) {
      console.warn('records server upsert failed, cached locally', e)
    }
  }
  _upsertRecordInCache(merged)
  return merged
}

/** Delete a record on the server and from every local ts360_records* bucket. */
export async function deleteUserRecord(recordId) {
  if (recordId == null) return readUserRecords()
  const email = _recordsEmail()
  if (email !== 'default') {
    try {
      await deleteRecordOnServer(recordId)
    } catch (e) {
      console.warn('records server delete failed', e)
    }
  }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith('ts360_records')) continue
    try {
      const arr = JSON.parse(localStorage.getItem(k) || '[]')
      if (Array.isArray(arr)) {
        const next = arr.filter(r => r && r.id !== recordId)
        if (next.length !== arr.length) localStorage.setItem(k, JSON.stringify(next))
      }
    } catch (e) {
      // M5 (audit F-10): a user-initiated delete that silently fails is confusing
      // (the card can reappear after reload) — log it so support can diagnose.
      console.warn('deleteRecord: local purge failed for a storage key', e)
    }
  }
  return readUserRecords()
}

// ─── F-FUNC-02: Active / loaded record pointer ─────────────────────────────
// When a saved record is loaded into the Tax Tracker, Dashboard.loadRecord
// records WHICH record is live so (a) the Dashboard "Active in Tax Tracker"
// badge can mark it and (b) a subsequent "Save This Record" can UPSERT that
// same record instead of forking a brand-new duplicate every save.
//
// Storage keys (session-scoped — the active record is per working session):
//   ts360_active_record_id   — the loaded record's id, as a string
//   ts360_active_record_name — its display name, so the save modal can prefill
//
// Previously these two keys were read/written via raw sessionStorage.getItem/
// setItem in Dashboard only, and the save handlers never consulted them — which
// is exactly why every save minted a fresh id (forking duplicates) and the
// "Active" badge stuck to the stale original. These canonical accessors give the
// save paths (CalculateTaxInner, TaxReturn) and Dashboard one shared contract,
// matching the recordsKeyFor / writeUserRecords convention used above.
//
// clearStep1State() also clears these, so a "+ New Calculation" starts a genuinely
// fresh record rather than silently upserting over the previously-loaded one.

const ACTIVE_RECORD_ID_KEY   = 'ts360_active_record_id'
const ACTIVE_RECORD_NAME_KEY = 'ts360_active_record_name'

/**
 * Mark a record as the one currently loaded into the Tax Tracker.
 * @param {string|number} id   - the record's id
 * @param {string} [name]      - the record's display name (for save-modal prefill)
 */
export function writeActiveRecord(id, name) {
  if (id === null || id === undefined || id === '') {
    clearActiveRecord()
    return
  }
  sessionStorage.setItem(ACTIVE_RECORD_ID_KEY, String(id))
  if (name !== undefined) sessionStorage.setItem(ACTIVE_RECORD_NAME_KEY, String(name || ''))
}

/**
 * The id of the record currently loaded into the Tax Tracker, or null if the
 * session is a fresh (unsaved) calculation. Returned as a string so callers can
 * compare directly against String(rec.id).
 */
export function readActiveRecordId() {
  const v = sessionStorage.getItem(ACTIVE_RECORD_ID_KEY)
  return v ? v : null
}

/** Display name of the loaded record, or '' if none / not set. */
export function readActiveRecordName() {
  return sessionStorage.getItem(ACTIVE_RECORD_NAME_KEY) || ''
}

/** Forget the loaded-record pointer (fresh calculation, or record deleted). */
export function clearActiveRecord() {
  sessionStorage.removeItem(ACTIVE_RECORD_ID_KEY)
  sessionStorage.removeItem(ACTIVE_RECORD_NAME_KEY)
}

// ─── F-FUNC-05: Dashboard entity-preset hand-off ───────────────────────────
// The Dashboard "S-Corp Owner" / "Sole Proprietor" / etc. preset cards imply
// "set me up with an entity of this type." Previously they just navigated to the
// Tax Tracker with no entity, so the "Add an entity to continue" gate still
// blocked. These cards now stash the matching entity-type string here; the Tax
// Tracker reads it once on mount and seeds an entity through its existing
// addEntityOfType() path (the same path the in-app entity picker uses), then
// clears the hint so a later plain "+ New Calculation" doesn't re-seed.
//
// Storage key: ts360_preset_entity_type (session-scoped — a one-shot hand-off).
// The type string MUST be one the Tax Tracker's entity picker recognizes, e.g.
// 'S Corporation' | 'Partnership / LLC' | 'Sole Proprietor / SMLLC' |
// 'Real Estate (Schedule E)'.

const PRESET_ENTITY_TYPE_KEY = 'ts360_preset_entity_type'

/** Stash the preset entity type for the Tax Tracker to seed on next mount. */
export function writePresetEntityType(type) {
  if (type) sessionStorage.setItem(PRESET_ENTITY_TYPE_KEY, String(type))
}

/** Read the pending preset entity type, or '' if none. */
export function readPresetEntityType() {
  return sessionStorage.getItem(PRESET_ENTITY_TYPE_KEY) || ''
}

/** Clear the preset hint once it has been consumed. */
export function clearPresetEntityType() {
  sessionStorage.removeItem(PRESET_ENTITY_TYPE_KEY)
}


// ── Auth & Session ────────────────────────────────────────────────────────────
export function readLoggedIn() { return localStorage.getItem('ts360_logged_in') }
export function writeLoggedIn(val) { localStorage.setItem('ts360_logged_in', val) }
export function removeLoggedIn() { localStorage.removeItem('ts360_logged_in') }
export function readSessionStart() { return localStorage.getItem('ts360_session_start') }
export function writeSessionStart(val) { localStorage.setItem('ts360_session_start', val) }
export function removeSessionStart() { localStorage.removeItem('ts360_session_start') }
export function readToken() {
  try { return localStorage.getItem('ts360_token') } catch { return null /* M5: unreadable storage → treated as signed out */ }
}
export function writeToken(val) { localStorage.setItem('ts360_token', val) }
export function readEmail() { return localStorage.getItem('ts360_email') }
export function writeEmail(val) { localStorage.setItem('ts360_email', val) }
export function readLoginHistory() { return localStorage.getItem('ts360_login_history') }
export function writeLoginHistory(val) { localStorage.setItem('ts360_login_history', val) }
export function readIdleTimeoutMins() { return localStorage.getItem('ts360_idle_timeout_mins') }
export function writeIdleTimeoutMins(val) { localStorage.setItem('ts360_idle_timeout_mins', val) }
export function readCookieConsent() { return localStorage.getItem('ts360_cookie_consent') }
export function writeCookieConsent(val) { localStorage.setItem('ts360_cookie_consent', val) }

// ── User Profile & Billing ────────────────────────────────────────────────────
export function readUserName() { return localStorage.getItem('ts360_userName') }
export function writeUserName(val) { localStorage.setItem('ts360_userName', val) }
export function readPlan() { return localStorage.getItem('ts360_plan') }
export function writePlan(val) { localStorage.setItem('ts360_plan', val) }
export function readBilling() { return localStorage.getItem('ts360_billing') }
export function writeBilling(val) { localStorage.setItem('ts360_billing', val) }
export function readSubscriptionIncomplete() { return localStorage.getItem('ts360_subscription_incomplete') }
export function writeSubscriptionIncomplete(val) { localStorage.setItem('ts360_subscription_incomplete', val) }
export function removeSubscriptionIncomplete() { localStorage.removeItem('ts360_subscription_incomplete') }
export function readMfaEnabled() { return localStorage.getItem('ts360_mfa_enabled') }
export function writeMfaEnabled(val) { localStorage.setItem('ts360_mfa_enabled', val) }

// ── Email Verification ────────────────────────────────────────────────────────
export function readEmailVerified() { return localStorage.getItem('ts360_email_verified') }
export function writeEmailVerified(val) { localStorage.setItem('ts360_email_verified', val) }
export function removeEmailVerified() { localStorage.removeItem('ts360_email_verified') }
export function readPendingEmail() { return localStorage.getItem('ts360_pendingEmail') }
export function writePendingEmail(val) { localStorage.setItem('ts360_pendingEmail', val) }
export function removeEmailConfirmedAck() { localStorage.removeItem('ts360_email_confirmed_ack') }

// ── UI State ──────────────────────────────────────────────────────────────────
export function readDisclaimerSeen() { return localStorage.getItem('ts360_disclaimer_seen') }
export function writeDisclaimerSeen(val) { localStorage.setItem('ts360_disclaimer_seen', val) }

// ── Integrations ──────────────────────────────────────────────────────────────
// D-04 (dead-code audit, Jul 2026): the connected-app label accessors were removed —
// the value was written on OAuth return and cleared on disconnect but READ nowhere
// (no UI ever displayed it). Per-provider state lives in integrations.js.
export function readXeroRefresh() { return localStorage.getItem('ts360_xero_refresh') }
export function writeXeroRefresh(val) { localStorage.setItem('ts360_xero_refresh', val) }

// ── Onboarding ────────────────────────────────────────────────────────────────
export function readOnboardingEntityType() { return localStorage.getItem('ts360_entityType') }
// D-05: writeOnboardingEntityType removed — its only caller was the deleted
// pre-audit onboarding funnel.
