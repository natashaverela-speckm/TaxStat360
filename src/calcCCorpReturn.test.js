// Tests for the canonical C-Corporation estimate (audit F6 / C-Corp support, Phase 1).
// Pins the simplified planning model: salary + employer FICA are deductible to the
// corporation, 21% applies to the remaining profit, the after-tax profit is double-taxed
// as qualified dividends on the personal return, and no QBI applies.

import { describe, it, expect } from 'vitest'
import { calcCCorpReturn, getTable } from './taxCalc.js'
import { C_CORP_TAX_RATE, FICA_SS_RATE, FICA_MEDICARE_RATE, DEFAULT_OFFICER_SALARY_FRACTION } from './constants.js'

const YEAR = 2025
const ctx = { taxYear: YEAR, filingStatus: 'single' }
const ssWageBase = getTable(YEAR).ssWageBase

const expectedEmployerFICA = (salary) =>
  Math.round(Math.min(salary, ssWageBase) * FICA_SS_RATE + salary * FICA_MEDICARE_RATE)

describe('calcCCorpReturn — corporate layer', () => {
  it('corporate tax = 21% of (netProfit − salary − employerFICA)', () => {
    const netProfit = 200000, officerSalary = 40000
    const empFICA = expectedEmployerFICA(officerSalary)
    const base = Math.max(0, netProfit - officerSalary - empFICA)
    const r = calcCCorpReturn({ netProfit, officerSalary, personalContext: ctx })
    expect(r.employerFICA).toBe(empFICA)
    expect(r.profitBeforeTax).toBe(base)
    expect(r.corpTax).toBe(Math.round(base * C_CORP_TAX_RATE))
  })

  it('dividends = after-corporate-tax profit (full distribution)', () => {
    const r = calcCCorpReturn({ netProfit: 200000, officerSalary: 40000, personalContext: ctx })
    expect(r.dividends).toBe(r.profitBeforeTax - r.corpTax)
  })

  it('zero / negative net profit → no corporate tax, no dividends', () => {
    expect(calcCCorpReturn({ netProfit: 0, personalContext: ctx })).toMatchObject({ corpTax: 0, dividends: 0 })
    expect(calcCCorpReturn({ netProfit: -5000, personalContext: ctx })).toMatchObject({ corpTax: 0, dividends: 0 })
  })
})

describe('calcCCorpReturn — officer salary handling', () => {
  it('defaults salary to DEFAULT_OFFICER_SALARY_FRACTION × netProfit when not provided', () => {
    const netProfit = 150000
    const r = calcCCorpReturn({ netProfit, personalContext: ctx })
    expect(r.officerSalary).toBe(Math.round(netProfit * DEFAULT_OFFICER_SALARY_FRACTION))
  })

  it('caps the officer salary at available net profit', () => {
    const r = calcCCorpReturn({ netProfit: 50000, officerSalary: 999999, personalContext: ctx })
    expect(r.officerSalary).toBe(50000)
    expect(r.profitBeforeTax).toBe(0)
    expect(r.corpTax).toBe(0)
  })
})

describe('calcCCorpReturn — personal layer & double taxation', () => {
  it('treats the after-tax profit as qualified dividends on the personal return (no QBI)', () => {
    const r = calcCCorpReturn({ netProfit: 200000, officerSalary: 40000, personalContext: ctx })
    // C-Corp distributions are not QBI: the personal return carries no QBI deduction.
    expect(r.personal.qbiDeduction || 0).toBe(0)
    // Dividends are non-zero for this profit level, exercising the double-tax path.
    expect(r.dividends).toBeGreaterThan(0)
  })

  it('total tax = personal income tax + full (15.3%) employment tax + corporate tax', () => {
    const salary = 40000
    const r = calcCCorpReturn({ netProfit: 200000, officerSalary: salary, personalContext: ctx })
    const expectedEmploymentTax = Math.round(
      Math.min(salary, ssWageBase) * FICA_SS_RATE * 2 + salary * FICA_MEDICARE_RATE * 2
    )
    expect(r.employmentTax).toBe(expectedEmploymentTax)
    expect(r.totalTax).toBe(r.personal.totalTax + r.employmentTax + r.corpTax)
  })

  it('higher salary (more deduction) lowers corporate tax but raises employment tax', () => {
    const low  = calcCCorpReturn({ netProfit: 200000, officerSalary: 30000, personalContext: ctx })
    const high = calcCCorpReturn({ netProfit: 200000, officerSalary: 90000, personalContext: ctx })
    expect(high.corpTax).toBeLessThan(low.corpTax)
    expect(high.employmentTax).toBeGreaterThan(low.employmentTax)
  })
})
