// src/whatif-limited-partner.test.js
//
// Finding 1 FOLLOW-UP #2 (fresh-eyes re-review, Jul 2026) — the What-If Tax
// Simulator charged self-employment tax on a LIMITED-PARTNER Partnership/LLC and
// offered a "Max SEP-IRA" contribution on it, contradicting every other surface
// (Tax Tracker, SE-savings panel, SEP-IRA card), which treat that K-1 as SE-exempt
// under IRC §1402(a)(13).
//
// Root cause: computeSimulatorScenario() rebuilt the engine entity as
// { type, k1, own, officerW2 } and dropped the `limitedPartner` flag, so
// normalizeEntityType defaulted it to the ACTIVE (SE-subject) variant. The fix
// threads limitedPartner through. This suite pins that treatment at the exported
// function so it can't regress. Self-contained: imports only aiAnalysisTaxMath.js.
//
// Numbers (2026): $60k net K-1 → SE base 60,000 × 0.9235 = 55,410;
// SE tax 55,410 × 0.153 = 8,477.73 → 8,478.

import { describe, it, expect } from 'vitest'
import { computeSimulatorScenario } from './aiAnalysisTaxMath.js'

const K1 = 60000
const EXPECTED_SE = 8478
const base = {
  grossRevenue: K1, cogs: 0, operatingExpenses: 0, officerSalary: 0,
  depreciation: 0, advertising: 0, otherDeductions: 0, w2Income: 0, estPaid: 0,
}
const ctx = (extra = {}) => ({
  base, entityType: 'Partnership / LLC', ownerPctVal: 1,
  filing: 'single', taxYear: 2026, entities: [], ...extra,
})

describe('What-If Simulator — SE treatment matches the rest of the app', () => {
  it('ACTIVE Partnership/LLC → simulator charges SE tax (unchanged)', () => {
    const r = computeSimulatorScenario(ctx(), {})
    expect(r.seTax).toBe(EXPECTED_SE)
  })

  it('LIMITED PARTNER → simulator charges $0 SE tax (§1402(a)(13))', () => {
    const r = computeSimulatorScenario(ctx({ limitedPartner: true }), {})
    expect(r.seTax).toBe(0)                 // the bug: was 8,478
  })

  it('limited-partner net business income still flows to the 1040 (only SE tax differs)', () => {
    const active = computeSimulatorScenario(ctx(), {})
    const limited = computeSimulatorScenario(ctx({ limitedPartner: true }), {})
    expect(limited.k1).toBe(active.k1)      // same income...
    expect(limited.seTax).toBeLessThan(active.seTax)  // ...only SE tax differs
    expect(limited.totalTax).toBeLessThan(active.totalTax)
  })
})
