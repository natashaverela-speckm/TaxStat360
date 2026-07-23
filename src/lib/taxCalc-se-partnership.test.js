// src/taxCalc-se-partnership.test.js
//
// Finding 1 (independent pre-launch audit, Jul 2026) — SELF-EMPLOYMENT TAX
// TREATMENT OF PARTNERSHIP / LLC K-1 INCOME.
//
// Background: the live site was observed treating a default "Partnership / LLC"
// entity as SE-EXEMPT and labeling it "S-Corp K-1" income (no SE tax in the
// headline total, an S-Corp savings panel, yet a SEP-IRA tip sized on full SE
// income). That is the PRE-normalization bug the code comments describe:
// "without normalization sole proprietors and partnerships silently received NO
// self-employment tax." The current engine fixes it — normalizeEntityType()
// defaults "Partnership / LLC" to "Partnership / MMLLC — Active", which is in
// SE_SUBJECT_TYPES.
//
// This suite PINS that behavior so it cannot silently regress (which is what
// would reproduce the live-site defect). It is a black-box test of the public
// engine entry point calcTaxReturn(); every expected number is hand-derived and
// noted inline.
//
// Reference constants (2026): SS wage base $184,500; SE net-earnings factor
// 0.9235 (§1402(a)(12)); combined SE rate 15.3% (12.4% OASDI + 2.9% Medicare).

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

// $60,000 net K-1, fully below the wage base:
//   SE base = 60,000 × 0.9235      = 55,410
//   SE tax  = 55,410 × 0.153       = 8,477.73 → 8,478 (engine rounds)
const K1 = 60000
const EXPECTED_SE = 8478

const base = { filingStatus: 'single', year: 2026, w2: 0 }

describe('Finding 1 — Partnership/LLC K-1 is self-employment income by default', () => {

  it('default Partnership / LLC → SE tax IS charged (materially-participating owner)', () => {
    const r = calcTaxReturn({ ...base, entities: [{ type: 'Partnership / LLC', own: 100, k1: K1 }] })
    expect(r.seTax).toBe(EXPECTED_SE)          // NOT zero — the core of the finding
    expect(r.seNetIncome).toBe(K1)
  })

  it('default Partnership / LLC → NO "S-Corp" SE-savings panel is shown', () => {
    const r = calcTaxReturn({ ...base, entities: [{ type: 'Partnership / LLC', own: 100, k1: K1 }] })
    // The panel renders only when ficaSavings > 0; a materially-participating
    // partner has NO such savings and must not be labeled an S-corp.
    expect(r.ficaSavings).toBe(0)
    expect(r.k1Distributions).toBe(0)
  })

  it('default Partnership / LLC → SE tax is included in totalTax', () => {
    const r = calcTaxReturn({ ...base, entities: [{ type: 'Partnership / LLC', own: 100, k1: K1 }] })
    // totalTax must be at least the SE tax (income tax may add more). The live
    // bug showed a total that EXCLUDED SE tax entirely.
    expect(r.totalTax).toBeGreaterThanOrEqual(EXPECTED_SE)
  })
})

describe('Finding 1 — legitimate SE-exempt structures still behave correctly', () => {

  it('limited-partner attestation → SE-EXEMPT under §1402(a)(13)', () => {
    const r = calcTaxReturn({
      ...base,
      entities: [{ type: 'Partnership / LLC', own: 100, k1: K1, limitedPartner: true }],
    })
    expect(r.seTax).toBe(0)                     // §1402(a)(13) exclusion
    expect(r.ficaSavings).toBe(EXPECTED_SE)     // panel legitimately shows...
    expect(r.k1Distributions).toBe(K1)          // ...but the UI must NOT call it "S-Corp"
  })

  it('S corporation → SE-EXEMPT (FICA is on W-2 officer wages instead)', () => {
    const r = calcTaxReturn({ ...base, entities: [{ type: 'S Corporation', own: 100, k1: K1 }] })
    expect(r.seTax).toBe(0)
    expect(r.ficaSavings).toBe(EXPECTED_SE)
  })

  it('sole proprietor → SE tax charged (baseline the "savings" compares against)', () => {
    const r = calcTaxReturn({ ...base, entities: [{ type: 'Sole Proprietor / SMLLC', own: 100, k1: K1 }] })
    expect(r.seTax).toBe(EXPECTED_SE)
    expect(r.ficaSavings).toBe(0)
  })
})
