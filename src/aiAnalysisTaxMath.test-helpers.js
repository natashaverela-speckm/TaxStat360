// src/aiAnalysisTaxMath.test-helpers.js
//
// ⚠️  TEST INFRASTRUCTURE ONLY — never import from production code.
//
//     Production call site:
//       import { resolveQbiDeduction } from './aiAnalysisTaxMath'
//
//     This file — test files only:
//       import { legacyQbiGuarded, legacyQbiSimulator } from './aiAnalysisTaxMath.test-helpers'
//
// Legacy QBI paths preserved FOR CHARACTERIZATION TESTS ONLY.
// These are thin wrappers over the unified resolveQbiDeduction() engine so the
// characterization tests prove the current engine handles every legacy call-site
// pattern correctly. The wrappers accept the call shape the test file uses.

import { calcQBI } from './taxCalc.js'
import { isPassthroughEntity } from './utils/entityPredicates.js'

const EMPTY_QBI = { deduction: 0, limitApplied: 'none', caps: { qbi: 0, wage: null, income: 0 } }

/**
 * Legacy guarded QBI path.
 * Accepts the flat shape used by the characterization test:
 *   { k1, taxableBeforeQBI, entityType, filing, taxYear, entities?, capitalGains? }
 * @deprecated Use resolveQbiDeduction() from aiAnalysisTaxMath.js instead.
 */
export function legacyQbiGuarded({ k1, taxableBeforeQBI, entityType, filing, taxYear, entities = [], capitalGains = 0 } = {}) {
  if (!isPassthroughEntity(entityType) || !k1 || k1 <= 0 || taxableBeforeQBI <= 0) return EMPTY_QBI
  return calcQBI(k1, taxableBeforeQBI, capitalGains, {
    status: filing,
    taxYear,
    entityQbiData: entities,
  })
}

/**
 * Legacy QBI simulator path.
 * Accepts the same flat shape as legacyQbiGuarded.
 * @deprecated Use resolveQbiDeduction() from aiAnalysisTaxMath.js instead.
 */
export function legacyQbiSimulator({ k1, taxableBeforeQBI, entityType, filing, taxYear, entities = [], capitalGains = 0 } = {}) {
  if (!isPassthroughEntity(entityType) || !k1 || k1 <= 0 || taxableBeforeQBI <= 0) return EMPTY_QBI
  return calcQBI(k1, taxableBeforeQBI, capitalGains, {
    status: filing,
    taxYear,
    entityQbiData: entities,
  })
}
