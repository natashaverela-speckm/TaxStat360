// src/utils/entityPredicates.js
// Shared entity-type predicates and entity data helpers — audit findings
// CC-M03 (isScheduleCType duplicated in TaxReturn.jsx + AIAnalysis.jsx),
// CC-M04 (getEntityNetProfit dual-path lookup), and F-M02 (0% ownership
// treated as 100% due to JS falsy evaluation).
//
// THIS FILE IS THE SINGLE SOURCE for entity-type classification and normalization.
// Do not re-implement normalizeEntityType or any is*Entity predicate in a component.
// Module 1 removed a divergent copy of normalizeEntityType that had been re-added in
// Dashboard.jsx; if you find yourself writing another, import from here instead.
//
// Two representations exist by design (see the representation note in constants.js):
//   • UI / input labels (Vocabulary A): 'Sole Proprietor / SMLLC', 'Partnership / LLC', …
//   • Engine-internal canonical form (Vocabulary B): 'Sole Proprietor / Single-Member LLC',
//     'Partnership / MMLLC — Active' / '— Passive', …
// normalizeEntityType() is the one-way bridge A → B. The regex predicates below match
// EITHER representation, so prefer them for any gating test.

// nf(): comma-safe, finite-by-construction numeric parse — required by the
// getEntityPnlNet helpers below. money.js has no imports of its own, so this
// introduces no cycle (constants → money/entityPredicates → taxCalc → UI).
import { nf } from './money.js'

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
 * Issues a Schedule K-1 to the owner — TRUE only for S corporations (Form 1120-S)
 * and partnerships / MMLLCs (Form 1065). These are the only entity types whose
 * results reach the personal return *via a K-1*.
 *
 * Deliberately FALSE for:
 *   • Sole Proprietor / SMLLC — reports on Schedule C; no K-1.
 *   • Real Estate (Schedule E) — directly-held rental on Schedule E, Part I; no K-1
 *     (a rental owned *through* a partnership/S-corp is entered as that entity instead).
 *   • C Corporation — entity-level tax; distributes dividends, not a K-1.
 *
 * Use this — not isPassthroughEntity — wherever the UI says "K-1": isPassthroughEntity
 * also matches sole props (and "income flows to the owner" is true for them, but *not*
 * through a K-1). Matches EITHER vocabulary: layer-1 "Partnership / LLC" and layer-2
 * "Partnership / MMLLC — Active/Passive" both qualify (a passive partner still gets a K-1).
 */
export const issuesK1Entity = (t) =>
  isSCorpEntity(t) || /partnership|mmllc|partner/i.test(t || '')

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
// OBS-3 RESOLVED (Batch 7, Jul 2026): unified on the derivation rule. Previously
// this read ONLY a stored value (pnl.netProfit, else legacy e.netProfit) via
// comma-unsafe parseFloat — so a record whose pnl carried gross/expenses but no
// stored net showed $0 on the AIAnalysis surfaces while deriving correctly
// elsewhere. Now: any pnl data present → getEntityPnlNet (stored net, else
// gross − expenses, comma-safe); no pnl at all → the legacy top-level
// e.netProfit field (pre-pnl records), now comma-safe via nf.
export function getEntityNetProfit(e) {
  const pnl = e?.pnl
  if (pnl && (pnl.netProfit ?? pnl.grossRevenue ?? pnl.totalExpenses) !== undefined) {
    return getEntityPnlNet(e)
  }
  return nf(e?.netProfit)
}

// ── P&L-derived net profit (M3, audit F-04) ──────────────────────────────────
//
// SINGLE SOURCE for the derivation rule that previously existed as 11 inline
// copies across TaxReturn.jsx, CalculateTaxInner.jsx, and AIAnalysis.jsx:
//
//     nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))
//
// i.e. use the stored/synced net profit when present; otherwise DERIVE it from
// gross revenue minus total expenses. All parsing goes through nf(), which is
// comma-safe and finite-by-construction.
//
// RELATIONSHIP TO getEntityNetProfit() ABOVE (OBS-3, RESOLVED Batch 7):
// getEntityNetProfit() now DELEGATES here whenever any pnl data exists, and
// falls back to the legacy top-level e.netProfit only for pre-pnl records.
// One derivation rule everywhere; the historical divergence (AIAnalysis
// showing $0 for gross/expenses-only records) is gone.

