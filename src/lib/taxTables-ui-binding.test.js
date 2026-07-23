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
