// src/utils/fieldManifest.js
//
// PHASE 2.1 (audit V2 / Pass-6 P6-2, Jul 2026) — THE SHARED FIELD MANIFEST.
//
// Before this file, the persisted personal-context contract lived in FIVE
// hand-synchronized lists: writePersonalContext's destructured parameters,
// its serialized payload, readPersonalContext's extraction, normalizeF1040's
// coercion table (all in sessionState.js), and the engine's YTD annualization
// lists in taxCalc.js. This bug family produced three of the last four
// functionality defects (F3 and its two residual strips, A4-1) — every new
// field had to be added in five places, and missing any one silently dropped
// or reverted user data.
//
// This manifest is now the single declaration. sessionState.js builds its
// write / read / normalize behavior from F1040_FIELD_MANIFEST; taxCalc.js
// imports the YTD annualization lists exported below. ADDING A FIELD MEANS
// ADDING ONE ENTRY HERE (plus, if the engine annualizes it, one string in the
// YTD list — cross-checked by fieldManifest.test.js).
//
// ── Descriptor attributes ────────────────────────────────────────────────────
//   key            canonical field name (the ts360_f1040 JSON key)
//   kind           'string' | 'int' | 'float' | 'bool' | 'boolDefaultTrue' | 'array'
//   def            default (write path when the caller omits the field; read
//                  path when the stored blob lacks it)
//   dyn            'taxYear' — default is defaultTaxYear() evaluated at call time
//   readFallbacks  legacy/alias keys tried (nullish-chain) AFTER `key` on READ
//   normFallbacks  alias keys tried inside the coercion on NORMALIZE
//   normDef        default override on the NORMALIZE path only (ytdMonth)
//   writeFallbacks alias keys tried (non-undefined) when the caller omits `key`
//                  on WRITE. Used by ltGain: normalize deliberately omits it
//                  (see below), so the load path (writePersonalContext ∘
//                  normalizeF1040) previously manufactured ltGain:0 — which
//                  read-side callers then preferred over the real capitalGains
//                  (0 is not nullish), silently dropping LT gains from every
//                  SESSION reader (compare modal, simulator) on a freshly
//                  loaded record. TaxReturn survived only via its own
//                  capitalGains-first seeding. Latent pre-manifest bug, found
//                  by the Phase 2.2 selector's invariant tests; fixed at the
//                  source: the stored blob is now self-consistent.
//   normalize      false → field is OMITTED from normalizeF1040's output.
//                  Used only by ltGain: records store capitalGains as the
//                  canonical LT figure and TaxReturn seeds state from
//                  savedCtx.capitalGains || savedCtx.ltGain, so normalize has
//                  never emitted ltGain. Emitting it (default 0) would make
//                  writePersonalContext store ltGain:0, which readPersonalContext
//                  would then prefer over the capitalGains fallback (0 is not
//                  nullish) — silently zeroing loaded LT gains. Deliberately
//                  preserved; unify only with a coordinated TaxReturn change.
//   legacyInvert   'useStandardDed' — useItemized's inverted legacy name
//
// Behavioral contracts preserved exactly from the pre-manifest code (these are
// pinned by sessionState.test.js / normalizeF1040.audit.test.js and by the
// generated tests in fieldManifest.test.js):
//   WRITE: a field participates iff its value !== undefined, else `def`;
//          keys not in the manifest are never serialized (repHours guarantee).
//   READ:  raw nullish-coalescing (NO numeric coercion) — falsy 0/false/'' are
//          preserved; manualK1s gets an Array.isArray guard.
//   NORMALIZE: parseFloat/parseInt `|| def`, '!!' for bool,
//          '!== false' for boolDefaultTrue, 'value || def' for string.

import { DEFAULT_TAX_YEAR } from '../lib/constants.js'

// Mirrors sessionState's defaultTaxYear — duplicated here (one line, pure) to
// keep the import graph acyclic: sessionState imports THIS module.
const defaultTaxYear = () => Math.min(new Date().getFullYear(), DEFAULT_TAX_YEAR)
const currentMonth = () => new Date().getMonth() + 1

