// src/utils/entityPredicates.js
// Shared entity-type predicates and entity data helpers — audit findings
// CC-M03 (isScheduleCType duplicated in TaxReturn.jsx + AIAnalysis.jsx),
// CC-M04 (getEntityNetProfit dual-path lookup), and F-M02 (0% ownership
// treated as 100% due to JS falsy evaluation).
//
// All components import from here. One definition, no divergence risk.

// ── Entity type predicates ────────────────────────────────────────────────────

/** Sole Proprietor / Single-Member LLC — files Schedule C (IRC §1402) */
export const isScheduleCType = (type = '') =>
  /sole.prop|single.member|smllc/i.test(type)

/** S Corporation — files Form 1120-S; K-1 flows via Schedule E, Part II */
export const isSCorpEntity = (t) => /s.?corp/i.test(t || '')

/** C Corporation — 21% flat entity tax; no personal K-1 pass-through */
export const isCCorpEntity = (t) => /c.?corp/i.test(t || '')

/** Any pass-through entity — income flows to the owner's personal return */
export const isPassthroughEntity = (t) =>
  /partnership|llc|s.?corp|sole/i.test(t || '')

/**
 * Real Estate (Schedule E) — personally-held rental property, NOT a K-1
 * trade-or-business. Added for REG-01 (§469 Step-1 rental routing): the tax
 * engine uses this to pull Real Estate entities out of the K-1 income stream
 * and route their net through the §469 passive-activity-loss machinery instead
 * of treating the loss as fully deductible nonpassive income.
 *
 * Matches the same labels normalizeEntityType() leaves unchanged for rentals
 * ("Real Estate (Schedule E)", "Schedule E", etc.).
 */
export const isRealEstateEntity = (t) => /real.?estate|schedule.?e/i.test(t || '')

/**
 * Map any entity-type label (Step-1 UI values, legacy strings) to the canonical
 * ENTITY_TYPES string the tax engine keys on. The Step-1 dropdown emits friendly
 * labels ("Sole Proprietor / SMLLC", "Partnership / LLC") that do NOT match the
 * engine's exact-match SE_SUBJECT_TYPES / PASSTHROUGH_ENTITY_TYPES arrays — so
 * without normalization sole proprietors and partnerships silently received NO
 * self-employment tax. Idempotent: canonical strings pass through unchanged.
 *
 * "Partnership / LLC" carries no active/passive distinction in the current UI, so we
 * default to Active (SE-subject) — the correct default for materially-participating
 * owners and far safer than charging no SE tax at all. An explicit "passive" label
 * still resolves to the Passive variant.
 */
export function normalizeEntityType(type) {
  const t = String(type || '').trim()
  if (!t) return t
  if (isCCorpEntity(t)) return 'C Corporation'
  if (isSCorpEntity(t)) return 'S Corporation'
  if (isScheduleCType(t)) return 'Sole Proprietor / Single-Member LLC'
  if (/real.?estate|schedule.?e/i.test(t)) return t  // rental — not a SE/business entity
  if (/partnership|mmllc|partner|llc/i.test(t)) {
    return /passive/i.test(t) ? 'Partnership / MMLLC — Passive' : 'Partnership / MMLLC — Active'
  }
  return t
}

// ── Data model helpers ────────────────────────────────────────────────────────

/**
 * Normalize entity net profit — resolves the dual-path data model (CC-M04).
 * Newer records store net profit in e.pnl.netProfit; older records stored it
 * directly on e.netProfit. The pnl path is always preferred.
 */
export function getEntityNetProfit(e) {
  return parseFloat(e?.pnl?.netProfit ?? e?.netProfit ?? 0) || 0
}

/**
 * Resolve ownership percentage safely — fixes the JS falsy 0% bug (F-M02).
 *
 * The legacy pattern (parseFloat(e.own) || 100) silently treats explicit 0%
 * ownership as 100% because 0 is falsy in JavaScript. This helper uses
 * Number.isFinite() to distinguish a valid 0 from missing/invalid input.
 *
 * Returns 100 for: undefined, null, '', NaN, non-numeric strings.
 * Returns 0 for: '0', 0 (explicit zero ownership — e.g. silent partner).
 * Returns the parsed number for all other valid numeric inputs.
 */
export function ownPct(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 100
}
