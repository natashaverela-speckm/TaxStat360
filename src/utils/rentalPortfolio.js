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
  const orphanedPriorPAL = cardPriorPAL === 0 ? Math.max(0, nf(savedPriorPAL) || 0) : 0
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
