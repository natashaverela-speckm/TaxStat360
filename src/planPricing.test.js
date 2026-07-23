// src/planPricing.test.js
//
// D-06 (Batch 6, Jul 2026) — display-freeze characterization for plan pricing.
// PLAN_PRICING is now the single source for every price customers see; these
// CHAR tests pin the EXACT strings that rendered before the derivation, so the
// wiring is provably display-identical — and any future price change fails
// here first, making a price change a conscious, test-acknowledged act.

import { describe, it, expect } from 'vitest'
import { PLAN_PRICING, fmtPlanPrice, PRICE_STARTER_MONTHLY, PRICE_PROFESSIONAL_MONTHLY, PRICE_ENTERPRISE_MONTHLY } from './lib/constants.js'

describe('PLAN_PRICING — derived figures match the pre-derivation literals', () => {

  it('CHAR: monthly prices — $79 / $149 / $299', () => {
    expect(fmtPlanPrice(PLAN_PRICING.starter.monthly)).toBe('$79')
    expect(fmtPlanPrice(PLAN_PRICING.professional.monthly)).toBe('$149')
    expect(fmtPlanPrice(PLAN_PRICING.enterprise.monthly)).toBe('$299')
  })

  it('CHAR: annual-effective monthly (10 billed ÷ 12, rounded) — $66 / $124 / $249', () => {
    expect(fmtPlanPrice(PLAN_PRICING.starter.annualMonthly)).toBe('$66')
    expect(fmtPlanPrice(PLAN_PRICING.professional.annualMonthly)).toBe('$124')
    expect(fmtPlanPrice(PLAN_PRICING.enterprise.annualMonthly)).toBe('$249')
  })

  it('CHAR: annual totals with comma formatting — $790 / $1,490 / $2,990', () => {
    expect(fmtPlanPrice(PLAN_PRICING.starter.annualTotal)).toBe('$790')
    expect(fmtPlanPrice(PLAN_PRICING.professional.annualTotal)).toBe('$1,490')
    expect(fmtPlanPrice(PLAN_PRICING.enterprise.annualTotal)).toBe('$2,990')
  })

  it('CHAR: Landing savings figures (monthly × 2) — $158 / $298 / $598', () => {
    expect(fmtPlanPrice(PLAN_PRICING.starter.annualSavings)).toBe('$158')
    expect(fmtPlanPrice(PLAN_PRICING.professional.annualSavings)).toBe('$298')
    expect(fmtPlanPrice(PLAN_PRICING.enterprise.annualSavings)).toBe('$598')
  })

  it('CHAR (OBS-9 record): Upgrade page derives DIFFERENT savings — (monthly−annual)×12', () => {
    // Pre-existing divergence, preserved: Upgrade shows $156/$300/$600.
    expect((PLAN_PRICING.starter.monthly - PLAN_PRICING.starter.annualMonthly) * 12).toBe(156)
    expect((PLAN_PRICING.professional.monthly - PLAN_PRICING.professional.annualMonthly) * 12).toBe(300)
    expect((PLAN_PRICING.enterprise.monthly - PLAN_PRICING.enterprise.annualMonthly) * 12).toBe(600)
  })

  it('CHAR: PLAN_PRICING derives from the PRICE_* constants (the single source)', () => {
    expect(PLAN_PRICING.starter.monthly).toBe(PRICE_STARTER_MONTHLY)
    expect(PLAN_PRICING.professional.monthly).toBe(PRICE_PROFESSIONAL_MONTHLY)
    expect(PLAN_PRICING.enterprise.monthly).toBe(PRICE_ENTERPRISE_MONTHLY)
  })
})