export const F1040_FIELD_MANIFEST = [
  { key: 'filingStatus',       kind: 'string', def: 'single' },
  { key: 'taxYear',            kind: 'int',    dyn: 'taxYear' },
  { key: 'dependents',         kind: 'int',    def: 0 },
  { key: 'w2Income',           kind: 'float',  def: 0 },
  { key: 'w2Withheld',         kind: 'float',  def: 0 },
  { key: 'rentalIncome',       kind: 'float',  def: 0 },
  { key: 'rentalExpenses',     kind: 'float',  def: 0 },
  { key: 'capitalGains',       kind: 'float',  def: 0 },
  { key: 'interest',           kind: 'float',  def: 0 },
  { key: 'dividends',          kind: 'float',  def: 0 },
  { key: 'qualifiedDividends', kind: 'float',  def: 0, normFallbacks: ['qualDividends'] },
  { key: 'form4797',           kind: 'float',  def: 0 },
  { key: 'manualK1s',          kind: 'array',  def: [] },
  { key: 'isREP',              kind: 'bool',   def: false },
  // §469(c)(7)(B) REP hours are deliberately NOT in this manifest — they live
  // per-rental-entity (entity.repHoursRE / repHoursTotal). Their absence here
  // IS the mechanism that keeps them out of ts360_f1040 (pinned by tests).
  { key: 'priorSuspendedLoss', kind: 'float',  def: 0 },   // F-01 §1366(d)
  { key: 'useItemized',        kind: 'bool',   def: false, legacyInvert: 'useStandardDed' },
  { key: 'itemizedAmt',        kind: 'float',  def: 0, readFallbacks: ['itemizedDed'],       normFallbacks: ['itemizedDed'] },
  { key: 'saltAmount',         kind: 'float',  def: 0 },
  { key: 'hasISO',             kind: 'bool',   def: false },
  { key: 'isoBargainElement',  kind: 'float',  def: 0 },
  { key: 'estPaid',            kind: 'float',  def: 0, readFallbacks: ['estimatedPayments'], normFallbacks: ['estimatedPayments'] },
  { key: 'priorYearQBILoss',   kind: 'float',  def: 0 },
  { key: 'socialSecurity',     kind: 'float',  def: 0 },
  { key: 'iraDistributions',   kind: 'float',  def: 0 },
  { key: 'selfEmpHealthIns',   kind: 'float',  def: 0 },
  { key: 'hsaDeduction',       kind: 'float',  def: 0 },
  { key: 'studentLoanInt',     kind: 'float',  def: 0 },
  { key: 'selfEmpRetirement',  kind: 'float',  def: 0 },
  { key: 'nolCarryforward',    kind: 'float',  def: 0 },
  // AUDIT F3 (write-side + read-side + load-path strips, Jul 2026): the fields
  // below are the exact set the three pre-manifest strips kept losing.
  { key: 'ytdMode',            kind: 'bool',   def: false },
  { key: 'ytdMonth',           kind: 'int',    def: 0, normDef: currentMonth },
  { key: 'stGain',             kind: 'float',  def: 0 },
  { key: 'ltGain',             kind: 'float',  def: 0, readFallbacks: ['capitalGains'], writeFallbacks: ['capitalGains'], normalize: false },
  { key: 'qualDividends',      kind: 'float',  def: 0, readFallbacks: ['qualifiedDividends'], normFallbacks: ['qualifiedDividends'] },
  { key: 'unrecap1250',        kind: 'float',  def: 0 },
  { key: 'collectiblesGain',   kind: 'float',  def: 0 },
  { key: 'nonrecap1231',       kind: 'float',  def: 0 },
  { key: 'isActiveParticipant', kind: 'boolDefaultTrue', def: true },
  { key: 'rentalAggregationElection', kind: 'bool', def: false },  // F6 §1.469-9(g)
  { key: 'priorPassiveLossCarryforward', kind: 'float', def: 0 },
  { key: 'priorYearTax',       kind: 'float',  def: 0 },
  { key: 'priorYearAGI',       kind: 'float',  def: 0 },
  { key: 'priorYearLosses',    kind: 'float',  def: 0 },
  { key: 'mortgageInt',        kind: 'float',  def: 0 },
  { key: 'charitableContr',    kind: 'float',  def: 0 },
  { key: 'medicalAmt',         kind: 'float',  def: 0 },
  // PHASE 2.1 NEW FIELDS — §1212(b) prior-year capital-loss carryforwards
  // (audit F10 / P6-1 follow-through). BALANCES: deliberately absent from
  // YTD_SCALE_ENGINE_FIELDS below, like every other carryforward. These are
  // the first fields to enter the contract through the manifest alone.
  { key: 'capLossCarryforwardST', kind: 'float', def: 0 },
  { key: 'capLossCarryforwardLT', kind: 'float', def: 0 },
]

const _dynDefault = (f) => (f.dyn === 'taxYear' ? defaultTaxYear() : f.def)

/** WRITE path — builds the exact ts360_f1040 payload writePersonalContext
 *  serializes. A field participates iff the caller supplied a non-undefined
 *  value; unknown input keys are never serialized. */
