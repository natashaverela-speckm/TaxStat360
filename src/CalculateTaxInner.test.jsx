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
 * onUpdate received the entered P&L WITHOUT clicking the confirm button ("Done", formerly "Save P&L →").
 *
 * Strategy: render the exported ManualEntryPanel directly with a spy onUpdate. Mock the
 * component-tree-heavy sibling imports that the panel itself does not use, so importing
 * the module stays light. The pure utils (entityPredicates, parseMoney, formatMoney,
 * theme, constants) are used for real.
 */
import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('./LockedFeature', () => ({ default: () => null, isPro: () => true }))
// Partial mock: the modal COMPONENT is stubbed (heavy render tree), but the
// module's toEngineContext export must stay real — the Phase-2.2 selector
// (and therefore the Phase-3.1 badge under test) is built on it.
vi.mock('./EntityCompareModal', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, default: () => null }
})
vi.mock('./utils/apiClient.js', () => ({ apiFetch: vi.fn() }))
vi.mock('./utils/signOut', () => ({ signOut: vi.fn() }))

import { ManualEntryPanel, entityResultLabel, Step1EstimateBadge } from './CalculateTaxInner.jsx'
import { writePersonalContext, writeStep1State, normalizeF1040 } from './utils/sessionState.js'
import { selectTaxSummary } from './utils/calcSelector.js'
import { fmt } from './utils/money.js'

const lastUpdate = (spy) => spy.mock.calls[spy.mock.calls.length - 1]

describe('Finding 2 — inline manual P&L live-commits without clicking the confirm button', () => {
  it('commits entered revenue to entity.pnl as the user types (S-Corp)', () => {
    const onUpdate = vi.fn()
    const entity = { type: 'S Corporation', own: '100', pnl: {}, isManual: true }
    const { container } = render(
      <ManualEntryPanel entity={entity} idx={0} onUpdate={onUpdate} onCancel={() => {}} />,
    )

    // First MoneyInput in the panel is Gross Receipts.
    // TERMINOLOGY FIX 1.1: label is now 'Gross Receipts' — the IRS term — with no GAAP synonym.
    // The old label 'Gross Receipts (Total Revenue)' conflated the IRS gross-receipts term with
    // the GAAP revenue concept. Form-specific citations (1120-S Line 1a, Schedule C Line 1)
    // live in the tooltip, not the field label, since this component serves all entity types.
    expect(container.textContent).toContain('Gross Receipts')
    expect(container.textContent).not.toContain('Gross Revenue (Total Receipts)')
    // Category D: officer pay field leads with "Officer Compensation" (1120-S term), not "Salary".
    expect(container.textContent).toContain('Officer Compensation (W-2)')
    expect(container.textContent).not.toContain('Officer Salary (W-2)')
    // Category F: operating-expense input is "Operating Expenses", not "Business Expenses".
    expect(container.textContent).toContain('Operating Expenses (excl. Officer Compensation, Depreciation, Advertising)')
    expect(container.textContent).not.toContain('Business Expenses (excl.')
    const revenue = container.querySelector('input')
    expect(revenue).toBeTruthy()
    fireEvent.change(revenue, { target: { value: '150000' } })

    // Category F: the net line reads "Net Business Income" (not "Net Profit") once a figure is entered.
    expect(container.textContent).toContain('Net Business Income')
    expect(container.textContent).not.toContain('Net Profit')

    // No confirm-button ("Done") click occurred — the live binding must have committed.
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
    fireEvent.change(inputs[0], { target: { value: '200000' } }) // gross receipts
    fireEvent.change(inputs[1], { target: { value: '50000' } })  // operating expenses

    const [, updated] = lastUpdate(onUpdate)
    expect(updated.pnl.grossRevenue).toBe(200000)
    expect(updated.pnl.totalExpenses).toBe(50000)
    expect(updated.pnl.netProfit).toBe(150000) // 200k − 50k
  })
})

