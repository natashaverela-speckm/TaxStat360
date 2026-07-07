// src/taxCalc-1211-capital-loss.test.js
//
// AUDIT F10 / PASS-6 P6-1 (Jul 2026) — §1211(b) capital-loss limitation and
// §1212(b) character-retaining carryover.
//
// Test labels (ARCHITECTURE §6):
//   SPEC: <citation>  — expected value independently verified against the cited
//                       IRC section / IRS publication. Only SPEC tests prove correctness.
//   CHAR              — freezes current engine behavior (characterization).
//
// The defect these tests kill: net capital losses previously flowed into gross
// income UNCLAMPED — an $80,000 LTCG loss on a $200,000 W-2 understated fedTax
// by $18,444 (Pass-6 probe). For an S-corp owner or real-estate investor sizing
// quarterly payments off the tool, that is an underpayment plus a §6654 penalty.
//
// Hand computations below use the 2026 tables already SPEC-verified against
// Rev. Proc. 2025-32 (audit F-1): std deduction single/MFS $16,100; brackets
// 10% → $12,400, 12% → $50,400, 22% → $105,700, 24% → $201,775.

import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'
import {
  CAP_LOSS_ORDINARY_LIMIT,
  CAP_LOSS_ORDINARY_LIMIT_MFS,
} from './constants.js'

const base = { taxYear: 2026, entities: [] }

describe('§1211(b) — net capital loss limited against ordinary income', () => {

  // SPEC: IRC §1211(b)(1) — deduction limited to $3,000; §1212(b) carryover.
  // Hand math: AGI = 200,000 − 3,000 = 197,000. Taxable = 197,000 − 16,100 = 180,900.
  // Tax = 1,240 + 4,560 + 12,166 + (180,900 − 105,700)×.24 = 36,014. NIIT: nii = 0.
  it('SPEC: §1211(b)(1) — $80,000 LTCG loss deducts only $3,000; the Pass-6 $18,444 understatement is dead', () => {
    const r = calcTaxReturn({ ...base, status: 'single', w2: 200000, ltGain: -80000 })
    expect(r.capitalGainNetIncluded).toBe(-3000)
    expect(r.agi).toBe(197000)
    expect(r.fedTax).toBe(36014)
    expect(r.totalTax).toBe(36014)
    expect(r.capLossCarryoverLT).toBe(77000)
    expect(r.capLossCarryoverST).toBe(0)
    expect(r.capLossCarryoverTotal).toBe(77000)
  })

  // SPEC: IRC §1211(b) flush language — $1,500 for married filing separately.
  // Hand math: AGI = 198,500. Taxable = 182,400. Tax = 1,240 + 4,560 + 12,166
  // + (182,400 − 105,700)×.24 = 36,374.
  it('SPEC: §1211(b) — MFS limit is $1,500', () => {
    const r = calcTaxReturn({ ...base, status: 'mfs', w2: 200000, ltGain: -80000 })
    expect(r.capitalGainNetIncluded).toBe(-1500)
    expect(r.agi).toBe(198500)
    expect(r.fedTax).toBe(36374)
    expect(r.capLossCarryoverLT).toBe(78500)
  })

  // SPEC: IRC §1211(b) — a loss within the limit deducts in full, nothing carries.
  // Hand math: AGI = 98,000. Taxable = 81,900. Tax = 1,240 + 4,560
  // + (81,900 − 50,400)×.22 = 12,730.
  it('SPEC: §1211(b) — a $2,000 loss (under the limit) deducts fully with zero carryover', () => {
    const r = calcTaxReturn({ ...base, status: 'single', w2: 100000, ltGain: -2000 })
    expect(r.capitalGainNetIncluded).toBe(-2000)
    expect(r.agi).toBe(98000)
    expect(r.fedTax).toBe(12730)
    expect(r.capLossCarryoverTotal).toBe(0)
  })

  // SPEC: §1211(b) boundary — exactly the limit carries nothing; one dollar over carries $1.
  it('SPEC: §1211(b) — boundary at exactly the statutory limit', () => {
    const atLimit = calcTaxReturn({ ...base, status: 'single', w2: 100000, ltGain: -CAP_LOSS_ORDINARY_LIMIT })
    const overOne = calcTaxReturn({ ...base, status: 'single', w2: 100000, ltGain: -(CAP_LOSS_ORDINARY_LIMIT + 1) })
    expect(atLimit.capLossCarryoverTotal).toBe(0)
    expect(overOne.capLossCarryoverTotal).toBe(1)
    expect(overOne.capitalGainNetIncluded).toBe(-CAP_LOSS_ORDINARY_LIMIT)
    expect(CAP_LOSS_ORDINARY_LIMIT).toBe(3000)      // §1211(b)(1)
    expect(CAP_LOSS_ORDINARY_LIMIT_MFS).toBe(1500)  // §1211(b), MFS
  })
})

