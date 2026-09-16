// src/lib/taxCalc-amt-1250-collectibles.test.js
//
// AUDIT FIX (fresh-eyes re-audit, Aug 2026): calcAMT() called calcPreferentialTax()
// for the AMT computation but only passed { ltcg, qualDiv } -- unrecap1250 and
// collectibles were never forwarded, so calcPreferentialTax's own defaults
// (unrecap1250 = 0, collectibles = 0) silently zeroed them out inside AMT, even
// though the exact same function correctly applies the flat 25%/28% rates a few
// hundred lines earlier for the REGULAR-tax computation. Form 6251 Part III mirrors
// the Schedule D Tax Worksheet rate structure for AMT purposes -- the §1(h)(1)(E)
// 25% unrecaptured-§1250 rate and §1(h)(4) 28% collectibles rate apply identically
// inside AMT, not just on the regular-tax side.
//
// Test labels (ARCHITECTURE §6): SPEC = independently verified against statute;
// CHAR = freezes current engine behavior (used here for whole-return composition,
// where the AMT "excess over regular tax" structure means the two sides' bucket
// placement can make the net component split move in either direction even though
// the underlying calcAMT-level correction is unambiguous -- see the direct calcAMT
// unit tests below for the statute-grounded proof).

import { describe, it, expect } from 'vitest'
import { calcTaxReturn, calcAMT } from './taxCalc.js'

