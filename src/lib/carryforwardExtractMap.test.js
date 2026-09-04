/**
 * carryforwardExtractMap.test.js — Phase 10 / Phase 4 HITL
 */
import { describe, it, expect } from 'vitest'
import {
  applyExtractFieldsToWizardValues,
  assertTaxExtractNotRetained,
  mergeTax1040ExtractIntoWizard,
  TAX_1040_EXTRACT_FIELD_KEYS,
  TAX_1040_SMOKE_STUB_FIELDS,
} from './carryforwardExtractMap.js'
import { getCarryforwardWizardFieldKeys } from './carryforwardWizardConfig.js'

describe('TAX_1040 field keys align with wizard', () => {
  it('every extract key is a wizard fieldKey or maps to one', () => {
    const wizard = new Set(getCarryforwardWizardFieldKeys())
    const aliases = new Set(['priorSuspendedLoss'])
    for (const k of TAX_1040_EXTRACT_FIELD_KEYS) {
      if (aliases.has(k)) continue
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
    expect(appliedKeys).not.toContain('priorSuspendedLoss')
    expect(appliedKeys).not.toContain('nolCarryforward')
  })

  it('maps priorSuspendedLoss extract field into the single PAL wizard field', () => {
    const { values, appliedKeys } = applyExtractFieldsToWizardValues({
      priorSuspendedLoss: 3200,
    })
    expect(values.priorPassiveLossCarryforward).toBe('3200')
    expect(appliedKeys).toEqual(['priorPassiveLossCarryforward'])
  })

  it('merges onto existing wizard values (HITL — does not wipe untouched)', () => {
    const { values } = applyExtractFieldsToWizardValues(
      { priorYearTax: 100 },
      { priorYearAGI: '999', priorYearTax: '' },
    )
    expect(values.priorYearAGI).toBe('999')
    expect(values.priorYearTax).toBe('100')
  })

  it('CHAR: smoke stub fields map to wizard amounts (Phase 4)', () => {
    const { values, appliedKeys } = applyExtractFieldsToWizardValues(TAX_1040_SMOKE_STUB_FIELDS)
    expect(values.priorPassiveLossCarryforward).toBe('12500')
    expect(values.capLossCarryforwardST).toBe('1500')
    expect(values.capLossCarryforwardLT).toBe('8000')
    expect(values.priorYearQBILoss).toBe('4500')
    expect(values.priorYearTax).toBe('18750')
    expect(values.priorYearAGI).toBe('142000')
    expect(appliedKeys).toHaveLength(6)
  })
})

describe('assertTaxExtractNotRetained', () => {
  it('rejects Evidence-retained payloads', () => {
    expect(assertTaxExtractNotRetained({ retained: true, path: 'u/x.pdf' })).toBe(false)
    expect(assertTaxExtractNotRetained({ retained: false, deletedAfterProcessing: true })).toBe(true)
    expect(assertTaxExtractNotRetained(null)).toBe(true)
  })
})

describe('mergeTax1040ExtractIntoWizard (Phase 4 HITL)', () => {
  it('applies smoke stub fields when evidence is delete-after-processing', () => {
    const merged = mergeTax1040ExtractIntoWizard({
      fields: TAX_1040_SMOKE_STUB_FIELDS,
      evidence: { retained: false, deletedAfterProcessing: true },
    })
    expect(merged.ok).toBe(true)
    if (merged.ok) {
      expect(merged.values.priorYearAGI).toBe('142000')
      expect(merged.appliedKeys.length).toBeGreaterThan(0)
    }
  })

  it('refuses Evidence-retained payloads without mutating base values', () => {
    const base = { priorYearAGI: '1' }
    const merged = mergeTax1040ExtractIntoWizard(
      {
        fields: TAX_1040_SMOKE_STUB_FIELDS,
        evidence: { retained: true, path: 'Evidence/x.pdf', bucket: 'Evidence' },
      },
      base,
    )
    expect(merged.ok).toBe(false)
    if (!merged.ok) {
      expect(merged.reason).toBe('EVIDENCE_RETAINED')
      expect(merged.values).toEqual(base)
      expect(merged.appliedKeys).toEqual([])
    }
  })
})
