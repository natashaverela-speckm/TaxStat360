/**
 * carryforwardExtractMap.test.js — Phase 10
 */
import { describe, it, expect } from 'vitest'
import {
  applyExtractFieldsToWizardValues,
  assertTaxExtractNotRetained,
  TAX_1040_EXTRACT_FIELD_KEYS,
} from './carryforwardExtractMap.js'
import { getCarryforwardWizardFieldKeys } from './carryforwardWizardConfig.js'

describe('TAX_1040 field keys align with wizard', () => {
  it('every extract key is a wizard fieldKey', () => {
    const wizard = new Set(getCarryforwardWizardFieldKeys())
    for (const k of TAX_1040_EXTRACT_FIELD_KEYS) {
      expect(wizard.has(k)).toBe(true)
    }
  })
})

describe('applyExtractFieldsToWizardValues', () => {
  it('maps fixture-like fields into MoneyInput strings without writing context', () => {
    const { values, appliedKeys } = applyExtractFieldsToWizardValues({
      priorPassiveLossCarryforward: 12500,
      priorSuspendedLoss: 3200,
      capLossCarryforwardST: 1500,
      capLossCarryforwardLT: 8000,
      nolCarryforward: null,
      priorYearQBILoss: 4500,
      priorYearTax: 18750,
      priorYearAGI: 142000,
    })
    expect(values.priorPassiveLossCarryforward).toBe('12500')
    expect(values.priorYearAGI).toBe('142000')
    expect(values.nolCarryforward).toBeUndefined()
    expect(appliedKeys).toContain('priorPassiveLossCarryforward')
    expect(appliedKeys).not.toContain('nolCarryforward')
  })

  it('merges onto existing wizard values (HITL — does not wipe untouched)', () => {
    const { values } = applyExtractFieldsToWizardValues(
      { priorYearTax: 100 },
      { priorYearAGI: '999', priorYearTax: '' },
    )
    expect(values.priorYearAGI).toBe('999')
    expect(values.priorYearTax).toBe('100')
  })
})

describe('assertTaxExtractNotRetained', () => {
  it('rejects Evidence-retained payloads', () => {
    expect(assertTaxExtractNotRetained({ retained: true, path: 'u/x.pdf' })).toBe(false)
    expect(assertTaxExtractNotRetained({ retained: false, deletedAfterProcessing: true })).toBe(true)
    expect(assertTaxExtractNotRetained(null)).toBe(true)
  })
})
