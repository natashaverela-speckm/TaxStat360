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
import { buildPersonalContextPayload, extractPersonalContext, normalizeF1040Fields } from './fieldManifest.js'

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
export function writePersonalContext(input = {}) {
  // PHASE 2.1 (audit V2 / Pass-6 P6-2): the persisted-field contract now lives in
  // ONE place — src/utils/fieldManifest.js. This serializes exactly the manifest
  // fields: unknown keys (e.g. per-entity repHoursRE/repHoursTotal) are never
  // written, omitted fields get their manifest defaults, and adding a field to
  // the contract means adding ONE manifest entry — not editing five lists.
  // (The former three-strips bug family — F3 write/read/load — is structurally
  // impossible now: write, read, and normalize all derive from the same table.)
  sessionStorage.setItem('ts360_f1040', JSON.stringify(buildPersonalContextPayload(input)))
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
  // PHASE 2.1: explicit per-field extraction (NOT a spread merge — unknown keys
  // from older sessionStorage data must not leak through) now derives from the
  // manifest. `??` semantics preserved: falsy 0/false/'' are valid stored values;
  // legacy-name fallbacks (useStandardDed, itemizedDed, estimatedPayments,
  // ltGain←capitalGains, qual-dividend aliases) are declared per-field in
  // src/utils/fieldManifest.js.
  return extractPersonalContext(parsed)
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
  // PHASE 2.1: coercion table (parseFloat/parseInt/!!/"!== false"), the renamed-
  // field migrations, the divergent ytdMonth default (current month here, 0 on
  // the read path), and the deliberate ltGain omission are all declared
  // per-field in src/utils/fieldManifest.js — one table drives write, read,
  // and normalize.
  return normalizeF1040Fields(rec)
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

// ── F4 (consistency audit, Jul 2026): helpers so UI components stop reaching
//    around this data layer with raw localStorage calls. Each preserves the
//    original key and private-mode tolerance (try/catch) exactly. ────────────

// Email-verification banner UI flags (EmailVerificationBanner.jsx)
export function readEmailBannerCollapsed() {
  try { return localStorage.getItem('ts360_email_banner_collapsed') === '1' } catch (_e) { return false }
}
export function writeEmailBannerCollapsed(collapsed) {
  try {
    if (collapsed) localStorage.setItem('ts360_email_banner_collapsed', '1')
    else localStorage.removeItem('ts360_email_banner_collapsed')
  } catch (_e) { /* private mode: non-persistent is acceptable for UI state */ }
}
export function readEmailConfirmedAck() {
  try { return localStorage.getItem('ts360_email_confirmed_ack') === '1' } catch (_e) { return false }
}
export function writeEmailConfirmedAck() {
  try { localStorage.setItem('ts360_email_confirmed_ack', '1') } catch (_e) { /* noop */ }
}
export function clearEmailConfirmedAck() {
  try { localStorage.removeItem('ts360_email_confirmed_ack') } catch (_e) { /* noop */ }
}

// Federal disclosure banner dismissal (FederalDisclosureBanner.jsx)
export function readFedBannerDismissed() {
  try { return localStorage.getItem('ts360_fed_banner_dismissed') === '1' } catch (_e) { return false }
}
export function writeFedBannerDismissed() {
  try { localStorage.setItem('ts360_fed_banner_dismissed', '1') } catch (_e) { /* noop */ }
}

// Trusted-device record for 2FA skip (Onboarding.jsx)
export function readTrustedDevice() {
  try { return JSON.parse(localStorage.getItem('ts360_trusted_device') || 'null') } catch (_e) { return null }
}
export function writeTrustedDevice(record) {
  try { localStorage.setItem('ts360_trusted_device', JSON.stringify(record)) } catch (_e) { /* convenience only */ }
}
export function clearTrustedDevice() {
  try { localStorage.removeItem('ts360_trusted_device') } catch (_e) { /* noop */ }
}

// Full on-device data bundle for the Settings 'export my data' feature.
export function exportAllDeviceData() {
  const data = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('ts360_') || key === 'plan' || key === 'userName')) {
        try { data[key] = JSON.parse(localStorage.getItem(key)) }
        catch (_e) { data[key] = localStorage.getItem(key) }
      }
    }
  } catch (_e) { /* private mode: return whatever was collected */ }
  return data
}
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
// Audit P0-#1: readXeroRefresh / writeXeroRefresh are gone. A Xero refresh token is a
// long-lived, re-mintable credential to the customer's books; it must never be held in
// the browser. It now lives only in the user's server-side record. (SignOut.jsx still
// clears the legacy 'ts360_xero_refresh' key, and purgeLegacyIntegrationTokens() scrubs
// it on load, so values written by the old build are actively removed.)

// ── Onboarding ────────────────────────────────────────────────────────────────
export function readOnboardingEntityType() { return localStorage.getItem('ts360_entityType') }
// D-05: writeOnboardingEntityType removed — its only caller was the deleted
// pre-audit onboarding funnel.

// ── D-3 (A) Explicit sync (owner-approved Jul 8 2026): the dirty flag ─────────
// True when the working session has edits not yet saved to a record. Set by
// the Step-1/Step-2 persist effects, cleared on successful save and on record
// load (a fresh load IS the baseline). Read by the Dashboard before loading a
// different record over unsaved work, and by TaxReturn's beforeunload guard.
const DIRTY_KEY = 'ts360_dirty'
export function writeDirtyFlag(v) {
  try { sessionStorage.setItem(DIRTY_KEY, v ? '1' : '') } catch { /* private mode */ }
}
export function readDirtyFlag() {
  try { return sessionStorage.getItem(DIRTY_KEY) === '1' } catch { return false }
}

// ─── Step-1 device-local draft (audit #6) ─────────────────────────────────────
// Working entries live in sessionStorage, which the browser wipes on tab/window
// close and which is per-tab — so a user who typed entity financials and then
// closed the tab (or was idle-expired and reopened elsewhere) lost the work, even
// though the Sign-In screen promises "your in-progress entries are still here."
// We mirror the working copy to localStorage so it survives a tab close, a browser
// restart, and re-login in another tab on the SAME device. It is device-local and
// never transmitted. Cleared on explicit sign-out (SignOut.jsx AUTH_KEYS) and after
// a successful Save (CalculateTaxInner). It is scoped to the owning email and
// rehydrated ONLY for that same account, so a draft can never leak one user's
// figures to the next person on a shared browser (mirrors the ts360_records_<email>
// convention). Account deletion wipes it via wipeAccountLocalData's ts360_* sweep.
const STEP1_DRAFT_KEY = 'ts360_step1_draft'
function _draftEmail() { return localStorage.getItem('ts360_email') || 'default' }

export function writeStep1Draft(entities, taxYear) {
  try {
    if (!Array.isArray(entities) || entities.length === 0) {
      localStorage.removeItem(STEP1_DRAFT_KEY)
      return
    }
    localStorage.setItem(STEP1_DRAFT_KEY, JSON.stringify({
      email: _draftEmail(), entities, taxYear, savedAt: Date.now(),
    }))
  } catch { /* storage full/disabled: draft is best-effort, never fatal */ }
}

export function readStep1Draft() {
  try {
    const raw = localStorage.getItem(STEP1_DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    // Only the owning account may rehydrate — never surface another user's draft.
    return (d && d.email === _draftEmail()) ? d : null
  } catch { return null }
}

export function clearStep1Draft() {
  try { localStorage.removeItem(STEP1_DRAFT_KEY) } catch { /* noop */ }
}
