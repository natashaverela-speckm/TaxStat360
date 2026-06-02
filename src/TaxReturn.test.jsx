// @vitest-environment jsdom
/**
 * TaxReturn.jsx — F-05 + F-06 aggregation regression tests
 *
 * These tests verify that TaxReturn.jsx correctly aggregates Step 1 entity data
 * into the values passed to calcTaxReturn:
 *
 *   F-05 (PR #154): entity.box17K → f4797Inc  (Section 1231 gain, K-1 Box 17K)
 *   F-06 (PR #157): entity.pnl.officerSalary → w2 (officer salary auto-included)
 *
 * Test strategy: spy on calcTaxReturn to capture what TaxReturn.jsx passes it,
 * then assert the aggregated values (f4797Inc, w2) are correct. This tests the
 * wiring — the aggregation logic in TaxReturn.jsx — without re-testing the tax
 * engine (covered separately in taxCalc.test.js).
 *
 * Mocking:
 *   - calcTaxReturn: vi.fn() spy — capture call arguments
 *   - readStep1State: control entities (box17K, pnl.officerSalary)
 *   - readPersonalContext: control personal context (w2Income, filingStatus, etc.)
 *   - writeTaxYear / writePersonalContext: no-ops
 *   - MoneyInput / FederalScopeBanner: lightweight stubs
 *
 * @see src/TaxReturn.jsx — production file under test
 * @see src/taxCalc.js — tax engine (not under test here)
 */

import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ─── Mocks (hoisted before imports by Vitest) ─────────────────────────────────

vi.mock('./taxCalc', () => ({
  TAX_TABLES: {},
  AMT_TABLES: {},
  SALT_CAPS: { 2024: 10000, 2025: 10000, 2026: 40000 },
  getTable: vi.fn(() => []),
  getStdDed: vi.fn(() => 14600),
  getBrackets: vi.fn(() => []),
  getLTCGThresholds: vi.fn(() => ({})),
  getAddlMedicareThreshold: vi.fn(() => 200000),
  calcFederalTax: vi.fn(() => 0),
  calcPreferentialTax: vi.fn(() => 0),
  calcNIIT: vi.fn(() => 0),
  calcAMT: vi.fn(() => 0),
  calcQBI: vi.fn(() => ({ deduction: 0, limitApplied: 'none', caps: {} })),
  nv: vi.fn(v => parseFloat(v) || 0),
  calcTaxReturn: vi.fn(() => ({
    grossIncome: 0, agi: 0, seNetIncome: 0, seTax: 0, halfSE: 0,
    adjustments: 0, stdDed: 14600, deduction: 14600,
    qbiBasis: 0, taxableBeforeQBI: 0, qbi: 0, qbiLimitApplied: 'none',
    taxableAfterQBI: 0, ordinaryTaxableIncome: 0, taxableIncome: 0,
    ordFedTax: 0, prefTax: 0, fedTax: 0, marginalRate: 0.22,
    additionalMedicare: 0, niit: 0, childCredit: 0,
    amt: 0, totalTax: 0, effectiveRate: 0,
    withheld: 0, estimated: 0, totalPayments: 0, balance: 0,
    rentalNII: 0, nii: 0, quarterlyRecommended: 0,
  })),
}))

vi.mock('./utils/sessionState.js', () => ({
  // readPersonalContext default returns {} — tests that need a specific
  // w2Income or other field must call readPersonalContext.mockReturnValue()
  // directly in that test. The beforeEach resets this to {} before each test
  // so prior mockReturnValue calls do not bleed through.
  readPersonalContext: vi.fn(() => ({})),
  writePersonalContext: vi.fn(),
  writeTaxYear: vi.fn(),
  readStep1State: vi.fn(() => ({ entities: [], k1Total: 0, isCoopPatron: false })),
  readTaxYear: vi.fn(() => 2025),
  readStep1StateRaw: vi.fn(() => []),
  writeStep1State: vi.fn(),
  clearStep1State: vi.fn(),
  normalizeF1040: vi.fn(x => x),
}))

vi.mock('./components/MoneyInput.jsx', () => ({
  default: ({ value, onChange, placeholder, style }) => (
    <input
      type="number"
      value={value ?? ''}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      style={style}
      data-testid="money-input"
    />
  ),
}))

vi.mock('./components/FederalScopeBanner.jsx', () => ({
  default: () => null,
}))

