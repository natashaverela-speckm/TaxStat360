// src/aiAnalysis-sep-limited-partner.test.js
//
// Finding 1 FOLLOW-UP (independent pre-launch audit, Jul 2026) — the AI Analysis
// SEP-IRA / Solo 401(k) card recommended a contribution ("~$11,152 of net
// self-employment income") on a LIMITED-PARTNER K-1, contradicting the Tax
// Tracker, which correctly treats that same income as SE-EXEMPT under
// IRC §1402(a)(13). Root cause: the card sized its base from raw K-1 and
// re-derived SE tax whenever the engine's seTax was 0 — unable to tell "0 because
// not supplied" from "0 because the income is legally SE-exempt."
//
// The fix routes the SEP base through the ENGINE's seNetIncome (which already
// excludes a limited partner's share and S-corp K-1). This suite pins the
// selector contract the fix depends on: summarizeRecord() must EXPOSE seNetIncome,
// and it must be 0 for a limited partner / S-corp and equal to net profit for a
// sole prop / active partner. If seNetIncome is 0, the SEP base is 0, so the
// erroneous card can never render.
//
// Numbers (2026): $60k net K-1 → SE base 60,000 × 0.9235 = 55,410;
// SE tax 55,410 × 0.153 = 8,477.73 → 8,478 (engine rounds).

import { describe, it, expect } from 'vitest'
import { summarizeRecord } from './utils/calcSelector.js'

const K1 = 60000
const EXPECTED_SE = 8478
const f1040 = { filingStatus: 'single', taxYear: 2026 }

const summarize = (entities) => summarizeRecord({ f1040, entities })

describe('Finding 1 follow-up — selector exposes engine seNetIncome', () => {
  it('seNetIncome is present on the summary (the field the SEP fix reads)', () => {
    const s = summarize([{ type: 'Partnership / LLC', own: 100, k1: K1 }])
    expect(s.ok).toBe(true)
    expect(s.seNetIncome).toBeDefined()
    expect(typeof s.seNetIncome).toBe('number')
  })
})

describe('Finding 1 follow-up — SEP base respects §1402(a)(13)', () => {
  it('ACTIVE partnership → seNetIncome is SE income → SEP room exists', () => {
    const s = summarize([{ type: 'Partnership / LLC', own: 100, k1: K1 }])
    expect(s.seNetIncome).toBe(K1)
    expect(s.seTax).toBe(EXPECTED_SE)
  })

  it('LIMITED PARTNER → seNetIncome is 0 → SEP base is $0 (no contribution card)', () => {
    const s = summarize([{ type: 'Partnership / LLC', own: 100, k1: K1, limitedPartner: true }])
    expect(s.seNetIncome).toBe(0)     // §1402(a)(13) — the core of the fix
    expect(s.seTax).toBe(0)
  })

  it('SOLE PROPRIETOR → seNetIncome is SE income → SEP room exists', () => {
    const s = summarize([{ type: 'Sole Proprietor / SMLLC', own: 100, k1: K1 }])
    expect(s.seNetIncome).toBe(K1)
    expect(s.seTax).toBe(EXPECTED_SE)
  })

  it('S-CORP → seNetIncome is 0 (SEP is officer-W-2 based, handled separately)', () => {
    const s = summarize([{ type: 'S-Corp', own: 100, k1: K1, officerW2: 0 }])
    expect(s.seNetIncome).toBe(0)
    expect(s.seTax).toBe(0)
  })
})
