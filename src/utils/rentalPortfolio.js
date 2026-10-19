// src/utils/rentalPortfolio.js
//
// SEVENTH PASS M-1 / M-3 / M-4 (16 Sep 2026) — ONE derivation of the portfolio-level §469
// inputs from the Step-1 Real Estate cards.
//
// The rental cards are where the taxpayer attests REP status, the §1.469-9(g) aggregation
// election, the §469(c)(7)(B) hours, the at-risk override and the prior-year unallowed loss
// (Form 8582 line 1c). TaxReturn.jsx derived those for the filed return; the record-card /
// Step-1 / Aria selector (toEngineContext) read them from the f1040 copy that only exists
// once Step 2 has been visited — and never carried the hours at all. Every surface now reads
// the cards through this helper, so the cards cannot disagree with the return.

import { isRealEstateEntity } from './entityPredicates.js'
import { nf } from './money.js'

const _maxHours = (list, key) => list.reduce((m, e) => {
  const v = parseFloat(e[key])
  if (Number.isNaN(v)) return m
  return Number.isNaN(m) ? v : Math.max(m, v)
}, NaN)

/**
 * @param {Array} entities  Step-1 entities (any type; non-rentals are ignored)
 * @param {*}     savedPriorPAL  the personal-context priorPassiveLossCarryforward, used only
 *                as the migration fallback when NO card carries a prior PAL (returns saved
 *                before the carryforward moved onto the cards).
 */
export function deriveRentalPortfolioInputs(entities, savedPriorPAL = 0) {
  const list = (Array.isArray(entities) ? entities : []).filter(e => e && isRealEstateEntity(e.type))
  const hasRentalCards = list.length > 0
  const isREP = list.some(e => !!e.isREP)
  const rentalAggregationElection = list.some(e => e.rentalAggregationElection === true)
  const repAggregationOverride    = list.some(e => e.repAggregationOverride === true)
  const isActiveParticipant       = list.some(e => !!e.isActiveParticipant)
  const _re  = _maxHours(list, 'repHoursRE')
  const _tot = _maxHours(list, 'repHoursTotal')
  const cardPriorPAL     = list.reduce((s, e) => s + (nf(e.priorPAL) || 0), 0)
  // EIGHTH PASS F-3 (18 Sep 2026, independent fresh-eyes audit): the migration fallback fired
  // for ANY return whose cards carried no prior PAL, including the case where the user had just
  // REMOVED the card that carried it — TaxReturn mirrors the card total into the personal
  // context every render, so the deleted card's amount survived there, silently offset the
  // next rental's income ($10,000 stale carryforward absorbed a new rental's +$5,000, shown as
  // "$5,000 of rental loss is passive and suspended"), and the migration banner told the user
  // the amount "used to be entered here". The fallback is now reserved for what it was written
  // for — a pre-consolidation save whose rental cards never had the field at all. A card
  // created since the field moved onto the cards carries `priorPAL` (blank or not), so its
  // presence means the cards ARE the source of truth and a blank means zero. removeEntity also
  // releases a deleted card's amount from the context (releaseCardPriorPAL below).
  const cardsCarryField  = list.some(e => Object.prototype.hasOwnProperty.call(e, 'priorPAL'))
  const orphanedPriorPAL = (cardPriorPAL === 0 && !cardsCarryField) ? Math.max(0, nf(savedPriorPAL) || 0) : 0
  return {
    hasRentalCards,
    isREP,
    isActiveParticipant,
    rentalAggregationElection,
    repAggregationOverride,
    // '' (not NaN) is what the engine treats as "hours not supplied".
    repHoursRE:    Number.isNaN(_re)  ? '' : _re,
    repHoursTotal: Number.isNaN(_tot) ? '' : _tot,
    cardPriorPAL,
    orphanedPriorPAL,
    priorPAL: cardPriorPAL > 0 ? cardPriorPAL : orphanedPriorPAL,
  }
}

/**
 * EIGHTH PASS F-3 (18 Sep 2026): when a Step-1 card that carried a prior-year unallowed
 * passive loss (Form 8582 line 1c / 2c) is removed, take its amount back out of the mirrored
 * personal-context carryforward so it cannot survive the card as an orphan. Pure: returns the
 * updated context (or the same object when nothing changes).
 * @param {object} ctx     personal context (readPersonalContext())
 * @param {object} entity  the entity being removed
 */
export function releaseCardPriorPAL(ctx, entity, remainingEntities) {
  if (!ctx) return ctx
  const current = Math.max(0, nf(ctx.priorPassiveLossCarryforward) || 0)
  if (current === 0) return ctx
  // OCT-4 ONCE-OVER L-4 (Oct 2026): subtracting the removed card's CURRENT priorPAL was not
  // enough — the mirrored context is written only when Step 2 renders, so a card whose
  // carryforward had been edited down (e.g. $10,000 → blank) and then removed still left the
  // old $10,000 in the context, and with no rental card left to "carry the field" the
  // migration fallback resurrected it as an orphan (live repro Oct 4 2026). The context is a
  // MIRROR of the rental cards, so on removal of a rental card re-derive it from the cards
  // that remain instead of doing arithmetic against a possibly-stale copy. A removed card
  // that is not a rental (a passive K-1 card has its own priorPAL input, which the rental pool
  // never included) leaves the pooled figure alone — the old subtraction wrongly reduced it.
  if (!isRealEstateEntity(entity?.type)) return ctx
  const remaining = (Array.isArray(remainingEntities) ? remainingEntities : [])
    .filter(e => e && isRealEstateEntity(e.type))
  const remainingPAL = remaining.reduce((s, e) => s + Math.max(0, nf(e.priorPAL) || 0), 0)
  if (remainingPAL === current) return ctx
  return { ...ctx, priorPassiveLossCarryforward: remainingPAL }
}
