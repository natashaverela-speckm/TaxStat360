// src/utils/aiAnalysisTaxMath.test-helpers.js
//
// Legacy QBI paths preserved FOR TESTS ONLY.
// Do NOT import these from production code. Import resolveQbiDeduction()
// from aiAnalysisTaxMath.js instead.
//
// These functions were previously exported from aiAnalysisTaxMath.js with
// "preserved for characterization" comments. They were moved here (audit finding
// 3.4 / 10.3) so they can no longer be called by production code that imports
// from the main module.

import { calcQBI } from '../taxCalc.js'
import { isPassthroughEntity } from './entityPredicates'

const EMPTY_QBI = { deduction: 0, limitApplied: 'none', caps: { qbi: 0, wage: null, income: 0 } }

/**
 * Legacy guarded QBI path (Risk Scan rough tax, Optimization, CPA briefing).
 * Preserved for characterization — requires passthrough entity and k1 > 0.
 * @deprecated Use resolveQbiDeduction() from aiAnalysisTaxMath.js
 */
export function legacyQbiGuarded({ k1, taxableBeforeQBI, entityType, filing, taxYear, entities }) {
  if (isPassthroughEntity(entityType) && k1 > 0) {
    return calcQBI(k1, taxableBeforeQBI, 0, {
      status: filing,
      taxYear,
      entityQbiData: entities || [],
    })
  }
  return { ...EMPTY_QBI }
}

/**
 * Legacy simulator QBI path — passthrough guard only (no k1 > 0 check).
 * Preserved for characterization baseline.
 * @deprecated Use resolveQbiDeduction() from aiAnalysisTaxMath.js
 */
export function legacyQbiSimulator({ k1, taxableBeforeQBI, entityType, filing, taxYear, entities }) {
  if (isPassthroughEntity(entityType)) {
    return calcQBI(k1, taxableBeforeQBI, 0, {
      status: filing,
      taxYear,
      entityQbiData: entities || [],
    })
  }
  return { deduction: 0 }
}
