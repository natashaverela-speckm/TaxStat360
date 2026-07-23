// src/utils/calcSelector.js
//
// PHASE 2.2 (roadmap; cures Pass-6 review finding R-2) — THE SHARED
// CALCULATION SELECTOR.
//
// One read-only façade over the tax engine, so every display surface that
// wants a liability / AGI / marginal-rate figure gets THE ENGINE'S figure —
// never a local re-aggregation. Before this module, AIAnalysis computed its
// own `totalIncome` and `agi` by summing record fields (no §1211(b) clamp, no
// PAL machinery, no adjustments), which mis-gated strategy cards in exactly
// the loss years where this product's real-estate investors live. That is the
// same display-vs-engine disagreement disease the audits eliminated for tax
// RULES (single-sourced, CI-enforced) — extended here to figure CONSUMPTION.
//
// ─────────────────────────────────────────────────────────────────────────────
// PRE-LAUNCH AUDIT — BLOCKER 2 (Jul 2026). The façade existed but AIAnalysis was
// still recomputing §199A behind its back, from a base that omitted the §164(f)
// half-of-SE-tax deduction. Result: THREE different QBI deductions for one record.
//
//   Tax Tracker (engine):  20% × (AGI − standard deduction)          $168,862
//   Audit Risk Scan:       20% × (gross income − standard deduction) $173,560
//   Ask Aria:              20% × business income                     $180,000
//   Correct:               capped at 50% of $0 W-2 wages             $400
//
// The QBI detail fields (qbiLimitApplied / qbiCaps / qbiAggregation*) were the
// reason AIAnalysis felt it had to re-run calcQBI: the selector returned the
// NUMBER but not the REASON, so the cards recomputed to get their copy strings.
// They are now part of the summary, so no consumer has any reason to recompute.
//
// RULE: if a surface needs a tax figure, it reads it from here. If the figure it
// needs is missing, ADD IT TO _SUMMARY_KEYS — never recompute locally. The
// architecture invariant test enforces the single production call site.
// ─────────────────────────────────────────────────────────────────────────────
//
// Architecture: this module owns NO tax math and NO translation of its own.
//   • Vocabulary translation reuses toEngineContext (audit F2's fix) — calling
//     it with entityIdx = -1 keeps EVERY entity's officer W-2 / Box 17K in the
//     aggregation (the "whole return" flavor; the compare modal excludes the
//     focal entity because it substitutes scenarios for it).
//   • Validation reuses the M2 calculation guard, which is enforced INSIDE
//     calcTaxReturn's entry — invalid inputs come back as { ok:false, error }
//     rather than throwing into a card renderer.
//   • The summary object is frozen: this is a SELECTOR. Consumers that need
//     to change inputs go through the Tracker, not through this façade.
//
// Consumers: AIAnalysis (strategy-card gating AND the §199A cards), Aria's
// session grounding, Step-1 provisional footer, Dashboard record cards.

import { calcTaxReturn, sumK1FlowThrough } from '../lib/taxCalc.js'
import { safeCalc } from './calcGuard.js'
import { toEngineContext } from '../components/EntityCompareModal.jsx'
import { readPersonalContext, readStep1State, normalizeF1040 } from './sessionState.js'
import { nf } from './money.js'

/** Fields the whole-return summary needs that the compare modal's translator
 *  deliberately doesn't carry (it models entity swaps, not full returns). */
function _wholeReturnExtras(pc, entities) {
  return {
    entities: Array.isArray(entities) ? entities : [],
    // R-2b FIX (Jul 2026, audit F1/F3): calcTaxReturn ingests pass-through income via the
    // top-level k1Total field (NOT by re-deriving it from `entities` internally — that
    // array drives officer-W2/§469 handling, not the K-1 aggregate). The selector omitted
    // k1Total, so EVERY figure it produced (grossIncome, taxableIncome, marginalRate,
    // quarterlyRecommended) silently dropped all K-1 income — a $70K-W2 + $230K-K1 owner
    // summarized as a $70K return (12% rate, ~$1,243/qtr) instead of $300K (32% rate).
    // Use the single canonical aggregation rule (sumK1FlowThrough) so the selector matches
    // the k1Total TaxReturn.jsx passes to the same engine (readStep1State().k1Total).
    k1Total: sumK1FlowThrough(entities),
    charitableContr: nf(pc.charitableContr),                    // N-9 §170(p)/floor
    capLossCarryforwardST: nf(pc.capLossCarryforwardST),        // §1212(b) (Phase 2.1)
    capLossCarryforwardLT: nf(pc.capLossCarryforwardLT),
  }
}

