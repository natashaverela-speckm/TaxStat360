/**
 * Map shared extract-document tax-1040-carryforward fields → Carryforward Wizard values.
 * HITL: never writes session context — caller merges into wizard state for review.
 */
import { getCarryforwardWizardFieldKeys } from './carryforwardWizardConfig.js'
import { contextValueToWizardInput } from './carryforwardWizardPersistence.js'

/** Same keys as extract-document TAX_1040_FIELD_KEYS / wizard fieldKeys. */
export const TAX_1040_EXTRACT_FIELD_KEYS = [
  'priorPassiveLossCarryforward',
  'priorSuspendedLoss',
  'capLossCarryforwardST',
  'capLossCarryforwardLT',
  'nolCarryforward',
  'priorYearQBILoss',
  'priorYearTax',
  'priorYearAGI',
]

/**
 * @param {Record<string, unknown>|null|undefined} fields — extract result.fields
 * @param {Record<string, string>} [baseValues] — current wizard values to merge into
 * @returns {{ values: Record<string, string>, appliedKeys: string[], skippedKeys: string[] }}
 */
export function applyExtractFieldsToWizardValues(fields, baseValues = {}) {
  const values = { ...baseValues }
  const appliedKeys = []
  const skippedKeys = []
  const src = fields && typeof fields === 'object' ? fields : {}
  const wizardKeys = new Set(getCarryforwardWizardFieldKeys())

  // Extract stub/API may still send priorSuspendedLoss — merge into the single PAL field.
  const normalized = { ...src }
  if (
    normalized.priorPassiveLossCarryforward == null &&
    normalized.priorSuspendedLoss != null &&
    normalized.priorSuspendedLoss !== ''
  ) {
    normalized.priorPassiveLossCarryforward = normalized.priorSuspendedLoss
  }

  for (const key of TAX_1040_EXTRACT_FIELD_KEYS) {
    if (key === 'priorSuspendedLoss') {
      skippedKeys.push(key)
      continue
    }
    if (!wizardKeys.has(key)) {
      skippedKeys.push(key)
      continue
    }
    const raw = normalized[key]
    if (raw == null || raw === '') {
      skippedKeys.push(key)
      continue
    }
    const input = contextValueToWizardInput(raw)
    if (input === '') {
      skippedKeys.push(key)
      continue
    }
    values[key] = input
    appliedKeys.push(key)
  }

  return { values, appliedKeys, skippedKeys }
}

/**
 * Assert extract evidence metadata never claims RepsRecord Evidence retention for tax.
 * @param {object|null|undefined} evidence
 */
export function assertTaxExtractNotRetained(evidence) {
  if (!evidence || typeof evidence !== 'object') return true
  if (evidence.retained === true) return false
  if (evidence.path || evidence.bucket === 'Evidence') return false
  return evidence.deletedAfterProcessing === true || evidence.retained === false
}
