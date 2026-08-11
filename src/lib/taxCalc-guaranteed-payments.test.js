// src/taxCalc-guaranteed-payments.test.js
//
// F4 (independent audit, Jul 2026) — GUARANTEED PAYMENTS (§707(c)).
// GP is ordinary income + SE earnings (SE even for a limited partner when the
// payment is for services, §1402(a)(13)), and is EXCLUDED from QBI
// (Reg. §1.199A-3(b)(2)(ii)(A)). These property tests pin that treatment.

//
// Module C (audit F-2, Aug 2026) — CHAR: labels backfilled onto every test in
// this file per ARCHITECTURE.md §6 ("New tests MUST be labeled"), following the
// same M6b pattern used on taxCalc-engine.test.js: CHAR is the mechanical floor
// claim (freezes current behavior) that is always true for an existing, passing
// test. None were promoted to SPEC in this pass — that requires independently
// re-verifying each expected value against its cited authority, a per-test
// judgment call left for a follow-up pass, not something to mass-apply here.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

const base = { filingStatus: 'single', year: 2026, w2: 0 }
const partner = (extra = {}) => ({ type: 'Partnership / LLC', own: 100, k1: 60000, ...extra })

const A = calcTaxReturn({ ...base, k1Total: 60000, entities: [partner()] })
const B = calcTaxReturn({ ...base, k1Total: 60000, entities: [partner({ guaranteedPayments: 40000 })] })

describe('F4 — guaranteed payments: SE income, not QBI', () => {
  it('CHAR: GP is exposed on the result', () => {
    expect(A.guaranteedPaymentsTotal).toBe(0)
    expect(B.guaranteedPaymentsTotal).toBe(40000)
  })
  it('CHAR: GP is included in self-employment earnings', () => {
    expect(A.seNetIncome).toBe(60000)
    expect(B.seNetIncome).toBe(100000)
    expect(B.seTax).toBeGreaterThan(A.seTax)
  })
  it('CHAR: GP flows into gross income / AGI dollar-for-dollar', () => {
    expect(B.grossIncome - A.grossIncome).toBe(40000)
  })
  it('CHAR: GP is EXCLUDED from the QBI principal (Reg. §1.199A-3(b)(2)(ii)(A))', () => {
    // qbiCaps.qbi = 20% × QBI base, before the 20%-of-taxable-income cap. Comparing the
    // PRINCIPAL isolates the GP-exclusion from the income-limit interaction (adding GP
    // raises taxable income, which can loosen that cap — a separate, correct effect).
    // If GP were wrongly counted as QBI, B's principal would jump by ~20% × $40k ≈ +$8k.
    expect(B.qbiCaps.qbi).toBeLessThanOrEqual(A.qbiCaps.qbi)   // GP not added to principal
    expect(B.qbiCaps.qbi).toBeGreaterThan(A.qbiCaps.qbi - 800) // only the small ½-SE-on-GP dip
    expect(B.qbiCaps.qbi).toBeLessThan(15000)                  // nowhere near the GP-included ~$19k
  })
  it('CHAR: a limited partner still owes SE tax on the guaranteed payment', () => {
    const L = calcTaxReturn({ ...base, k1Total: 0,
      entities: [partner({ k1: 60000, limitedPartner: true, guaranteedPayments: 40000 })] })
    expect(L.seNetIncome).toBe(40000)
    expect(L.seTax).toBeGreaterThan(0)
  })
})
