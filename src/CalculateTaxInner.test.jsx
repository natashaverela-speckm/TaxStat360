// @vitest-environment jsdom
/**
 * CalculateTaxInner.jsx — Finding 2 (Critical) regression test.
 *
 * Bug (UX audit Finding 2): the inline manual P&L editor (ManualEntryPanel) committed
 * its figures to the parent entity ONLY when the user clicked "Save P&L →". Collapsing
 * the panel (the "Edit P&L" toggle), collapsing the entity card, or advancing to Step 2
 * discarded everything typed — so the entity reached Step 2/3 with an empty $0 P&L
 * (the "I typed my income and the app says I have none" moment).
 *
 * Fix: the panel now LIVE-BINDS — typing revenue/expenses commits to the entity as the
 * user types (like the W-2 field in Step 2). These tests type into the panel and assert
 * onUpdate received the entered P&L WITHOUT any "Save P&L →" click.
 *
 * Strategy: render the exported ManualEntryPanel directly with a spy onUpdate. Mock the
 * component-tree-heavy sibling imports that the panel itself does not use, so importing
 * the module stays light. The pure utils (entityPredicates, parseMoney, formatMoney,
 * theme, constants) are used for real.
 */
import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('./LockedFeature', () => ({ default: () => null, isPro: () => true }))
vi.mock('./EntityCompareModal', () => ({ default: () => null }))
vi.mock('./utils/apiClient.js', () => ({ apiFetch: vi.fn() }))
vi.mock('./utils/signOut', () => ({ signOut: vi.fn() }))

import { ManualEntryPanel } from './CalculateTaxInner.jsx'

const lastUpdate = (spy) => spy.mock.calls[spy.mock.calls.length - 1]

describe('Finding 2 — inline manual P&L live-commits without clicking "Save P&L"', () => {
  it('commits entered revenue to entity.pnl as the user types (S-Corp)', () => {
    const onUpdate = vi.fn()
    const entity = { type: 'S Corporation', own: '100', pnl: {}, isManual: true }
    const { container } = render(
      <ManualEntryPanel entity={entity} idx={0} onUpdate={onUpdate} onCancel={() => {}} />,
    )

    // First MoneyInput in the panel is Gross Revenue.
    const revenue = container.querySelector('input')
    expect(revenue).toBeTruthy()
    fireEvent.change(revenue, { target: { value: '150000' } })

    // No "Save P&L →" click occurred — the live binding must have committed.
    expect(onUpdate).toHaveBeenCalled()
    const [idxArg, updated] = lastUpdate(onUpdate)
    expect(idxArg).toBe(0)
    expect(updated.pnl.grossRevenue).toBe(150000)
    expect(updated.pnl.netProfit).toBe(150000) // no expenses/salary entered yet
    expect(updated.isManual).toBe(true)
  })

  it('reflects expenses in the committed net profit (Sole Proprietor, still no Save click)', () => {
    const onUpdate = vi.fn()
    const entity = { type: 'Sole Proprietor / SMLLC', own: '100', pnl: {}, isManual: true }
    const { container } = render(
      <ManualEntryPanel entity={entity} idx={2} onUpdate={onUpdate} onCancel={() => {}} />,
    )

    const inputs = container.querySelectorAll('input')
    fireEvent.change(inputs[0], { target: { value: '200000' } }) // gross revenue
    fireEvent.change(inputs[1], { target: { value: '50000' } })  // operating expenses

    const [, updated] = lastUpdate(onUpdate)
    expect(updated.pnl.grossRevenue).toBe(200000)
    expect(updated.pnl.totalExpenses).toBe(50000)
    expect(updated.pnl.netProfit).toBe(150000) // 200k − 50k
  })
})
