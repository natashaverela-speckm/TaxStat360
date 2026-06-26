// src/utils/calcGuard.test.js

import { describe, it, expect, beforeEach } from 'vitest'
import { validateCalcInputs, CalcInputError, safeCalc } from './calcGuard'

// ── Base valid input ──────────────────────────────────────────────────────────

const VALID = {
  taxYear: 2025,
  filingStatus: 'single',
}

// ── validateCalcInputs ────────────────────────────────────────────────────────

describe('validateCalcInputs', () => {

  it('passes with minimal valid inputs', () => {
    expect(() => validateCalcInputs(VALID)).not.toThrow()
  })

  it('passes with full typical inputs', () => {
    expect(() => validateCalcInputs({
      taxYear: 2025,
      filingStatus: 'mfj',
      netProfit: 120000,
      entityType: 'sCorp',
    })).not.toThrow()
  })

  // ── taxYear ──

  it('throws CalcInputError when taxYear is missing', () => {
    const { taxYear: _, ...bad } = VALID
    expect(() => validateCalcInputs(bad, 'test')).toThrow(CalcInputError)
  })

  it('throws CalcInputError when taxYear is NaN', () => {
    expect(() => validateCalcInputs({ ...VALID, taxYear: NaN }, 'test')).toThrow(CalcInputError)
  })

  it('throws CalcInputError when taxYear is Infinity', () => {
    expect(() => validateCalcInputs({ ...VALID, taxYear: Infinity }, 'test')).toThrow(CalcInputError)
  })

  it('throws CalcInputError when taxYear is a string', () => {
    expect(() => validateCalcInputs({ ...VALID, taxYear: '2025' }, 'test')).toThrow(CalcInputError)
  })

  it('throws CalcInputError when taxYear is null', () => {
    expect(() => validateCalcInputs({ ...VALID, taxYear: null }, 'test')).toThrow(CalcInputError)
  })

  // ── filingStatus ──

  it('throws CalcInputError when filingStatus is missing', () => {
    const { filingStatus: _, ...bad } = VALID
    expect(() => validateCalcInputs(bad, 'test')).toThrow(CalcInputError)
  })

  it('throws CalcInputError when filingStatus is empty string', () => {
    expect(() => validateCalcInputs({ ...VALID, filingStatus: '' }, 'test')).toThrow(CalcInputError)
  })

  it('throws CalcInputError when filingStatus is null', () => {
    expect(() => validateCalcInputs({ ...VALID, filingStatus: null }, 'test')).toThrow(CalcInputError)
  })

  // ── inputs object itself ──

  it('throws CalcInputError when inputs is null', () => {
    expect(() => validateCalcInputs(null, 'test')).toThrow(CalcInputError)
  })

  it('throws CalcInputError when inputs is undefined', () => {
    expect(() => validateCalcInputs(undefined, 'test')).toThrow(CalcInputError)
  })

  // ── error shape ──

  it('CalcInputError has correct name', () => {
    try {
      validateCalcInputs({ ...VALID, taxYear: NaN }, 'MyContext')
    } catch (e) {
      expect(e.name).toBe('CalcInputError')
    }
  })

  it('CalcInputError carries the field name', () => {
    try {
      validateCalcInputs({ ...VALID, taxYear: NaN }, 'MyContext')
    } catch (e) {
      expect(e.field).toBe('taxYear')
    }
  })

  it('CalcInputError carries the context label', () => {
    try {
      validateCalcInputs({ ...VALID, taxYear: null }, 'AIAnalysis')
    } catch (e) {
      expect(e.context).toBe('AIAnalysis')
    }
  })

  it('CalcInputError message includes the field name', () => {
    try {
      validateCalcInputs({ ...VALID, filingStatus: null }, 'TaxReturn')
    } catch (e) {
      expect(e.message).toContain('filingStatus')
    }
  })
})

// ── safeCalc ──────────────────────────────────────────────────────────────────

describe('safeCalc', () => {

  it('returns result when inputs are valid', () => {
    const mockCalc = (inputs) => inputs.taxYear * 2
    const { result, error } = safeCalc(VALID, mockCalc, 'test')
    expect(result).toBe(4050)
    expect(error).toBeNull()
  })

  it('returns error when inputs are invalid (no throw)', () => {
    const mockCalc = (inputs) => inputs.taxYear * 2
    const { result, error } = safeCalc({ ...VALID, taxYear: NaN }, mockCalc, 'test')
    expect(result).toBeNull()
    expect(error).toBeInstanceOf(CalcInputError)
  })

  it('re-throws non-CalcInputError exceptions', () => {
    const explodingCalc = () => { throw new TypeError('unexpected') }
    expect(() => safeCalc(VALID, explodingCalc, 'test')).toThrow(TypeError)
  })
})
