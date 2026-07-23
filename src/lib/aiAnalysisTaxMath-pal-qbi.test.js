// src/aiAnalysisTaxMath-pal-qbi.test.js
//
// F3/F8 (consistency audit, Jul 2026): known-good coverage for the PAL §469(i)
// allowance and QBI §199A threshold helpers extracted from AIAnalysis.jsx.
// Previously these lived inside the 2,600-line component; now they are pure and
// directly unit-tested.

import { describe, it, expect } from 'vitest'
import {
  computePassiveLossAllowance,
  qbiThresholdsFor,
} from './aiAnalysisTaxMath.js'
import { QBI_THRESHOLDS } from './taxCalc.js'
import { CURRENT_TAX_YEAR, SUPPORTED_TAX_YEARS } from './constants.js'

describe('computePassiveLossAllowance (§469(i) $25,000 rental-loss allowance)', () => {
  it('full $25,000 allowance below the $100K phase-out, clamped to the loss', () => {
    expect(computePassiveLossAllowance({ agi: 90000, filing: 'single', reNetShare: -30000 }))
      .toEqual({ allowance: 25000, usable: 25000 })
  })

  it('usable is clamped to the actual loss when the loss is smaller', () => {
    // allowance still 25000 at 90K AGI; loss is only 8000
    expect(computePassiveLossAllowance({ agi: 90000, filing: 'single', reNetShare: -8000 }))
      .toEqual({ allowance: 25000, usable: 8000 })
  })

  it('phases out 50c per $1 of MAGI over $100K', () => {
    // 25000 - (120000-100000)*0.5 = 15000
    expect(computePassiveLossAllowance({ agi: 120000, filing: 'single', reNetShare: -8000 }))
      .toEqual({ allowance: 15000, usable: 8000 })
  })

  it('fully phased out at/above $150K MAGI', () => {
    expect(computePassiveLossAllowance({ agi: 160000, filing: 'single', reNetShare: -30000 }))
      .toEqual({ allowance: 0, usable: 0 })
  })

  it('MFS filers get $0 (§469(i)(5)(B)) regardless of AGI or loss', () => {
    expect(computePassiveLossAllowance({ agi: 90000, filing: 'mfs', reNetShare: -30000 }))
      .toEqual({ allowance: 0, usable: 0 })
  })
})

describe('qbiThresholdsFor (§199A wage/UBIA phase-in thresholds)', () => {
  it('returns the exact table row for every supported year', () => {
    for (const y of SUPPORTED_TAX_YEARS) {
      expect(qbiThresholdsFor(y)).toBe(QBI_THRESHOLDS[y])
      expect(Number.isFinite(qbiThresholdsFor(y).single)).toBe(true)
      expect(Number.isFinite(qbiThresholdsFor(y).mfj)).toBe(true)
    }
  })

  it('falls back to CURRENT_TAX_YEAR (not a stale hardcoded year) for an unknown year', () => {
    expect(qbiThresholdsFor(9999)).toBe(QBI_THRESHOLDS[CURRENT_TAX_YEAR])
    // 2026 spec values (Rev. Proc. 2025-32): single $201,750 / MFJ $403,500
    expect(qbiThresholdsFor(9999).single).toBe(201750)
    expect(qbiThresholdsFor(9999).mfj).toBe(403500)
  })
})
