// @vitest-environment jsdom
/**
 * Phase 1 (Audit Synthesis, Aug 2026) — coverage backfill.
 *
 * The §163(j) gross-receipts disclosure and the depreciation soft warning
 * (both in ManualEntryPanel, CalculateTaxInner.jsx) shipped without any test
 * coverage. See KNOWN_LIMITATIONS.md "163J-NOT-MODELED" and "DEP-UNVALIDATED"
 * for the statutory background — both are disclosure-only advisories, never a
 * calculation change, so these tests assert on rendered warning text, not on
 * any figure in the committed entity. Assertions use each warning's unique
 * heading phrase (not a bare word like "depreciation") since the field's own
 * label/tooltip text also legitimately contains that word.
 */
import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('./LockedFeature', () => ({ default: () => null, isPro: () => true }))
vi.mock('./EntityCompareModal', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, default: () => null }
})
vi.mock('../utils/apiClient.js', () => ({ apiFetch: vi.fn() }))
vi.mock('./utils/signOut', () => ({ signOut: vi.fn() }))

import { ManualEntryPanel } from './CalculateTaxInner.jsx'

const SEC163J_HEADING = '§163(j) Business Interest Limitation — Not Calculated'
const DEP_HEADING = 'Depreciation Looks Large Relative to Gross Receipts'

function renderPanel() {
  const onUpdate = vi.fn()
  const entity = { type: 'Sole Proprietor / SMLLC', own: '100', pnl: {}, isManual: true }
  const utils = render(
    <ManualEntryPanel entity={entity} idx={0} onUpdate={onUpdate} onCancel={() => {}} />,
  )
  return {
    ...utils,
    revenueInput: () => utils.container.querySelector('input[aria-label="Gross receipts"]'),
    depInput: () => utils.container.querySelector('input[aria-label="Depreciation — total deduction this year"]'),
  }
}

describe('SEC163J disclosure (Phase 1, Audit Synthesis) — gross-receipts advisory', () => {
  it('does not render when gross receipts are $0', () => {
    const { container } = renderPanel()
    expect(container.textContent).not.toContain(SEC163J_HEADING)
  })

  it('does not render just below the disclosure trigger (75% of the $29M approx threshold)', () => {
    const { container, revenueInput } = renderPanel()
    // Trigger is manRev > 29,000,000 * 0.75 = 21,750,000
    fireEvent.change(revenueInput(), { target: { value: '21000000' } })
    expect(container.textContent).not.toContain(SEC163J_HEADING)
  })

  it('renders once gross receipts cross the disclosure trigger', () => {
    const { container, revenueInput } = renderPanel()
    fireEvent.change(revenueInput(), { target: { value: '25000000' } })
    expect(container.textContent).toContain(SEC163J_HEADING)
  })
})

describe('DEP-UNVALIDATED soft warning (Phase 1, Audit Synthesis) — depreciation advisory', () => {
  it('does not render for a modest depreciation entry relative to receipts', () => {
    const { container, revenueInput, depInput } = renderPanel()
    fireEvent.change(revenueInput(), { target: { value: '200000' } })
    fireEvent.change(depInput(), { target: { value: '50000' } }) // 25% of receipts, below the 50% trigger
    expect(container.textContent).not.toContain(DEP_HEADING)
  })

  it('renders when depreciation exceeds 50% of this entity’s own gross receipts', () => {
    const { container, revenueInput, depInput } = renderPanel()
    fireEvent.change(revenueInput(), { target: { value: '200000' } })
    fireEvent.change(depInput(), { target: { value: '150000' } }) // 75% of receipts
    expect(container.textContent).toContain(DEP_HEADING)
  })

  it('uses the $100,000 receipts floor so a low-revenue entity is not flagged on a routine entry', () => {
    const { container, revenueInput, depInput } = renderPanel()
    // Gross receipts far below the floor; depreciation is a plausible, modest figure
    // relative to the $100,000 floor (well under 50% of it) and must NOT trigger.
    fireEvent.change(revenueInput(), { target: { value: '5000' } })
    fireEvent.change(depInput(), { target: { value: '20000' } })
    expect(container.textContent).not.toContain(DEP_HEADING)
  })

  it('DOES trigger above the floor even for a low-revenue entity (floor, not zero, is the comparison base)', () => {
    const { container, revenueInput, depInput } = renderPanel()
    fireEvent.change(revenueInput(), { target: { value: '5000' } })
    fireEvent.change(depInput(), { target: { value: '60000' } }) // > 50% of the $100,000 floor
    expect(container.textContent).toContain(DEP_HEADING)
  })
})
