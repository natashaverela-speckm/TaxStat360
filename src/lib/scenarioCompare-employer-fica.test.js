// src/lib/scenarioCompare-employer-fica.test.js
//
// AUDIT M2 (second launch audit, Sep 2026) — EMPLOYER FICA WAS NOT DEDUCTED FROM THE
// S-CORP K-1, SO THE ENTITY COMPARISON WAS BIASED.
//
// The S-Corp branch computed `scK1 = max(0, np - salary)`. The employer half of payroll
// tax is a deductible business expense (IRC §162), so it reduces the profit that passes
// through on the K-1 — exactly as the C-Corp branch already did via
// calcCCorpCorporateLayer (`profitBeforeTax = np - salary - employerFICA`).
//
// Two branches, one cost, two treatments — and the comparison this engine exists to
// produce inherited the difference.
//
// Root cause: the first audit's H1 fix extracted calcEmployerFICA() and threaded it
// through the Tax Tracker, the What-If Simulator and the C-Corp layer.
// calcCCorpCorporateLayer's comment says the extraction was made "so the S-Corp path
// uses the identical arithmetic" — and this S-Corp path was never switched over.
//
// Test labels (ARCHITECTURE §6): SPEC — verified against the cited authority.

import { describe, it, expect } from 'vitest'
import { compareEntityScenarios } from './scenarioCompare.js'
import { calcEmployerFICA } from './taxCalc.js'

const compare = (netProfitShare, officerSalary, filingStatus = 'single') =>
  compareEntityScenarios({
    personalContext: { filingStatus, taxYear: 2026 },
    entities: [{
      type: 'S Corporation', own: 100, netProfit: netProfitShare,
      pnl: { netProfit: netProfitShare, officerSalary },
    }],
    entityIdx: 0, netProfitShare, officerSalary,
  })

const taxOf = (out, label) =>
  Math.round((out.scenarios || []).find((s) => (s.label || s.key) === label)?.totalTax ?? NaN)

describe('M2 — the S-Corp K-1 is net of employer payroll tax', () => {
  it('SPEC: employer FICA on a $120k salary is $9,180 (6.2% + 1.45%, under the wage base)', () => {
    // The exact figure the finding cites, and the amount the K-1 was overstated by.
    expect(calcEmployerFICA(120000, 2026)).toBe(9180)
  })

  it('the S-Corp scenario is cheaper once the deduction is taken', () => {
    // $300k profit / $120k salary: S-Corp total tax was 74,144, now 71,794.
    const out = compare(300000, 120000)
    expect(taxOf(out, 'S Corporation')).toBe(71794)
  })

  it('the headline savings figure is no longer understated', () => {
    // This is the number the user acts on — "switching saves you $X".
    const out = compare(300000, 120000)
    expect(Math.round(out.savings)).toBe(20330)   // was 17,980
  })

  it('SPEC: the S-Corp and C-Corp branches now treat employer FICA identically', () => {
    // The structural point. Both branches deduct the same cost from the profit that
    // reaches the owner; neither may treat it as free.
    const src = readSource()
    expect(src).toMatch(/const scEmployerFICA = calcEmployerFICA\(salary, taxYear\)/)
    expect(src).toMatch(/const scK1\s+= Math\.max\(0, np - salary - scEmployerFICA\)/)
    expect(src).not.toMatch(/const scK1\s+= Math\.max\(0, np - salary\)\s*$/m)
  })
})

describe('M2 — the bug changed the RECOMMENDATION, not just a number', () => {
  it('$70k profit / $56k salary: Sole Proprietor -> S Corporation', () => {
    // Before the fix: SP 14,343 vs S-Corp 14,522 — the tool recommended Sole Proprietor.
    // After:          SP 14,343 vs S-Corp 14,041 — S Corporation wins by $302.
    // Squarely in the income range this product's customers occupy.
    const out = compare(70000, 56000)
    expect(taxOf(out, 'Sole Proprietor / Schedule C')).toBe(14343)
    expect(taxOf(out, 'S Corporation')).toBe(14041)
    expect(out.best).toBe('sCorp')
  })

  it('$50k profit / $40k salary: the margin widens from $32 to $326', () => {
    const out = compare(50000, 40000)
    expect(out.best).toBe('sCorp')
    expect(Math.round(out.savings)).toBe(326)
  })

  it('cases that were never close are unaffected in direction', () => {
    // A correction of a few thousand dollars must not flip a comparison decided by tens
    // of thousands — a guard against over-correcting in the other direction.
    for (const [np, sal] of [[800000, 200000], [2000000, 400000]]) {
      const out = compare(np, sal)
      expect(out.best).toBe('sCorp')
      expect(taxOf(out, 'C Corporation')).toBeGreaterThan(taxOf(out, 'S Corporation'))
    }
  })
})

function readSource() {
  // eslint-disable-next-line no-undef
  const { readFileSync } = require('node:fs')
  return readFileSync(new URL('./scenarioCompare.js', import.meta.url), 'utf8')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}
