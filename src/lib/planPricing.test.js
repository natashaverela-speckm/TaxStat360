// Display-freeze test for subscription pricing (D-06 single source).
// SINGLE PLAN (Nov 2026): one plan, two prices. These strings are what customers
// see on Landing, Onboarding and Upgrade and what the API's trial email states;
// a price change must be a conscious, test-acknowledged act — update here too.
import { describe, it, expect } from 'vitest'
import {
  PLAN_PRICING, fmtPlanPrice, PRICE_PRO_MONTHLY, PRICE_PRO_ANNUAL_TOTAL,
  ANNUAL_DISCOUNT_LABEL, PLAN_DISPLAY_NAMES, PLAN_ENTITY_LIMITS, renewalDisclosure, upgradeDisclosure,
} from './constants.js'

describe('PLAN_PRICING — the one plan', () => {
  it('CHAR: there is exactly one priced plan, "pro"', () => {
    expect(Object.keys(PLAN_PRICING)).toEqual(['pro'])
    expect(PLAN_DISPLAY_NAMES.pro).toBe('TaxStat360')
  })

  it('CHAR: monthly $39, annual $399 billed once', () => {
    expect(PRICE_PRO_MONTHLY).toBe(39)
    expect(PRICE_PRO_ANNUAL_TOTAL).toBe(399)
    expect(fmtPlanPrice(PLAN_PRICING.pro.monthly)).toBe('$39')
    expect(fmtPlanPrice(PLAN_PRICING.pro.annualTotal)).toBe('$399')
  })

  it('CHAR: annual shown per month as $33 and the savings line is one formula everywhere — $69/yr', () => {
    expect(fmtPlanPrice(PLAN_PRICING.pro.annualMonthly)).toBe('$33')
    expect(PLAN_PRICING.pro.annualSavings).toBe(39 * 12 - 399)
    expect(fmtPlanPrice(PLAN_PRICING.pro.annualSavings)).toBe('$69')
    expect(ANNUAL_DISCOUNT_LABEL).toBe('Save $69/yr')
  })

  it('CHAR: no subscription keeps a small entity cap; the plan has none', () => {
    expect(PLAN_ENTITY_LIMITS.starter).toEqual({ business: 1, realEstate: 3 })
    expect(PLAN_ENTITY_LIMITS.pro.business).toBe(Number.POSITIVE_INFINITY)
    expect(PLAN_ENTITY_LIMITS.pro.realEstate).toBe(Number.POSITIVE_INFINITY)
  })

  it('SPEC: §17602 renewal disclosure states the amount and cadence the customer agreed to', () => {
    expect(renewalDisclosure('pro', 'monthly')).toMatch(/charged \$39, and then \$39 every month/)
    expect(renewalDisclosure('pro', 'annual')).toMatch(/charged \$399, and then \$399 every 12 months/)
    // an unknown plan name never produces a $0 disclosure
    expect(renewalDisclosure('professional', 'monthly')).toMatch(/\$39/)
  })

  it('CHAR: the plan-change disclosure names the plan by its display name', () => {
    expect(upgradeDisclosure('pro', 'annual')).toMatch(/TaxStat360 plan at \$399 every 12 months/)
  })
})
