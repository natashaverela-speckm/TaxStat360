import { describe, it, expect } from 'vitest'
import {
  GLOBAL_DISCLAIMER,
  CARRYFORWARD_WIZARD_MIN_PLAN,
  CARRYFORWARD_WIZARD_STEPS,
  CARRYFORWARD_SANITY_KEYS,
  getCarryforwardWizardFieldKeys,
} from './carryforwardWizardConfig.js'
import { F1040_FIELD_MANIFEST } from '../utils/fieldManifest.js'

const manifestKeys = new Set(F1040_FIELD_MANIFEST.map((f) => f.key))

describe('carryforwardWizardConfig', () => {
  it('CHAR: GLOBAL_DISCLAIMER matches spec §7 wording', () => {
    expect(GLOBAL_DISCLAIMER).toBe(
      'Please check with your tax professional before relying on any numbers as accurate.',
    )
    expect(GLOBAL_DISCLAIMER.length).toBeGreaterThan(0)
  })

  it('CHAR: default min plan is professional (Phase 3 gate)', () => {
    expect(CARRYFORWARD_WIZARD_MIN_PLAN).toBe('professional')
  })

  it('CHAR: defines exactly 10 wizard steps per lean v1 spec', () => {
    expect(CARRYFORWARD_WIZARD_STEPS).toHaveLength(10)
  })

  it('CHAR: every step has a unique id', () => {
    const ids = CARRYFORWARD_WIZARD_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('CHAR: every step has label, helperText, and explainer', () => {
    for (const step of CARRYFORWARD_WIZARD_STEPS) {
      expect(step.label?.trim(), step.id).toBeTruthy()
      expect(step.helperText?.trim(), step.id).toBeTruthy()
      expect(step.explainer?.trim(), step.id).toBeTruthy()
    }
  })

  it('CHAR: non-informational steps map to F1040_FIELD_MANIFEST keys', () => {
    for (const step of CARRYFORWARD_WIZARD_STEPS) {
      if (step.informational) continue
      expect(step.fieldKey, step.id).toBeTruthy()
      expect(manifestKeys.has(step.fieldKey), `${step.id} → ${step.fieldKey}`).toBe(true)
    }
  })

  it('CHAR: informational steps have no fieldKey', () => {
    const informational = CARRYFORWARD_WIZARD_STEPS.filter((s) => s.informational)
    expect(informational).toHaveLength(2)
    expect(informational.map((s) => s.id).sort()).toEqual([
      'at-risk-carryforward',
      'depreciation-continuity',
    ])
    for (const step of informational) {
      expect(step.fieldKey, step.id).toBeUndefined()
    }
  })

  it('CHAR: data-entry field keys are unique across steps', () => {
    const keys = getCarryforwardWizardFieldKeys()
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toHaveLength(8)
  })

  it('CHAR: sanity objects only use allowed keys', () => {
    for (const step of CARRYFORWARD_WIZARD_STEPS) {
      if (!step.sanity) continue
      for (const key of Object.keys(step.sanity)) {
        expect(CARRYFORWARD_SANITY_KEYS, `${step.id}.${key}`).toContain(key)
      }
    }
  })

  it('CHAR: no [Natasha] placeholders remain in step copy', () => {
    for (const step of CARRYFORWARD_WIZARD_STEPS) {
      expect(step.explainer, step.id).not.toMatch(/\[Natasha\]/)
      expect(step.helperText, step.id).not.toMatch(/\[Natasha\]/)
    }
  })
})