export function buildPersonalContextPayload(input = {}) {
  const out = {}
  for (const f of F1040_FIELD_MANIFEST) {
    let v = input[f.key]
    for (const alt of (f.writeFallbacks || [])) { if (v === undefined) v = input[alt] }
    out[f.key] = v !== undefined ? v : _dynDefault(f)
  }
  return out
}

/** READ path — extracts the manifest fields from a parsed ts360_f1040 blob.
 *  Raw nullish-coalescing over [key, ...readFallbacks]; NO numeric coercion
 *  (falsy 0 / false / '' are valid stored values and are preserved). */
export function extractPersonalContext(parsed) {
  const out = {}
  for (const f of F1040_FIELD_MANIFEST) {
    if (f.kind === 'array') {
      out[f.key] = Array.isArray(parsed[f.key]) ? parsed[f.key] : _dynDefault(f)
      continue
    }
    if (f.legacyInvert) {
      out[f.key] = parsed[f.key]
        ?? (parsed[f.legacyInvert] !== undefined ? !parsed[f.legacyInvert] : _dynDefault(f))
      continue
    }
    let v = parsed[f.key]
    for (const alt of (f.readFallbacks || [])) v = v ?? parsed[alt]
    out[f.key] = v ?? _dynDefault(f)
  }
  return out
}

/** NORMALIZE path — coerces a possibly-stringly-typed record f1040 object to
 *  the numeric/boolean contract writePersonalContext accepts. Fields marked
 *  normalize:false are omitted (see the ltGain note in the header). */
export function normalizeF1040Fields(rec = {}) {
  const out = {}
  for (const f of F1040_FIELD_MANIFEST) {
    if (f.normalize === false) continue
    const def = f.normDef ? f.normDef() : _dynDefault(f)
    let raw = rec[f.key]
    for (const alt of (f.normFallbacks || [])) raw = raw ?? rec[alt]
    switch (f.kind) {
      case 'string': out[f.key] = raw || def; break
      case 'int':    out[f.key] = parseInt(raw)   || def; break
      case 'float':  out[f.key] = parseFloat(raw) || def; break
      case 'bool':
        out[f.key] = f.legacyInvert
          ? (rec[f.key] !== undefined ? !!rec[f.key]
              : (rec[f.legacyInvert] !== undefined ? !rec[f.legacyInvert] : def))
          : !!raw
        break
      case 'boolDefaultTrue': out[f.key] = raw !== false; break
      case 'array': out[f.key] = Array.isArray(raw) ? raw : def; break
      default: out[f.key] = raw ?? def
    }
  }
  return out
}

// ── ENGINE YTD ANNUALIZATION LISTS (moved verbatim from src/taxCalc.js) ──────
// AUDIT A4-2 FIX (Jul 2026): "give me YTD numbers and I'll project your
// full-year liability" — deduction FLOWS must annualize like income flows.
// Previously itemized/SALT/medical/charitable stayed at their YTD amounts, so
// projected deductions were understated (and the SALT cap / 0.5% floor / §170(p)
// tests ran against half-sized numbers). DELIBERATELY NOT SCALED (documented
// decisions): estPaid/estQ1-4 (actual payments to date, §6654 compares them to
// the annualized liability); isoBargainElement (a discrete exercise event, not
// a ratable flow); prior-year figures and ALL carryforwards/balances —
// including the new capLossCarryforwardST/LT (§1212(b) balances).
// NOTE: these are ENGINE input keys (w2, intInc, f4797Inc, …), not the session
// field names above — the session→engine vocabulary translation happens in
// TaxReturn/EntityCompareModal. fieldManifest.test.js pins membership.
export const YTD_SCALE_ENGINE_FIELDS = [
  'w2', 'k1Total', 'rentalNet',
  'stGain', 'ltGain', 'intInc', 'divInc', 'qualDiv',
  'f4797Inc', 'taxableSS', 'iraIncome',
  'selfEmpHealthIns', 'hsaDeduction', 'studentLoanInt', 'selfEmpRetirement',
  'itemizedAmt', 'saltAmount', 'medicalExpenses', 'charitableContr',   // A4-2
]
// AUDIT A4-1 FIX (Jul 2026): `distributions` is a FLOW — YTD distributions must
// annualize or the projected §1368 excess-distribution gain evaporates (audit-4
// probe: half-year inputs produced gain $0 instead of $25,000). Balance-sheet
// fields (stockBasis, debtBasis, beginningAAA, accumulatedEP, box17V_ubia,
// qbiLossCarryforward) remain correctly UNscaled — they are point-in-time amounts.
export const YTD_SCALE_ENTITY_FIELDS = ['k1', 'netProfit', 'box11_12', 'box12_13', 'box17V_wages', 'officerW2', 'distributions']