/** P&L net profit: stored pnl.netProfit, else derived grossRevenue − totalExpenses.
 *  Comma-safe (nf). Missing/absent pnl → 0. Does NOT read the legacy e.netProfit
 *  field (matching the inline expression it replaces). */
export function getEntityPnlNet(e) {
  const pnl = e?.pnl || {}
  return nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))
}

/** Owner's rounded share of the P&L net: Math.round(net × own% / 100).
 *  ownPct() handles missing/invalid ownership as 100% and explicit 0 as 0%
 *  (F-M02). Equivalent to every inline `Math.round(net * ownPct(e.own) / 100)`
 *  it replaces, including the `ownPct(e.own ?? 100)` variant (identical result:
 *  ownPct(undefined) is already 100). */
export function getEntityPnlNetShare(e) {
  return Math.round(getEntityPnlNet(e) * ownPct(e?.own) / 100)
}

/**
 * Resolves an entity's K-1 (or K-1-equivalent) share for tax computation, honoring
 * three possible input shapes in priority order (independent audit, Aug 2026 —
 * Finding 2: partner's distributive share, IRC §702(a)/§704(b)):
 *
 *  1. An explicit e.k1 dollar amount — already the OWNER's final share (used by
 *     synthetic/test entities and any future explicit-override field). 0 is a
 *     valid, intentional value (e.g. a fully §1366(d) basis-suspended K-1 loss)
 *     and is NOT treated as "missing" (F3 — §199A x §1366(d)).
 *  2. K-1 direct-entry mode (e.k1DirectMode — set by the ManualEntryPanel "Have a
 *     K-1? Enter Box 1 directly" toggle, FINDING-1 FIX). The user typed Box 1
 *     exactly as shown on a real K-1, which the field's own instructions describe
 *     as "already scaled by your ownership percentage on the K-1." Applying
 *     Ownership % again on top of an already-allocated K-1 figure double-prorates
 *     the owner's income. Returns the stored P&L net AS-IS, unscaled.
 *  3. Gross-receipts / P&L entry mode (the default): e.pnl carries the ENTITY's
 *     total P&L, which must be scaled by Ownership % to derive the owner's share.
 *
 * SINGLE SOURCE for this resolution. Every call site in taxCalc.js that resolves an
 * entity's K-1 share (SE tax, QBI, the basis waterfall, distributions, the
 * reasonable-comp alert, and the entity income breakdown) must use this function
 * rather than re-inlining `nf(e.k1) || Math.round(netProfit * ownPct(e.own) / 100)`
 * — that inline pattern is exactly what silently double-prorated a K-1-direct-entry
 * partner's income before this fix (a 60%-owned partner's already-allocated $132,000
 * Box 1 entry was displayed and taxed as $79,200).
 */
export function getEntityK1Share(e) {
  if (!e) return 0
  if (e.k1 !== undefined) return nf(e.k1)
  // Built on getEntityNetProfit() (not getEntityPnlNet()) so this also supports
  // pre-pnl legacy records (top-level e.netProfit, no e.pnl object at all) — the
  // same dual-path data model getEntityNetProfit() already resolves (CC-M04 / OBS-3).
  if (e.k1DirectMode) return getEntityNetProfit(e)
  return Math.round(getEntityNetProfit(e) * ownPct(e?.own) / 100)
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


/**
 * Does the What-If Simulator's "+$20K Salary" (officer W-2) scenario apply?
 * Only corporations pay a W-2 officer salary. Sole Proprietors / SMLLCs and
 * Partnerships / LLCs take owner draws or guaranteed payments — not officer
 * compensation — and Real Estate has no salary line, so the scenario is hidden
 * for every non-corporate entity. (Audit re-review #2, Jul 2026.)
 */
export function officerSalaryScenarioApplies(entityType) {
  return isSCorpEntity(entityType) || isCCorpEntity(entityType)
}
