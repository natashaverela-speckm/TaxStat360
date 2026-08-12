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
vi.mock('../utils/apiClient.js', () => ({ apiFetch: vi.fn() }))
vi.mock('./utils/signOut', () => ({ signOut: vi.fn() }))

import { ManualEntryPanel, entityResultLabel, Step1EstimateBadge, EntityCard } from './CalculateTaxInner.jsx'
import { writePersonalContext, writeStep1State, normalizeF1040 } from '../utils/sessionState.js'
import { selectTaxSummary } from '../utils/calcSelector.js'
import { fmt } from '../utils/money.js'

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

describe('Round 4 (pre-launch fresh-eyes audit) — editing unrelated P&L fields must not clear box17V_wages', () => {
  it('S-Corp: box17V_wages (the §199A K-1 statement wage figure) survives an edit to an UNRELATED P&L field (revenue)', () => {
    // Regression test for the BUG-B "fix" that was itself the bug: it reset box17V_wages to
    // '' whenever this effect re-ran for ANY reason (its deps include every P&L field, not
    // just officer salary), as long as officer comp was nonzero. box17V_wages is a
    // deliberately-entered, independent figure (total company W-2 wages, from the K-1's
    // §199A statement) -- not something meant to track officer salary -- so it must never be
    // silently cleared by editing revenue, expenses, depreciation, advertising, or other
    // deductions.
    const onUpdate = vi.fn()
    const entity = {
      type: 'S Corporation', own: '100', isManual: true,
      box17V_wages: 500000,  // company-wide W-2 wages, deliberately entered, different from officer comp
      pnl: { grossRevenue: 0, totalExpenses: 0, officerSalary: 150000, depreciation: 0, advertising: 0, otherDeductions: 0, netProfit: 0 },
    }
    const { container } = render(
      <ManualEntryPanel entity={entity} idx={0} onUpdate={onUpdate} onCancel={() => {}} />,
    )
    const inputs = container.querySelectorAll('input')
    fireEvent.change(inputs[0], { target: { value: '900000' } }) // gross receipts — unrelated to box17V_wages

    expect(onUpdate).toHaveBeenCalled()
    const [, updated] = lastUpdate(onUpdate)
    expect(updated.pnl.grossRevenue).toBe(900000)
    expect(updated.box17V_wages).toBe(500000)  // must survive — this is the exact bug
  })

  it('S-Corp: box17V_wages survives even when officer compensation itself changes', () => {
    // The ORIGINAL stated intent of BUG-B ("officer salary changed, so clear a stale mirror")
    // still doesn't apply -- box17V_wages is never an auto-populated mirror of officer salary
    // anywhere in this codebase, so it must survive this edit too.
    const onUpdate = vi.fn()
    const entity = {
      type: 'S Corporation', own: '100', isManual: true,
      box17V_wages: 500000,
      pnl: { grossRevenue: 900000, totalExpenses: 0, officerSalary: 150000, depreciation: 0, advertising: 0, otherDeductions: 0, netProfit: 900000 },
    }
    const { container } = render(
      <ManualEntryPanel entity={entity} idx={0} onUpdate={onUpdate} onCancel={() => {}} />,
    )
    const officerInput = container.querySelector('[aria-label="Officer salary (your W-2 wages from this entity)"]')
    expect(officerInput).toBeTruthy()
    fireEvent.change(officerInput, { target: { value: '175000' } })

    const [, updated] = lastUpdate(onUpdate)
    expect(updated.pnl.officerSalary).toBe(175000)
    expect(updated.box17V_wages).toBe(500000)
  })
})