vi.mock('./components/DismissibleNotice', () => ({
  default: ({ children }) => <div data-testid="dismissible-notice">{children}</div>,
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────
import TaxReturn from './TaxReturn'
import { calcTaxReturn } from './taxCalc'
import { readStep1State, readPersonalContext } from './utils/sessionState.js'

// ─── Helper ───────────────────────────────────────────────────────────────────
function renderTaxReturn() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TaxReturn />
    </MemoryRouter>
  )
}

// ─── F-05: Box 17K aggregation into f4797Inc ─────────────────────────────────

describe('TaxReturn — F-05: K-1 Box 17K aggregation into f4797Inc', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // FIX: vi.clearAllMocks() clears call history but does NOT reset mockReturnValue.
    // Explicitly reset both mocks to their default return values before every test
    // so no prior test's mockReturnValue bleeds through.
    readPersonalContext.mockReturnValue({})
    readStep1State.mockReturnValue({ entities: [], k1Total: 0, isCoopPatron: false })
  })

  it('f4797Inc includes entity box17K when manually-entered form4797 is zero', () => {
    readStep1State.mockReturnValue({
      entities: [{ type: 'S Corporation', k1: 80000, netProfit: 80000, own: 100, box17K: 15000 }],
      k1Total: 80000,
      isCoopPatron: false,
    })

    renderTaxReturn()

    expect(calcTaxReturn).toHaveBeenCalled()
    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.f4797Inc).toBe(15000)
  })

  it('f4797Inc accumulates box17K across multiple entities', () => {
    readStep1State.mockReturnValue({
      entities: [
        { type: 'S Corporation', k1: 50000, netProfit: 50000, own: 100, box17K: 10000 },
        { type: 'Partnership / MMLLC — Passive', k1: 30000, netProfit: 30000, own: 100, box17K: 7500 },
      ],
      k1Total: 80000,
      isCoopPatron: false,
    })

    renderTaxReturn()

    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.f4797Inc).toBe(17500) // 10000 + 7500
  })

  it('f4797Inc is zero when no entities have box17K', () => {
    readStep1State.mockReturnValue({
      entities: [{ type: 'S Corporation', k1: 80000, netProfit: 80000, own: 100 }],
      k1Total: 80000,
      isCoopPatron: false,
    })

    renderTaxReturn()

    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.f4797Inc).toBe(0)
  })

  it('f4797Inc treats undefined box17K as zero (older saved records)', () => {
    readStep1State.mockReturnValue({
      entities: [{ type: 'S Corporation', k1: 80000, netProfit: 80000, own: 100, box17K: undefined }],
      k1Total: 80000,
      isCoopPatron: false,
    })

    renderTaxReturn()

    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.f4797Inc).toBe(0)
  })

  it('does not throw on empty entities array', () => {
    readStep1State.mockReturnValue({ entities: [], k1Total: 0, isCoopPatron: false })
    expect(() => renderTaxReturn()).not.toThrow()
    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.f4797Inc).toBe(0)
  })
})

// ─── F-06: Officer salary aggregation into w2 ─────────────────────────────────