describe('Category A — entityResultLabel says "K-1" ONLY for K-1 issuers', () => {
  // The old code (isCCorp ? 'Net Profit' : 'Net / K-1') labeled directly-held Schedule E
  // rentals and Schedule C sole props as "K-1" — neither issues one. These pin the fix.
  it('S-corp and partnership are labeled Net / K-1', () => {
    expect(entityResultLabel('S Corporation')).toBe('Net / K-1')
    expect(entityResultLabel('Partnership / LLC')).toBe('Net / K-1')
    expect(entityResultLabel('Partnership / MMLLC — Passive')).toBe('Net / K-1')
  })

  it('directly-held rental is Schedule E, NOT K-1', () => {
    expect(entityResultLabel('Real Estate (Schedule E)')).toBe('Net (Sch. E)')
  })

  it('sole proprietor is Schedule C, NOT K-1', () => {
    expect(entityResultLabel('Sole Proprietor / SMLLC')).toBe('Net (Sch. C)')
  })

  it('C-corp is Net Profit (entity-level tax, no personal K-1)', () => {
    expect(entityResultLabel('C Corporation')).toBe('Net Profit')
  })

  it('never labels a non-K-1 entity as "K-1"', () => {
    for (const t of ['Real Estate (Schedule E)', 'Sole Proprietor / SMLLC', 'C Corporation']) {
      expect(entityResultLabel(t)).not.toMatch(/K-1/)
    }
  })

  it('unknown / empty type falls back to plain "Net" (no K-1)', () => {
    expect(entityResultLabel('')).toBe('Net')
    expect(entityResultLabel(undefined)).toBe('Net')
  })
})

describe('Phase 3.1 — Step1EstimateBadge: the live provisional estimate is the ENGINE figure', () => {
  const seed = (f1040, entities = []) => {
    sessionStorage.clear()
    writePersonalContext(normalizeF1040(f1040))
    writeStep1State({ entities, entitiesRaw: entities, k1Total: 0, isCoopPatron: false })
  }

  it('INVARIANT: the badge dollar figure equals selectTaxSummary().totalTax verbatim', () => {
    seed({ filingStatus: 'single', taxYear: 2026, w2Income: 200000 })
    const expected = selectTaxSummary()
    expect(expected.ok).toBe(true)
    const { container } = render(<Step1EstimateBadge entities={[]} />)
    expect(container.textContent).toContain('provisional federal estimate')
    expect(container.textContent).toContain(fmt(expected.totalTax))
    // and the figure is a real liability, not a placeholder
    expect(expected.totalTax).toBeGreaterThan(30000)
  })

  it('F15 principle: a loss year gets words, never a bare $0 or dash', () => {
    seed({ filingStatus: 'single', taxYear: 2026, w2Income: 0, capitalGains: -80000 })
    const { container } = render(<Step1EstimateBadge entities={[]} />)
    expect(container.textContent).toContain('loss year')
    expect(container.textContent).toContain('details in Step 2')
    expect(container.textContent).not.toContain('$0')
  })

  it('CHAR: an EMPTY session shows the neutral pointer — a blank form is not a "loss year"', () => {
    sessionStorage.clear()
    const { container } = render(<Step1EstimateBadge entities={[]} />)
    expect(container.textContent).toContain('full federal estimate in Step 2')
    expect(container.textContent).not.toContain('loss year')
  })

  it('CHAR: entities flow into the figure (S-Corp K-1 raises the estimate)', () => {
    seed({ filingStatus: 'single', taxYear: 2026, w2Income: 100000 })
    const base = selectTaxSummary().totalTax
    const ent = [{ name: 'Ops', type: 'S Corporation', own: 100, k1: 150000, netProfit: 150000, officerW2: 60000 }]
    seed({ filingStatus: 'single', taxYear: 2026, w2Income: 100000 }, ent)
    const withEnt = selectTaxSummary()
    expect(withEnt.totalTax).toBeGreaterThan(base)
    const { container } = render(<Step1EstimateBadge entities={ent} />)
    expect(container.textContent).toContain(fmt(withEnt.totalTax))
  })
})