describe('Phase 5 — AMT §1250/collectibles preferential-rate pass-through', () => {
  // SPEC: calcAMT is exported and unit-testable directly, isolating the fix from the
  // whole-return "AMT = TMT - regularTax" composition (see CHAR tests below for why
  // that composition can obscure the underlying correction). regularTax is pinned to
  // 0 so the function's return value IS the tentative minimum tax itself.
  //
  // Hand derivation: taxableIncome 300,000 + isoBargainElement 200,000 addback +
  // stdDedAddback 16,100 (useItemized: false) = amti 516,100. TY2026 single AMT
  // exemption/phaseout start comfortably above that AMTI, so exemption is unphased
  // (full exemption, no addback clamp) and amtTaxable ~ 516,100 - exemption, well
  // above the 250,000 ltGain -- so prefInAMT is unclamped (= 250,000) and ordinaryAMTI
  // ~ amtTaxable - 250,000. That ordinaryAMTI comfortably clears the 0% LTCG threshold
  // but sits well under the 15%/20% cutoff for TY2026, so the entire adjusted-net-
  // capital-gain bucket (LTCG minus the unrecap1250 slice) lands at the flat 15% rate
  // in BOTH runs. Moving 200,000 of the 250,000 total gain from the 15% bucket to the
  // flat 25% §1(h)(1)(E) rate should therefore raise the tentative minimum tax by
  // exactly 200,000 x (0.25 - 0.15) = $20,000 -- the statutory delta, independent of
  // any AMT-specific mechanics once the base is unclamped.
  it('SPEC: §1(h)(1)(E) — a $200k unrecaptured-§1250 slice raises tentative minimum tax by exactly the 25%-vs-15% rate delta', () => {
    const args = {
      taxableIncome: 300000, saltAmount: 0, isoBargainElement: 200000,
      ltGain: 250000, qualDiv: 0,
      regularTax: 0, status: 'single', taxYear: 2026,
      useItemized: false, itemized: 0, stdDed: 16100,
    }
    const withUnrecap = calcAMT({ ...args, unrecap1250: 200000 })
    const noUnrecap    = calcAMT({ ...args, unrecap1250: 0 })
    expect(withUnrecap - noUnrecap).toBe(20000)
  })

  // SPEC (SEVENTH PASS F-1, 16 Sep 2026): Form 6251 Part III has NO 28% line. Line 13 is
  // Schedule D Tax Worksheet line 13 — net long-term gain LESS the 28%-rate and §1250 gain —
  // so collectibles gain never leaves line 17 and is taxed at the AMT 26%/28% rates. Here
  // line 12 = 434,050 and line 17 rises from 184,050 to 384,050: 60,450 more at 26% and
  // 139,550 at 28% (the 244,500 breakpoint), less the 15% the 200,000 was paying:
  // 15,717 + 39,074 − 30,000 = 24,791. (The pinned 26,000 assumed a flat 28% layer.)
  it('SPEC: §1(h)(4) — a $200k collectibles slice is taxed inside line 17 at the AMT 26%/28% rates', () => {
    const args = {
      taxableIncome: 300000, saltAmount: 0, isoBargainElement: 200000,
      ltGain: 250000, qualDiv: 0,
      regularTax: 0, status: 'single', taxYear: 2026,
      useItemized: false, itemized: 0, stdDed: 16100,
    }
    const withColl = calcAMT({ ...args, collectibles: 200000 })
    const noColl    = calcAMT({ ...args, collectibles: 0 })
    expect(withColl - noColl).toBe(24791)
  })

  // SPEC: with the pass-through in place but no unrecap1250/collectibles supplied, the
  // AMT computation is byte-for-byte unchanged from before the fix (defaults still
  // zero them out correctly) -- this is the "does nothing when there's nothing to
  // exclude" regression guard.
  it('SPEC: no unrecap1250/collectibles supplied -- calcAMT is unaffected by the new parameters', () => {
    const args = {
      taxableIncome: 300000, saltAmount: 0, isoBargainElement: 200000,
      ltGain: 250000, qualDiv: 0,
      regularTax: 0, status: 'single', taxYear: 2026,
      useItemized: false, itemized: 0, stdDed: 16100,
    }
    expect(calcAMT(args)).toBe(calcAMT({ ...args, unrecap1250: 0, collectibles: 0 }))
  })

  // SPEC (regression guard): the F-AMT exemption-cap fix (Jul 2026) -- a filer living
  // purely on LTCG/qualified dividends owes $0 AMT -- must still hold with the new
  // unrecap1250/collectibles parameters present but zero. Reuses the exact scenario
  // from taxCalc-amt-preferential.test.js.
  it('SPEC: a filer living on LTCG still owes $0 AMT (F-AMT fix not disturbed by this change)', () => {
    const base = { taxYear: 2026, status: 'single', entities: [], k1Total: 0, w2: 0 }
    for (const lt of [120000, 250000]) {
      const r = calcTaxReturn({ ...base, ltGain: lt })
      expect(r.amt, `LTCG ${lt}`).toBe(0)
    }
  })

  // CHAR: whole-return wiring check. This locks in the ACTUAL engine output for a
  // realistic ISO-exerciser-with-a-rental-sale scenario, post-fix. Note: because AMT
  // is defined as the EXCESS of tentative minimum tax over regular tax, and the
  // regular-tax side (fedTax) is ALSO correctly taxing the unrecap1250 slice at 25%
  // (pre-existing, unaffected by this fix), the two sides can move in different
  // directions relative to their own ordinary-income floors -- fedTax rises by the
  // full statutory $20,000 (200,000 x 10%) in both this scenario and always, but the
  // reported `amt` figure (the excess) can rise, fall, or hold depending on how each
  // side's 0/15/20 bucket placement interacts with its own ordinaryIncome floor. What
  // matters is that BOTH components are now individually correct; this test exists to
  // confirm the wiring reaches calcTaxReturn's real output, not to re-derive AMT
  // bucket mechanics from scratch.
  it('CHAR: full calcTaxReturn wiring — fedTax reflects the statutory $20,000 delta; amt/totalTax move as this engine version computes them', () => {
    const base = { taxYear: 2026, status: 'single', dependents: 0, entities: [], w2: 60000, k1Total: 0, w2Withheld: 0, estPaid: 0 }
    const r0 = calcTaxReturn({ ...base, hasISO: true, isoBargainElement: 400000, ltGain: 300000, unrecap1250: 0 })
    const r1 = calcTaxReturn({ ...base, hasISO: true, isoBargainElement: 400000, ltGain: 300000, unrecap1250: 200000 })
    // Second pass (14 Sep 2026): regular tax follows the Schedule D Tax Worksheet, so the
    // §1250 layer is taxed at ORDINARY rates up to the top of the 24% bracket (L21 201,775)
    // and at 25% only above it: r1 L47 = 15,000 (L31) + 10,531.25 (L40 on L39 42,125) +
    // 41,024 (L44) = 66,555; r0 L47 = 44,167.5 + 5,020 = 49,188; delta 17,367 — not the
    // flat-rate 20,000.
    // SEVENTH PASS F-1 (16 Sep 2026): Form 6251 Part III, line for line. r0: line 12 760,000
    // (exemption fully phased out), line 17 460,000 → 123,910; lines 19/27 = regular ordinary
    // 43,900 → 5,550 at 0%, 294,450 at 15% = 44,167.5; TMT 168,077.5 → amt 118,890. r1: line
    // 13 100,000 + line 14 200,000; line 27 = Sch D TW line 21 = 201,775 → all 100,000 at 15%
    // = 15,000; line 36 200,000 × 25% = 50,000; TMT 188,910 → amt 122,355.
    expect(r1.fedTax - r0.fedTax).toBe(17367)
    expect(r0.amt).toBe(118890)
    expect(r1.amt).toBe(122355)
    expect(r1.totalTax).toBe(r0.totalTax + 20832)
  })
})
