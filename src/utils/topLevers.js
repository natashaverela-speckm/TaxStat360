// src/utils/topLevers.js
//
// PHASE 3.2 (Jul 2026) — TOP SAVINGS LEVERS FOR DASHBOARD RECORD CARDS.
//
// Each saved record's card surfaces its one or two highest-value follow-ups
// ("why come back") without loading the record. HARD RULE, inherited from the
// audits' single-source discipline: this module computes NO tax figures of
// its own. Every lever reads a field the ENGINE already emitted through
// summarizeRecord() (Phase 2.2) — ficaSavings is the filed-return panel's own
// number, reasonableCompAlert is calcReasonableCompCore's own trigger, and so
// on. A lever here can therefore never contradict what the user sees after
// clicking Load & Continue; this file only decides RANKING and WORDING.
//
// Ranking philosophy (compliance before savings before information):
//   1. reasonable-comp exposure — an audit-risk flag outranks money
//   2. S-Corp/FICA structure savings — the product's headline lever
//   3. balance due + quarterly plan — cash-flow urgency
//   4. §1212(b) capital-loss carryover — banked value, informational
//   5. suspended losses (§469 / §461(l)) — timing lever, informational

import { summarizeRecord } from './calcSelector.js'
import { fmt } from './money.js'

const LEVER_MIN_FICA = 500      // below this, the S-Corp pitch is noise
const LEVER_MIN_BALANCE = 1000  // small balances aren't a "lever"

/**
 * Returns { summary, levers } for a saved record.
 *   summary — the frozen engine summary (ok:false on guard rejection)
 *   levers  — at most `max` (default 2) of { id, tone, text }, ranked;
 *             tone: 'alert' (amber, compliance) | 'save' (green, money) |
 *             'info' (slate, informational)
 * Never throws: a malformed legacy record yields { summary:{ok:false}, levers:[] }.
 */
export function topLeversForRecord(rec, max = 2) {
  const summary = summarizeRecord(rec)
  if (!summary.ok) return { summary, levers: [] }
  const levers = []

  const rc = summary.reasonableCompAlert
  if (rc && rc.triggered) {
    levers.push({
      id: 'reasonable-comp',
      tone: 'alert',
      text: `Reasonable-comp check: officer salary is ${rc.ratioPct ?? rc.ratio ?? '—'}% of distributions — review before filing`,
    })
  }

  if ((summary.ficaSavings || 0) >= LEVER_MIN_FICA) {
    // ENGINE SEMANTICS (verified against scorpSeTaxSavings, taxCalc ~1278):
    // ficaSavings is computed on NON-SE distributions — income the existing
    // structure already shields — so this is REALIZED savings, worded as
    // validation. The "elect S-Corp and you could save…" pitch requires a
    // hypothetical engine run (AIAnalysis owns it via the shared
    // scorpSeTaxSavingsEstimate); a sole-prop election lever here is a
    // possible future addition through that same single-source function.
    levers.push({
      id: 'scorp-fica',
      tone: 'save',
      text: `Your S-Corp structure is saving ~${fmt(summary.ficaSavings)}/yr in SE/FICA tax`,
    })
  }

  if ((summary.balance || 0) >= LEVER_MIN_BALANCE && (summary.quarterlyRecommended || 0) > 0) {
    levers.push({
      id: 'balance-quarterly',
      tone: 'save',
      text: `Estimated ${fmt(summary.balance)} balance due — a ${fmt(summary.quarterlyRecommended)}/qtr plan avoids §6654 penalties`,
    })
  }

  if ((summary.capLossCarryoverTotal || 0) > 0) {
    levers.push({
      id: 'caploss-carryover',
      tone: 'info',
      text: `${fmt(summary.capLossCarryoverTotal)} capital-loss carryover banked for next year (§1212(b))`,
    })
  }

  if ((summary.totalSuspendedLoss || 0) > 0) {
    levers.push({
      id: 'suspended-losses',
      tone: 'info',
      text: `${fmt(summary.totalSuspendedLoss)} in losses suspended (§469) — a timing lever for a high-income year`,
    })
  }

  return { summary, levers: levers.slice(0, max) }
}
