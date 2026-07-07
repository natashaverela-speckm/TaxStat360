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

  // ── M2 (audit F-05): engine-vocabulary alias `status` ──
  //
  // The engine's input key is `status` (see calcTaxReturn) while the session
  // vocabulary is `filingStatus`. The guard accepts EITHER — which is what finally
  // makes it wireable at real call sites (TaxReturn, Dashboard, scenarioCompare).

  it('accepts engine vocabulary: `status` satisfies the filing-status requirement', () => {
    expect(() => validateCalcInputs({ taxYear: 2025, status: 'mfj' }, 'test')).not.toThrow()
  })

  it('accepts either key when both present', () => {
    expect(() => validateCalcInputs({ taxYear: 2025, status: 'mfj', filingStatus: 'mfj' }, 'test')).not.toThrow()
  })

  it('does NOT accept `filing` (resolveQbiDeduction arg name) — call sites must translate', () => {
    expect(() => validateCalcInputs({ taxYear: 2025, filing: 'single' }, 'test')).toThrow(CalcInputError)
  })

  it('empty-string `status` alone still throws', () => {
    expect(() => validateCalcInputs({ taxYear: 2025, status: '' }, 'test')).toThrow(CalcInputError)
  })

  // ── M2 (audit F-05): NaN money-input scan ──
  //
  // calcTaxReturn() defaults MISSING numeric fields safely, but a field explicitly
  // set to NaN (a failed parse upstream) flows through arithmetic into a NaN
  // liability — the exact silent failure this guard exists to prevent.

  it('throws CalcInputError when any top-level number field is NaN', () => {
    expect(() => validateCalcInputs({ ...VALID, w2: NaN }, 'test')).toThrow(CalcInputError)
  })

  it('throws CalcInputError when any top-level number field is Infinity', () => {
    expect(() => validateCalcInputs({ ...VALID, ytdFactor: Infinity }, 'test')).toThrow(CalcInputError)
  })

  it('NaN scan reports the offending field name', () => {
    try {
      validateCalcInputs({ ...VALID, k1Total: NaN }, 'test')
    } catch (e) {
      expect(e.field).toBe('k1Total')
    }
  })

  it('does not scan nested objects (entities are the engine\'s responsibility)', () => {
    expect(() => validateCalcInputs(
      { ...VALID, entities: [{ k1: NaN }] }, 'test'
    )).not.toThrow()
  })

  it('accepts a realistic full engine input (TaxReturn shape)', () => {
    expect(() => validateCalcInputs({
      taxYear: 2025, status: 'single', dependents: 0,
      entities: [], w2: 100000, k1Total: 0, rentalNet: 0,
      ytdFactor: 1, useItemized: false, itemizedAmt: 0,
    }, 'TaxReturn')).not.toThrow()
  })

  it('rejects the What-If Simulator packed-object shape (defect SIM-1)', () => {
    // The shape SimulatorModal currently sends: no status/filingStatus, no engine
    // income fields, delta nested where the engine never reads it. Must be rejected.
    expect(() => validateCalcInputs({
      base: { grossRevenue: 300000 }, entityType: 'sCorp',
      ownerPctVal: 1, filing: 'mfj', taxYear: 2025, entities: [], delta: {},
    }, 'WhatIfSimulator')).toThrow(CalcInputError)
  })

  // ── M2 fresh-user path protection (signup → first login must never trip the guard) ──
  //
  // A brand-new account lands on Dashboard/TaxReturn with EMPTY session defaults:
  // readPersonalContext() falls back to { filingStatus: 'single', ... }, readTaxYear()
  // to the current tax year, and every money field is built with nf('') → 0. These
  // tests freeze the exact default-shaped inputs those pages construct, so no future
  // guard change can ever break the onboarding → first-render path. (The Stripe
  // subscribe, login, and signup flows themselves never call the tax engine at all —
  // this covers the first page a paying user sees AFTER those flows succeed.)

  it('fresh-user TaxReturn defaults (all-empty session) pass the guard', () => {
    // Mirrors TaxReturn.jsx calcInput for a user who has entered nothing yet:
    // every field comes from nf('') = 0, readTaxYear() default, filingStatus 'single'.
    expect(() => validateCalcInputs({
      taxYear: 2025, status: 'single', dependents: 0,
      entities: [], w2: 0, k1Total: 0,
      stGain: 0, ltGain: 0, intInc: 0, divInc: 0, qualDiv: 0,
      f4797Inc: 0, iraIncome: 0,
      selfEmpHealthIns: 0, hsaDeduction: 0, studentLoanInt: 0, selfEmpRetirement: 0,
      nolCarryforward: 0, priorYearQBILoss: 0, saltAmount: 0,
      hasISO: false, isoBargainElement: 0,
      isREP: false, isActiveParticipant: true,
      rentalAggregationElection: false,
      repHoursRE: '', repHoursTotal: '',   // TaxReturn converts NaN hours to '' before the engine
      repAggregationOverride: false,
      unrecap1250: 0, collectiblesGain: 0, nonrecapturedNet1231Loss: 0,
      w2Withheld: 0, estPaid: 0, ytdFactor: 1,
      charitableContr: 0, estQ1: 0, estQ2: 0, estQ3: 0, estQ4: 0,
      priorYearTax: 0, priorYearAGI: 0,
      priorPassiveLossCarryforward: 0, priorSuspendedLoss: 0,
      assumeZeroBasisOnLoss: true,
      useItemized: false, itemizedAmt: 0, medicalExpenses: 0,
    }, 'TaxReturn')).not.toThrow()
  })

  it('fresh-user Dashboard baseInput (first business entry) passes the guard', () => {
    // Mirrors Dashboard.jsx calcDashboard baseInput: parseInt year with
    // CURRENT_TAX_YEAR fallback, filingStatus 'single' fallback, nf() money fields.
    expect(() => validateCalcInputs({
      taxYear: 2026, status: 'single', dependents: 0,
      k1Total: 0, rentalNet: 0, stGain: 0, ltGain: 0,
      intInc: 0, qualDiv: 0, f4797Inc: 0, taxableSS: 0,
      selfEmpHealthIns: 0, hsaDeduction: 0, studentLoanInt: 0,
      selfEmpRetirement: 0, nolCarryforward: 0, priorYearQBILoss: 0,
      saltAmount: 0, hasISO: false, isoBargainElement: 0,
      isREP: false, unrecap1250: 0, collectiblesGain: 0,
      w2Withheld: 0, estPaid: 0, ytdFactor: 1,
      useItemized: false, itemizedAmt: 0, priorPassiveLossCarryforward: 0,
    }, 'Dashboard')).not.toThrow()
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