describe('§1212(b) — carryover retains character; Schedule D netting order', () => {

  // SPEC: §1212(b) / Schedule D Capital Loss Carryover Worksheet — the allowed
  // $3,000 absorbs the SHORT-TERM pool first.
  it('SPEC: §1212(b) — ST −10,000 and LT −5,000 → carryover ST 7,000 / LT 5,000', () => {
    const r = calcTaxReturn({ ...base, status: 'single', w2: 100000, stGain: -10000, ltGain: -5000 })
    expect(r.capitalGainNetIncluded).toBe(-3000)
    expect(r.agi).toBe(97000)
    expect(r.capLossCarryoverST).toBe(7000)
    expect(r.capLossCarryoverLT).toBe(5000)
  })

  // SPEC: Schedule D lines 7/15/16 — an LT gain eroded by a larger ST loss leaves
  // ZERO preferential-rate income; the net −3,000 is ordinary. Hand math: AGI =
  // 97,000; taxable = 80,900; all-ordinary tax = 1,240 + 4,560
  // + (80,900 − 50,400)×.22 = 12,510. (The pre-fix engine taxed the raw +10,000
  // LTCG preferentially in this mix — also corrected by this change.)
  it('SPEC: §1(h)/Sch. D — ST −30,000 vs LT +10,000: no preferential income survives netting', () => {
    const r = calcTaxReturn({ ...base, status: 'single', w2: 100000, stGain: -30000, ltGain: 10000 })
    expect(r.capitalGainNetIncluded).toBe(-3000)
    expect(r.fedTax).toBe(12510)
    expect(r.capLossCarryoverST).toBe(17000)
    expect(r.capLossCarryoverLT).toBe(0)
  })

  // SPEC: §1212(b) — a prior-year ST carryforward nets against current LT gain
  // (engine-ready input; UI persistence lands with the Phase-2 field manifest).
  // Hand math: net LT surviving = 3,000, preferential at 15% (stack starts at
  // ordinary 83,900 > the 49,450 0% breakpoint). AGI = 103,000; taxable = 86,900;
  // ordinary 83,900 → 1,240 + 4,560 + 33,500×.22 = 13,170; pref 3,000×.15 = 450;
  // fedTax = 13,620.
  it('SPEC: §1212(b) — carryforward input offsets current gains with character-correct netting', () => {
    const r = calcTaxReturn({ ...base, status: 'single', w2: 100000, ltGain: 8000, capLossCarryforwardST: 5000 })
    expect(r.capitalGainNetIncluded).toBe(3000)
    expect(r.agi).toBe(103000)
    expect(r.fedTax).toBe(13620)
    expect(r.capLossCarryoverTotal).toBe(0)
  })

  // SPEC: gains-only regression — behavior on the gain side is hand-exact and
  // unchanged by this fix. AGI = 120,000; taxable = 103,900; ordinary 83,900 →
  // 13,170; LTCG 20,000×.15 = 3,000; fedTax = 16,170.
  it('SPEC: §1(h) — pure LTCG year unchanged and hand-exact', () => {
    const r = calcTaxReturn({ ...base, status: 'single', w2: 100000, ltGain: 20000 })
    expect(r.capitalGainNetIncluded).toBe(20000)
    expect(r.fedTax).toBe(16170)
    expect(r.capLossCarryoverTotal).toBe(0)
  })
})

describe('Interactions — NIIT and YTD annualization', () => {

  // SPEC: §1411 / Form 8960 — the loss no longer drags MAGI below the NIIT
  // threshold. AGI = 250,000 + 20,000 − 3,000 = 267,000 (> 200,000 single);
  // NII = 20,000 interest (the clamped loss cannot erase unrelated investment
  // income); NIIT = 3.8% × min(20,000, 67,000) = 760. Pre-fix, AGI was 190,000
  // and NIIT was $0.
  it('SPEC: §1411 — clamped loss keeps MAGI honest; NIIT no longer evaporates', () => {
    const r = calcTaxReturn({ ...base, status: 'single', w2: 250000, intInc: 20000, ltGain: -80000 })
    expect(r.agi).toBe(267000)
    expect(r.niitAmount).toBe(760)
  })

  // SPEC: A4-1/A4-2 round-trip discipline extended to losses — a June YTD loss
  // annualizes BEFORE the §1211(b) clamp, so the mid-year projection equals the
  // full-year answer to the dollar. The engine's YTD contract is ytdFactor
  // (TaxReturn.jsx computes 12/ytdMonth); carryforward inputs are balances and
  // deliberately do not scale.
  it('SPEC: §1211(b) × YTD — June-YTD half-loss projects the identical full-year result', () => {
    const full = calcTaxReturn({ ...base, status: 'single', w2: 200000, ltGain: -80000 })
    const ytd  = calcTaxReturn({ ...base, status: 'single', w2: 100000, ltGain: -40000, ytdFactor: 2 })
    expect(ytd.fedTax).toBe(full.fedTax)                        // 36,014
    expect(ytd.capLossCarryoverLT).toBe(full.capLossCarryoverLT) // 77,000
  })
})
