// src/taxTables-completeness.test.js
//
// F1 (consistency audit, Jul 2026): guards against silent fallback-year drift.
//
// The engine used to carry hardcoded fallbacks (TAX_TABLES[2026], AMT_TABLES[2025],
// literal thresholds) that would silently resolve to a STALE year's numbers once a
// new tax year was added to SUPPORTED_TAX_YEARS but its table row was forgotten.
// Those fallbacks are gone; this test is the loud failure that replaces them.
//
// If you add a year to SUPPORTED_TAX_YEARS without adding a complete TAX_TABLES
// row, this test fails in CI — before a wrong number ever reaches a user.

import { describe, it, expect } from 'vitest'
import { SUPPORTED_TAX_YEARS } from './constants.js'
import { TAX_TABLES, AMT_TABLES, SALT_CAPS } from './taxCalc.js'

// Every sub-table the engine and UI now read WITHOUT a literal fallback.
const REQUIRED_TABLES = [
  'std', 'sec179', 'brackets', 'ltcg', 'niit', 'addlMed',
  'ebl', 'ctc', 'retirement', 'hsa', 'amt', 'qbi',
]
const REQUIRED_SCALARS = ['ssWageBase', 'saltCap']
// Fields read directly (no `?? literal`) by AIAnalysis / the engine.
const REQUIRED_NESTED = {
  retirement: ['sepIraMax', 'solo401kDeferral'],
  hsa: ['selfOnly', 'family'],
  ctc: ['perChild'],
}
const FILING_STATUSES = ['single', 'mfj', 'mfs', 'hoh', 'qss']

describe('TAX_TABLES completeness for every supported year', () => {
  it('SUPPORTED_TAX_YEARS mirrors the keys present in TAX_TABLES', () => {
    for (const year of SUPPORTED_TAX_YEARS) {
      expect(TAX_TABLES[year], `TAX_TABLES is missing year ${year}`).toBeTruthy()
    }
  })

  for (const year of SUPPORTED_TAX_YEARS) {
    describe(`tax year ${year}`, () => {
      const t = () => TAX_TABLES[year] || {}

      it('has every required sub-table', () => {
        for (const key of REQUIRED_TABLES) {
          expect(t()[key], `TAX_TABLES[${year}].${key} missing`).toBeTruthy()
        }
      })

      it('has every required scalar', () => {
        for (const key of REQUIRED_SCALARS) {
          expect(
            Number.isFinite(t()[key]),
            `TAX_TABLES[${year}].${key} is not a finite number`,
          ).toBe(true)
        }
      })

      it('has the nested fields read without a literal fallback', () => {
        for (const [parent, fields] of Object.entries(REQUIRED_NESTED)) {
          for (const f of fields) {
            expect(
              Number.isFinite(t()[parent]?.[f]),
              `TAX_TABLES[${year}].${parent}.${f} is not a finite number`,
            ).toBe(true)
          }
        }
      })

      it('brackets, std, ltcg, niit and addlMed cover all five filing statuses', () => {
        for (const table of ['std', 'brackets', 'ltcg', 'niit', 'addlMed']) {
          for (const fs of FILING_STATUSES) {
            expect(
              t()[table]?.[fs],
              `TAX_TABLES[${year}].${table}.${fs} missing`,
            ).toBeDefined()
          }
        }
      })

      it('derived AMT_TABLES and SALT_CAPS resolve for this year', () => {
        expect(AMT_TABLES[year], `AMT_TABLES[${year}] missing`).toBeTruthy()
        expect(
          Number.isFinite(SALT_CAPS[year]),
          `SALT_CAPS[${year}] is not a finite number`,
        ).toBe(true)
      })
    })
  }
})
