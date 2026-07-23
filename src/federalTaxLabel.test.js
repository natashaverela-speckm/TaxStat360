// src/federalTaxLabel.test.js
//
// Audit re-review (Jul 2026) — the results/dashboard headline renders result.totalTax.
// For S-Corp / C-Corp that equals federal INCOME tax (SE = 0). For Sole Proprietors /
// Partnerships it INCLUDES self-employment tax, so the headline must switch to a
// "total" label instead of contradicting the waterfall's "Federal Income Tax" line.

import { describe, it, expect } from 'vitest'
import { federalTaxHeadlineLabel, FINANCIAL_LABELS } from './constants.js'

describe('federalTaxHeadlineLabel — entity-aware results headline', () => {
  it('SPEC: no SE tax (S-Corp / C-Corp / W-2 only) -> "EST. FEDERAL INCOME TAX"', () => {
    expect(federalTaxHeadlineLabel(0)).toBe('EST. FEDERAL INCOME TAX')
    expect(federalTaxHeadlineLabel(undefined)).toBe('EST. FEDERAL INCOME TAX')
    expect(federalTaxHeadlineLabel(null)).toBe('EST. FEDERAL INCOME TAX')
    expect(federalTaxHeadlineLabel(0)).toBe(FINANCIAL_LABELS.estFederalIncomeTax)
  })
  it('SPEC: SE tax present (Sole Prop / Partnership) -> "EST. TOTAL FEDERAL TAX"', () => {
    expect(federalTaxHeadlineLabel(22607)).toBe('EST. TOTAL FEDERAL TAX')
    expect(federalTaxHeadlineLabel(1)).toBe(FINANCIAL_LABELS.estTotalFederalTax)
  })
  it('CHAR: the two labels are distinct so the headline can never mislabel the total', () => {
    expect(FINANCIAL_LABELS.estFederalIncomeTax).not.toBe(FINANCIAL_LABELS.estTotalFederalTax)
  })
})
