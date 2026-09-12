// @vitest-environment jsdom
// src/utils/calcSelector-taxyear-audit.test.js
//
// LAUNCH CHECK N-1 (12 Sep 2026) — the live-session selector computed on 2026
// tables whatever year the user had selected.
//
// Verified on the production site before the fix: with 2024 selected, Step 2
// (which reads readTaxYear() directly) showed $16,041 for a $150,000 W-2 /
// −$30,000 S-Corp K-1 return; the Step-1 provisional card, Aria's COMPUTED
// RETURN and AIAnalysis — all fed by selectTaxSummary() — showed $15,370,
// which is the same return on 2026 tables ($16,100 standard deduction).
//
// Root cause: the year selectors write ts360_taxyear (writeTaxYear), but
// TaxReturn's auto-save never writes taxYear into ts360_f1040, so
// readPersonalContext().taxYear was always defaultTaxYear(). The selector
// now takes the year from readTaxYear(), the same source Step 2 uses.
//
// Saved records had the sibling bug: the year is stored at rec.taxYear /
// rec.biz.year, not in f1040, so summarizeRecord() also defaulted to 2026.
//
// All expected figures below are SPEC: hand-computed from the Revenue
// Procedures, arithmetic in the comments.

import { describe, it, expect, beforeEach } from 'vitest'
import { summarizeRecord, selectTaxSummary, SUMMARY_KEYS } from './calcSelector.js'
import { writePersonalContext, writeStep1State, writeTaxYear, normalizeF1040 } from './sessionState.js'

// Single, W-2 $110,000, no entities. Taxable = 110,000 − standard deduction.
//   2024: std 14,600 → 95,400. 1,160 + 4,266 + (95,400 − 47,150) × 22% = 16,041
//   2025: std 15,750 → 94,250. 1,192.50 + 4,386 + (94,250 − 48,475) × 22% = 15,649
//   2026: std 16,100 → 93,900. 1,240 + 4,560 + (93,900 − 50,400) × 22% = 15,370
const EXPECTED = { 2024: 16041, 2025: 15649, 2026: 15370 }
const f1040 = { filingStatus: 'single', w2Income: 110000 }

describe('LAUNCH CHECK N-1 — selectTaxSummary honours the selected tax year', () => {
  beforeEach(() => sessionStorage.clear())

  for (const year of [2024, 2025, 2026]) {
    it(`SPEC: ${year} selected → federal income tax ${EXPECTED[year]} (not the 2026 figure)`, () => {
      // Mirror production exactly: the personal context is written WITHOUT taxYear
      // (TaxReturn's auto-save payload has never carried it) and the year selector
      // writes ts360_taxyear.
      writePersonalContext(normalizeF1040(f1040))
      writeStep1State({ entities: [], k1Total: 0 })
      writeTaxYear(year)
      const s = selectTaxSummary()
      expect(s.ok).toBe(true)
      expect(Math.round(s.fedTax)).toBe(EXPECTED[year])
    })
  }

  it('SPEC: changing only the year changes the live summary (Step-1 card must re-run on the year)', () => {
    writePersonalContext(normalizeF1040(f1040))
    writeStep1State({ entities: [], k1Total: 0 })
    writeTaxYear(2026)
    const a = selectTaxSummary()
    writeTaxYear(2024)
    const b = selectTaxSummary()
    expect(Math.round(a.fedTax)).toBe(15370)
    expect(Math.round(b.fedTax)).toBe(16041)
  })
})

describe('LAUNCH CHECK N-1 — summarizeRecord uses the record-level year', () => {
  it('SPEC: a saved record with taxYear at the top level (the shape doSave writes) is summarized on that year', () => {
    const rec = { taxYear: 2024, f1040, entities: [], biz: { year: 2024 } }
    expect(Math.round(summarizeRecord(rec).fedTax)).toBe(16041)
  })

  it('SPEC: rec.biz.year is honoured when rec.taxYear is absent (legacy records)', () => {
    const rec = { f1040, entities: [], biz: { year: 2025 } }
    expect(Math.round(summarizeRecord(rec).fedTax)).toBe(15649)
  })

  it('CHAR: an explicit f1040.taxYear still wins (existing tests and fixtures rely on it)', () => {
    const rec = { taxYear: 2024, f1040: { ...f1040, taxYear: 2026 }, entities: [] }
    expect(Math.round(summarizeRecord(rec).fedTax)).toBe(15370)
  })
})

describe('LAUNCH CHECK N-3 — the limitation keys Aria narrates from are on the read list', () => {
  it('CHAR: SALT / deduction / adjustment / released-loss keys are summary keys', () => {
    for (const k of ['stdDed', 'itemized', 'deduction', 'saltEntered', 'saltAllowed', 'saltCapApplied',
      'saltDisallowed', 'hsaDed', 'studentLoanDed', 'halfSE', 'priorSuspendedLossApplied', 'priorSuspendedLossRemaining']) {
      expect(SUMMARY_KEYS, k).toContain(k)
    }
  })

  it('SPEC: 2026 MFJ, $560,000 MAGI — SALT cap phased down to $23,900 and exposed (the figure Aria misexplained live)', () => {
    // §164(b)(7) as amended by OBBBA §70120: $40,400 − 30% × (560,000 − 505,000) = 40,400 − 16,500 = 23,900.
    // Entered SALT $60,000 → allowed $23,900; + $20,000 mortgage interest = itemized $43,900 > $32,200 std.
    const rec = {
      taxYear: 2026,
      f1040: { filingStatus: 'mfj', w2Income: 560000, useItemized: true, itemizedAmt: 80000, saltAmount: 60000, mortgageInt: 20000 },
      entities: [],
    }
    const s = summarizeRecord(rec)
    expect(s.ok).toBe(true)
    expect(s.saltEntered).toBe(60000)
    expect(s.saltCapApplied).toBe(23900)
    expect(s.saltAllowed).toBe(23900)
    expect(s.itemized).toBe(43900)
    expect(s.deduction).toBe(43900)
    expect(s.stdDed).toBe(32200)
  })
})