describe('Fresh-eyes fix (Aug 2026) — K-1 direct-entry "Done" saves the typed K-1 value', () => {
  // Bug: applyManual() (the Done button's handler) always computed
  // netProfit as rv - totalExpenses, ignoring manK1Direct even when K-1
  // direct-entry mode was active. Since rv/totalExpenses collapse to just
  // effectiveSal (officer comp) in that mode, Done silently saved
  // -officerComp (S-Corp) or $0 (Partnership) instead of the K-1 amount
  // the user actually typed. The live preview looked correct because a
  // separate live-bind effect computed it correctly on every keystroke —
  // only the terminal Done click used the wrong formula.
  it('S-Corp: Done saves the typed K-1 loss, not -officerComp', () => {
    const onUpdate = vi.fn()
    const entity = { type: 'S Corporation', own: '100', pnl: {}, isManual: true }
    const { container, getByText } = render(
      <ManualEntryPanel entity={entity} idx={0} onUpdate={onUpdate} onCancel={() => {}} />,
    )
    fireEvent.click(getByText(/Have a K-1\? Enter Box 1 directly/))
    const inputs = container.querySelectorAll('input')
    fireEvent.change(inputs[0], { target: { value: '-200000' } }) // K-1 Box 1
    fireEvent.change(inputs[1], { target: { value: '45000' } })   // Officer Compensation
    onUpdate.mockClear()
    fireEvent.click(getByText('Done'))
    const [, updated] = lastUpdate(onUpdate)
    expect(updated.pnl.netProfit).toBe(-200000)
    expect(updated.pnl.netProfit).not.toBe(-45000)
  })

  it('Partnership: Done saves the typed K-1 value, not $0', () => {
    const onUpdate = vi.fn()
    const entity = { type: 'Partnership / LLC', own: '100', pnl: {}, isManual: true }
    const { container, getByText } = render(
      <ManualEntryPanel entity={entity} idx={1} onUpdate={onUpdate} onCancel={() => {}} />,
    )
    fireEvent.click(getByText(/Have a K-1\? Enter Box 1 directly/))
    const inputs = container.querySelectorAll('input')
    fireEvent.change(inputs[0], { target: { value: '-50000' } }) // K-1 Box 1
    onUpdate.mockClear()
    fireEvent.click(getByText('Done'))
    const [, updated] = lastUpdate(onUpdate)
    expect(updated.pnl.netProfit).toBe(-50000)
    expect(updated.pnl.netProfit).not.toBe(0)
  })

  it('S-Corp: re-editing an already-saved K-1 entity and clicking Done persists the new value', () => {
    const onUpdate = vi.fn()
    // Entity as it would look after a prior K-1-direct save.
    const entity = {
      type: 'S Corporation', own: '100', isManual: true, k1DirectMode: true,
      officerW2: 80000,
      pnl: { grossRevenue: 0, totalExpenses: 0, officerSalary: 0, depreciation: 0, advertising: 0, otherDeductions: 0, netProfit: -80000, categories: {} },
    }
    const { container, getByText } = render(
      <ManualEntryPanel entity={entity} idx={0} onUpdate={onUpdate} onCancel={() => {}} />,
    )
    // K-1 direct mode should already be selected on re-open (k1DirectMode: true).
    const inputs = container.querySelectorAll('input')
    fireEvent.change(inputs[0], { target: { value: '-100000' } }) // edit K-1 Box 1
    onUpdate.mockClear()
    fireEvent.click(getByText('Done'))
    const [, updated] = lastUpdate(onUpdate)
    expect(updated.pnl.netProfit).toBe(-100000)
  })
})

describe('UX fix (fresh-pass audit, Aug 2026) — Partnership §704(d) gets the same collapsed-card basis badge as S-Corp §1366(d)', () => {
  // Bug: basisBadge (the collapsed-entity-card confirmation/warning) was gated
  // `if (!isSC || !scBasis) return null` even though scBasis itself is already
  // computed for both S-Corp AND Partnership. An S-Corp with sufficient basis
  // got an immediate "Full loss is deductible" badge on the collapsed card; a
  // Partnership in the identical position got nothing at the card level (the
  // same confirmation existed, but only inside the collapsed-by-default
  // "Outside Basis" panel). Fix extends the badge to Partnership with §704(d)
  // citation and "outside basis" wording instead of §1366(d)/"basis".
  const baseProps = {
    idx: 0,
    onUpdate: () => {},
    onAggregationElection: () => {},
    portfolioAggregationElected: false,
    onRemove: () => {},
    colorAccent: '#000',
    isExpanded: false,
    onToggleExpand: () => {},
  }

  it('S-Corp: shows the §1366(d) "Full loss is deductible" badge when basis is sufficient', () => {
    const entity = {
      type: 'S Corporation', name: 'Test S-Corp', own: '100',
      k1DirectMode: true, pnl: { netProfit: -50000 },
      stockBasis: '80000', debtBasis: '',
    }
    const { container } = render(<EntityCard entity={entity} {...baseProps} />)
    expect(container.textContent).toContain('§1366(d): Full $50,000 loss is deductible — within $80,000 basis.')
  })

  it('Partnership: shows the equivalent §704(d) badge when outside basis is sufficient (previously showed nothing)', () => {
    const entity = {
      type: 'Partnership / LLC', name: 'Test Partnership', own: '100',
      k1DirectMode: true, pnl: { netProfit: -60000 },
      stockBasis: '80000', debtBasis: '',
    }
    const { container } = render(<EntityCard entity={entity} {...baseProps} />)
    expect(container.textContent).toContain('§704(d): Full $60,000 loss is deductible — within $80,000 outside basis.')
  })

  it('Partnership: shows the "enter outside basis" prompt when no basis is entered', () => {
    const entity = {
      type: 'Partnership / LLC', name: 'Test Partnership 2', own: '100',
      k1DirectMode: true, pnl: { netProfit: -60000 },
    }
    const { container } = render(<EntityCard entity={entity} {...baseProps} />)
    expect(container.textContent).toContain('§704(d): enter outside basis — $60,000 loss may be limited.')
  })

  it('Partnership: shows the suspended-loss badge when outside basis is insufficient', () => {
    const entity = {
      type: 'Partnership / LLC', name: 'Test Partnership 3', own: '100',
      k1DirectMode: true, pnl: { netProfit: -60000 },
      stockBasis: '20000', debtBasis: '',
    }
    const { container } = render(<EntityCard entity={entity} {...baseProps} />)
    expect(container.textContent).toContain('§704(d): $40,000 of your $60,000 loss is suspended — outside basis insufficient.')
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
