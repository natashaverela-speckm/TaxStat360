// FIFTH READ F-3 (external calc audit, 15 Sep 2026) — MFJ Schedule SE wage-base attribution.
//
// Schedule SE is filed per spouse (IRC §1402(b)), so on a joint return only the
// self-employed spouse's OWN W-2 Social Security wages consume their OASDI wage base.
// The engine (taxCalc.js, R-2) coordinates on `w2OwnForSE` and, when that is blank/0,
// applies the FULL wage base — exact for a dual-earner household, but it overstated SE
// tax for the app's core customer: an S-Corp owner who also has Schedule C / active
// partnership income. Their officer salary flows from Step 1 with the instruction "do not
// re-enter in Step 2", so it was never attributed to them (verified live, TY2026 MFJ,
// $100k officer W-2 + $100k Sch C: SE tax $14,130 shown vs. $13,156 correct; the "SE tax
// savings vs. sole proprietorship" card showed $27,178 as MFJ vs. $15,629 as Single for
// identical facts).
//
// Rule (one definition, every call site):
//   • not MFJ                       → 0 (engine ignores it)
//   • user attributed an amount     → that amount (engine clamps to the household W-2)
//   • blank / 0                     → the Step-1 officer salary of the owner's own
//                                     S-Corp / C-Corp entities. Step 1 frames every entity
//                                     as one "you have an ownership stake in" and labels
//                                     the field "your W-2 wages from this entity", so the
//                                     officer salary is the taxpayer's by the app's own
//                                     data model. Other-employer W-2 (which may be the
//                                     spouse's) is never assumed.
// A household where the S-Corp belongs to the OTHER spouse enters that spouse's officer
// wages as NOT theirs by attributing only their own wages in the Step-2 field (any
// positive entry wins over the default). See the field's InfoTip in TaxReturn.jsx.

import { nf } from './money.js'
import { isSCorpEntity, isCCorpEntity } from './entityPredicates.js'

/** Sum of officer W-2 wages across S-Corp / C-Corp entities (Step-1 data model). */
export function officerW2Total(entities = []) {
  return (Array.isArray(entities) ? entities : []).reduce((s, e) => {
    if (!e) return s
    const isCorp = isSCorpEntity(e.type) || isCCorpEntity(e.type)
    return isCorp ? s + (nf(e.officerW2) || nf(e.pnl?.officerSalary) || 0) : s
  }, 0)
}

/**
 * Resolve the W-2 wages attributed to the self-employed spouse for §1402(b) coordination.
 * @param {object} args
 * @param {string} args.status        filing status ('mfj' | 'single' | …)
 * @param {*}      args.entered       the Step-2 "amount YOU earned" entry (string/number; blank ⇒ default)
 * @param {number} args.officerW2     the owner's own officer salary from Step 1 (see officerW2Total)
 * @returns {number}
 */
// OCT-4 ONCE-OVER L-2 (Oct 2026): Step 2 now has a separate "Spouse's W-2 wages" field. When
// the household has used it (spouseW2 > 0), the other-employer W-2 field is by construction
// the OWNER's own wages, so the unattributed default becomes officer salary + other-employer
// W-2 (= the owner's whole `w2`), which lets the §1402(b) wage-base coordination and the
// §6413(c) excess-SS credit treat the owner's two employers as one person. When the spouse
// field is blank the legacy default (officer salary only) is unchanged — every pre-existing
// record keeps its conservative reading.
export function resolveW2OwnForSE({ status, entered, officerW2 = 0, otherW2 = 0, spouseW2 = 0 } = {}) {
  if (String(status || '').toLowerCase() !== 'mfj') return 0
  const typed = nf(entered)
  if (typed > 0) return typed
  if (nf(spouseW2) > 0) return Math.max(0, nf(officerW2)) + Math.max(0, nf(otherW2))
  return Math.max(0, nf(officerW2))
}