describe('TaxReturn — F-06: officer salary aggregation into w2 total', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // FIX: vi.clearAllMocks() clears call history but does NOT reset mockReturnValue.
    // Explicitly reset both mocks to their default return values before every test
    // so no prior test's mockReturnValue bleeds through.
    // Without this reset, the test "w2 sums additional W-2 and officer salary"
    // sets readPersonalContext.mockReturnValue({ w2Income: 40000 }) and that value
    // persists into subsequent tests, causing "w2 is zero" to receive 40000.
    readPersonalContext.mockReturnValue({})
    readStep1State.mockReturnValue({ entities: [], k1Total: 0, isCoopPatron: false })
  })

  it('w2 includes entity officer salary when additional w2Income is zero', () => {
    readStep1State.mockReturnValue({
      entities: [{
        type: 'S Corporation', k1: 80000, netProfit: 80000, own: 100,
        pnl: { officerSalary: 60000, netProfit: 80000 },
      }],
      k1Total: 80000,
      isCoopPatron: false,
    })

    renderTaxReturn()

    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.w2).toBe(60000)
  })

  it('w2 sums additional W-2 and officer salary correctly', () => {
    readStep1State.mockReturnValue({
      entities: [{
        type: 'S Corporation', k1: 80000, netProfit: 80000, own: 100,
        pnl: { officerSalary: 60000 },
      }],
      k1Total: 80000,
      isCoopPatron: false,
    })
    // Supply w2Income via mockReturnValue — this is scoped to this test only.
    // The beforeEach resets readPersonalContext back to {} before the next test.
    readPersonalContext.mockReturnValue({ w2Income: 40000 })

    renderTaxReturn()

    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.w2).toBe(100000) // 60000 officer + 40000 additional
  })

  it('w2 aggregates officer salary from multiple corp entities (S-Corp + C-Corp)', () => {
    readStep1State.mockReturnValue({
      entities: [
        { type: 'S Corporation', k1: 80000, netProfit: 80000, own: 100, pnl: { officerSalary: 60000 } },
        { type: 'C Corporation', k1: 0, netProfit: 100000, own: 100, pnl: { officerSalary: 50000 } },
      ],
      k1Total: 80000,
      isCoopPatron: false,
    })

    renderTaxReturn()

    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.w2).toBe(110000) // 60000 + 50000
  })

  it('w2 is zero when no officer salary and no additional W-2', () => {
    readStep1State.mockReturnValue({
      entities: [{ type: 'S Corporation', k1: 80000, netProfit: 80000, own: 100, pnl: { officerSalary: 0 } }],
      k1Total: 80000,
      isCoopPatron: false,
    })

    renderTaxReturn()

    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.w2).toBe(0)
  })

  it('w2 handles missing pnl object without throwing (pre-F-06 entity records)', () => {
    readStep1State.mockReturnValue({
      entities: [{ type: 'S Corporation', k1: 80000, netProfit: 80000, own: 100 }], // no pnl
      k1Total: 80000,
      isCoopPatron: false,
    })

    expect(() => renderTaxReturn()).not.toThrow()
    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.w2).toBe(0)
  })

  it('non-corp entities do not contribute to officer salary aggregation', () => {
    // Partnership entities don't have officerSalary — confirmed by not having pnl.officerSalary
    // in the data shape. This test guards against accidentally summing the wrong field.
    readStep1State.mockReturnValue({
      entities: [
        { type: 'Partnership / MMLLC — Active', k1: 50000, netProfit: 50000, own: 100, pnl: { officerSalary: 0 } },
        { type: 'Sole Proprietor / Single-Member LLC', k1: 30000, netProfit: 30000, own: 100 },
      ],
      k1Total: 80000,
      isCoopPatron: false,
    })

    renderTaxReturn()

    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.w2).toBe(0)
  })
})

// ─── MED-FLOOR: medical passed raw to engine + itemized wiring ────────────────
//
// After the IRC §213(a) medical-floor fix, TaxReturn.jsx no longer pre-sums raw
// medical into itemizedAmt. It passes medical RAW as `medicalExpenses` (the engine
// applies the 7.5%-of-AGI floor) and sums only the non-medical sub-fields
// (mortgage + charitable + SALT) into itemizedAmt. These tests pin that wiring,
// mirroring the F-05/F-06 spy-on-args strategy above. The floor MATH itself is
// covered in taxCalc.test.js (calcTaxReturn is mocked here).

describe('TaxReturn — MED-FLOOR: medical passed raw, excluded from itemizedAmt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    readPersonalContext.mockReturnValue({})
    readStep1State.mockReturnValue({ entities: [], k1Total: 0, isCoopPatron: false })
  })

  it('passes medicalExpenses raw and keeps it out of itemizedAmt', () => {
    readPersonalContext.mockReturnValue({
      useItemized: true, mortgageInt: '10000', charitableContr: '0',
      saltAmount: '0', medicalAmt: '20000',
    })
    renderTaxReturn()
    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.medicalExpenses).toBe(20000) // raw, pre-floor — engine applies §213(a)
    expect(args.itemizedAmt).toBe(10000)     // non-medical sub-fields only
  })

  it('sums non-medical sub-fields into itemizedAmt; medical stays separate', () => {
    readPersonalContext.mockReturnValue({
      useItemized: true, mortgageInt: '12000', charitableContr: '5000',
      saltAmount: '8000', medicalAmt: '3000',
    })
    renderTaxReturn()
    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.itemizedAmt).toBe(25000)     // 12000 + 5000 + 8000
    expect(args.medicalExpenses).toBe(3000)
  })

  it('direct-total override (no sub-fields) passes itemizedAmt with medicalExpenses=0', () => {
    readPersonalContext.mockReturnValue({ useItemized: true, itemizedAmt: '30000' })
    renderTaxReturn()
    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.itemizedAmt).toBe(30000)
    expect(args.medicalExpenses).toBe(0)     // override assumed to already net the floor
  })

  it('medicalExpenses and itemizedAmt are 0 when itemizing is off', () => {
    readPersonalContext.mockReturnValue({ useItemized: false, medicalAmt: '20000' })
    renderTaxReturn()
    const args = calcTaxReturn.mock.calls[0][0]
    expect(args.medicalExpenses).toBe(0)
    expect(args.itemizedAmt).toBe(0)
  })
})
