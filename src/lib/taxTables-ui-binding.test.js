// src/taxTables-ui-binding.test.js
//
// AUDIT (P2 accuracy): year-specific tax figures were hardcoded into JSX, so they drifted
// from TAX_TABLES and shipped wrong numbers:
//   - the §199A helper quoted $201,775 as the 2026 SINGLE threshold. That is the MFS figure
//     (and the 32% bracket start); "all other returns" is $201,750 (Rev. Proc. 2025-32 §4.26).
//   - the HSA card badge used the 2025 $4,300 limit while its own body used 2026's $4,400,
//     showing ~$1,376 and $1,408 for the same item.
//
// ARCHITECTURE §1 already forbids hard-coding a threshold in JSX. These tests enforce it for
// the specific figures that broke, and pin the correct 2026 values.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { QBI_THRESHOLDS, getTable } from './taxCalc.js'

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8')

describe('2026 tax-table values (SPEC: Rev. Proc. 2025-32)', () => {
  it('§199A thresholds: single/HOH $201,750 · MFS $201,775 · MFJ $403,500', () => {
    expect(QBI_THRESHOLDS[2026].single).toBe(201750)
    expect(QBI_THRESHOLDS[2026].hoh).toBe(201750)
    expect(QBI_THRESHOLDS[2026].mfs).toBe(201775)
    expect(QBI_THRESHOLDS[2026].mfj).toBe(403500)
  })

  it('HSA 2026 limits: $4,400 self-only / $8,750 family', () => {
    expect(getTable(2026).hsa.selfOnly).toBe(4400)
    expect(getTable(2026).hsa.family).toBe(8750)
  })
})

describe('UI must bind to the tables, not hardcode the figures', () => {
  it('CalculateTaxInner does not hardcode a §199A threshold', () => {
    const src = read('../components/CalculateTaxInner.jsx')
    // $201,775 is the MFS / 32%-bracket figure; it must NOT appear as this file only ever
    // shows single/HOH and MFJ thresholds. ($197,300 is the correct 2025 single value and
    // legitimately remains in 2025-context tooltips, so it is not forbidden.)
    expect(src).not.toMatch(/\$201,775/)
    expect(src).toMatch(/QBI_THRESHOLDS\[2026\]\.single/)
  })

  it('AIAnalysis HSA badge is year-bound, not the stale $4,300 literal', () => {
    const src = read('../components/AIAnalysis.jsx')
    expect(src).not.toMatch(/Math\.round\(4300 \* marginalRate\)/)
    expect(src).toMatch(/hsa\?\.selfOnly/)
  })

  it('TaxReturn HSA tooltip is year-bound, not the stale 2025 literals', () => {
    const src = read('../components/TaxReturn.jsx')
    expect(src).not.toMatch(/2025 limits: \$4,300/)
    expect(src).toMatch(/getTable\(taxYear\)\?\.hsa/)
  })
})

// ─── AUDIT H3 / H4 (Sep 2026) ────────────────────────────────────────────────
// Two more year-keyed figures were being rendered from hardcoded JSX rather than
// from TAX_TABLES, and both were stale in production:
//   H3 — the mileage card and Aria both stated 72.5¢ as "the" 2026 rate. 2026 is a
//        SPLIT-RATE year: Announcement 2026-11 modified Notice 2026-10 and raised the
//        business rate to 76¢ from July 1 — the first midyear change since 2022. The
//        app was a full quarter stale on the most common deduction question there is.
//   H4 — the §179 card hardcoded "$2.5M in 2025 / $4M", the 2025 figures, and showed
//        them even when the user had selected 2026 — while the ENGINE
//        (calc179Limitation) correctly used the 2026 table. Card and math disagreed.

describe('AUDIT H3 — 2026 standard mileage rate is split across two periods', () => {
  it('the table carries both periods with their governing IRS guidance', () => {
    const periods = getTable(2026).mileageRatePeriods
    expect(Array.isArray(periods)).toBe(true)
    expect(periods).toHaveLength(2)

    expect(periods[0].rate).toBe(0.725)
    expect(periods[0].to).toBe('2026-06-30')
    expect(periods[0].cite).toMatch(/Notice 2026-10/)

    expect(periods[1].rate).toBe(0.76)
    expect(periods[1].from).toBe('2026-07-01')
    expect(periods[1].cite).toMatch(/Announcement 2026-11/)
  })

  it('mileageRate is the CURRENT (later-period) rate, so single-rate callers stay right', () => {
    const t = getTable(2026)
    expect(t.mileageRate).toBe(0.76)
    expect(t.mileageRate).toBe(t.mileageRatePeriods[t.mileageRatePeriods.length - 1].rate)
  })

  it('periods are contiguous and cover the whole year', () => {
    const p = getTable(2026).mileageRatePeriods
    expect(p[0].from).toBe('2026-01-01')
    expect(p[p.length - 1].to).toBe('2026-12-31')
    // No gap: the second period starts the day after the first ends.
    expect(new Date(p[1].from) - new Date(p[0].to)).toBe(86400000)
  })

  it('single-rate years still work and are unchanged', () => {
    expect(getTable(2025).mileageRate).toBe(0.70)
    expect(getTable(2024).mileageRate).toBe(0.67)
    expect(getTable(2025).mileageRatePeriods).toBeUndefined()
  })

  it('AIAnalysis renders every period instead of asserting one rate', () => {
    const src = read('../components/AIAnalysis.jsx')
    expect(src).toMatch(/mileageRatePeriods/)
    // The finding must render the computed sentence, not a hardcoded single rate.
    // (The one-rate wording still exists as the ternary's fallback for single-rate
    // years like 2025 — that branch is correct and must stay.)
    expect(src).toMatch(/detail: `No vehicle or mileage deduction is recorded\.[^`]*\$\{_mileRateSentence\}/)
    expect(src).toMatch(/① Standard Mileage Rate — multiply business miles by the IRS rate \(\$\{_mileRateShort\}\)/)
  })

  it('Aria states both 2026 rates, not just January’s', () => {
    const src = read('../components/Aria.jsx')
    const guard = src.slice(src.indexOf('rx: /mileage/i'))
    expect(guard).toMatch(/72\.5/)
    expect(guard).toMatch(/76 cents/)
    expect(guard).toMatch(/Announcement 2026-11/)
  })
})

describe('AUDIT H4 — §179 figures come from the table the engine uses', () => {
  it('2026 §179: $2,560,000 cap, $4,090,000 phase-out (Rev. Proc. 2025-32)', () => {
    expect(getTable(2026).sec179.cap).toBe(2560000)
    expect(getTable(2026).sec179.phaseOutStart).toBe(4090000)
  })

  it('the opportunity card no longer hardcodes the 2025 figures', () => {
    const src = read('../components/AIAnalysis.jsx')
    expect(src).not.toMatch(/up to \$2\.5M in 2025/)
    expect(src).not.toMatch(/phase-out begins above \$4M/)
  })

  it('the card binds to getTable(year).sec179', () => {
    const src = read('../components/AIAnalysis.jsx')
    const card = src.slice(src.indexOf('§179 Equipment Deduction'))
    expect(src).toMatch(/getTable\(year\)\?\.sec179/)
    expect(card.slice(0, 1200)).toMatch(/_sec179Cap/)
    expect(card.slice(0, 1200)).toMatch(/_sec179PhaseOut/)
  })
})