const _SUMMARY_KEYS = [
  // 'seNetIncome' (Finding 1 follow-up, Jul 2026 audit): net earnings from
  // self-employment as the ENGINE computed them — already excludes a limited
  // partner's distributive share (§1402(a)(13)) and S-corp K-1. Consumers that
  // size self-employed retirement room (AIAnalysis SEP-IRA / Solo 401(k)) must
  // read this instead of raw K-1, so they can never grant a contribution on
  // SE-exempt income.
  'seNetIncome',
  'fedTax', 'seTax', 'additionalMedicare', 'niitAmount', 'amt', 'childCredit',
  'totalTax', 'agi', 'grossIncome', 'taxableBeforeQBI', 'taxableIncome',
  'taxableAfterQBI', 'qbi', 'marginalRate', 'balance', 'totalPayments',
  'capitalGainNetIncluded', 'capLossCarryoverST', 'capLossCarryoverLT',
  'capLossCarryoverTotal', 'ebl', 'ficaSavings', 'reasonableCompAlert',
  'totalSuspendedLoss', 'quarterlyRecommended',

  // AUDIT BLOCKER 2 (Jul 2026): the §199A REASON CODES, not just the number.
  // AIAnalysis needs these to render its "why is my deduction reduced" copy. Before
  // this, it re-ran calcQBI to get them — and in doing so re-derived the DEDUCTION too,
  // from a different base, which is how three surfaces ended up disagreeing. Exposing
  // the reasons here removes the last excuse any consumer had to recompute.
  'qbiLimitApplied',            // 'qbi' | 'wage' | 'income' | 'min400' | 'none'
  'qbiCaps',                    // { qbi, wage, income, min400? }
  'qbiAggregationApplied',
  'qbiAggregationDisclosure',
  'qbiWageDataMissing',         // BLOCKER 1: true when W-2 wages AND UBIA are both $0
]

function _summarize(engineInput) {
  // F5 (consistency audit, Jul 2026): use the SHARED calcGuard path
  // (safeCalc = validateCalcInputs + typed CalcInputError) so this selector and
  // every other calc consumer share ONE error-handling convention. The outer
  // try/catch preserves this façade's contract: a selector consumer renders a
  // card, not an error boundary — it must receive a typed miss, never a throw.
  try {
    const { result, error } = safeCalc(engineInput, calcTaxReturn, 'calcSelector')
    if (error) return Object.freeze({ ok: false, error: error.message })
    const out = { ok: true }
    for (const k of _SUMMARY_KEYS) out[k] = result[k]
    return Object.freeze(out)
  } catch (err) {
    return Object.freeze({ ok: false, error: String(err && err.message || err) })
  }
}

/**
 * Engine-true summary for a SAVED RECORD (the AIAnalysis / Dashboard-card
 * shape: { f1040, entities, ... }). The record's f1040 goes through the same
 * normalizeF1040 coercion the load path uses (shared field manifest), so a
 * stringly-typed legacy record summarizes identically to a loaded one.
 *
 * Known modeling boundary (deliberate): legacy records may carry an
 * `otherIncome` field the Tracker no longer collects and the engine does not
 * model. The old local sums counted it; this selector does not — cards now
 * agree with the filed estimate, which is the contract.
 */
export function summarizeRecord(rec) {
  const pc = normalizeF1040((rec && rec.f1040) || {})
  // Phase 3.2 hardening: a malformed legacy record (entities not an array)
  // must yield { ok:false }, never a throw.
  const entities = Array.isArray(rec && rec.entities) ? rec.entities : []
  return _summarize({
    ...toEngineContext(pc, entities, -1),   // -1 ⇒ exclude nothing: whole return
    ..._wholeReturnExtras(pc, entities),
  })
}

/**
 * Engine-true summary for the LIVE SESSION (ts360_f1040 + Step-1 entities).
 * Consumed by Aria's grounding context (BLOCKER 4) and the Step-1 footer.
 * Reads through the sessionState accessors only (ARCHITECTURE §3).
 */
export function selectTaxSummary() {
  const pc = readPersonalContext()
  const step1 = readStep1State() || {}
  const entities = Array.isArray(step1.entities) ? step1.entities : []
  return _summarize({
    ...toEngineContext(pc, entities, -1),
    ..._wholeReturnExtras(pc, entities),
  })
}

/** Exposed for tests: the exact engine input a record summary is computed
 *  from, so invariant tests can prove summary === direct engine call. */
export function buildRecordEngineInput(rec) {
  const pc = normalizeF1040((rec && rec.f1040) || {})
  const entities = Array.isArray(rec && rec.entities) ? rec.entities : []
  return { ...toEngineContext(pc, entities, -1), ..._wholeReturnExtras(pc, entities) }
}

/** Exposed for tests: the key list every consumer is allowed to read. A new
 *  consumer need is met by adding a key HERE, never by recomputing downstream. */
export const SUMMARY_KEYS = Object.freeze([..._SUMMARY_KEYS])
