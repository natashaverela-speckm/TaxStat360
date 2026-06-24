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
//     Audit finding F-01 (June 2026): corrected stale path comment which
//     previously read "src/utils/aiAnalysisTaxMath.test-helpers.js".
//     This file lives at src/aiAnalysisTaxMath.test-helpers.js.
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
 * @deprecated Use resolveQbiDeduction() from aiAnalysisTaxMath.js instead.
 */
export function legacyQbiGuarded(inputs) {
  const { entity, personal } = inputs
  if (!isPassthroughEntity(entity?.entityType)) return EMPTY_QBI
  if (!entity?.k1Income || entity.k1Income <= 0) return EMPTY_QBI
  return calcQBI({
    qbiIncome: entity.k1Income,
    wages: entity.wages ?? 0,
    ubia: entity.ubia ?? 0,
    filingStatus: personal?.filingStatus ?? 'single',
    taxableIncome: personal?.taxableIncome ?? 0,
    taxYear: personal?.taxYear ?? 2024,
    entityType: entity.entityType,
  })
}

/**
 * Legacy QBI simulator path — same as legacyQbiGuarded but accepts
 * a plain qbiIncome number rather than a full entity object.
 * @deprecated Use resolveQbiDeduction() from aiAnalysisTaxMath.js instead.
 */
export function legacyQbiSimulator(qbiIncome, personal) {
  if (!qbiIncome || qbiIncome <= 0) return EMPTY_QBI
  return calcQBI({
    qbiIncome,
    wages: 0,
    ubia: 0,
    filingStatus: personal?.filingStatus ?? 'single',
    taxableIncome: personal?.taxableIncome ?? 0,
    taxYear: personal?.taxYear ?? 2024,
    entityType: 'sCorp',
  })
}
