// @vitest-environment jsdom
// EIGHTH PASS (18 Sep 2026) — independent fresh-eyes audit, Step-1 surfaces.
//
//   F-3  Removing a rental card left its prior-year unallowed passive loss (Form 8582
//        line 1c) in the personal context — TaxReturn mirrors the card total there on every
//        render — where the migration fallback picked it up as an "orphaned" carryforward and
//        silently offset the next rental's income. Live: rental A with prior PAL $10,000
//        removed; rental B added with net +$5,000 → "Rental Income (allowed) $0" and "$5,000
//        of rental loss is passive and suspended".
//   F-4  Partnership guaranteed payments in the gross-receipts path were added on top of net
//        profit instead of being deducted by the partnership first (gross $400,000 /
//        expenses $100,000 / GP $50,000 → K-1 income $350,000; $300,000 correct).
//   F-9  The C-Corp card showed Net Profit $200,000 while the engine taxed $192,350 (the
//        employer payroll tax is deducted at the corporate layer).
import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('./LockedFeature', () => ({ default: () => null, isPro: () => true }))
vi.mock('./EntityCompareModal', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, default: () => null }
})
vi.mock('../utils/apiClient.js', () => ({ apiFetch: vi.fn(), apiGet: vi.fn(), apiPost: vi.fn() }))
vi.mock('./utils/signOut', () => ({ signOut: vi.fn() }))

import { ManualEntryPanel, EntityCard } from './CalculateTaxInner.jsx'
import { deriveRentalPortfolioInputs, releaseCardPriorPAL } from '../utils/rentalPortfolio.js'
import { calcTaxReturn } from '../lib/taxCalc.js'

const lastUpdate = (spy) => spy.mock.calls[spy.mock.calls.length - 1]
const RE = 'Real Estate (Schedule E)'

describe('EIGHTH PASS F-3 — a removed rental card takes its prior-year PAL with it', () => {
  it('SPEC (rentalPortfolio): the migration fallback only fires for cards that never carried the field', () => {
    // Legacy save: rental cards without `priorPAL` at all, PAL in the personal context → still honored.
    const legacy = deriveRentalPortfolioInputs([{ type: RE, own: '100', pnl: { netProfit: 5000 } }], 10000)
    expect(legacy.orphanedPriorPAL).toBe(10000)
    expect(legacy.priorPAL).toBe(10000)
    // A card created since the field moved onto the cards carries `priorPAL` (blank = none):
    // the cards are the source of truth, and a stale context value is NOT resurrected.
    const current = deriveRentalPortfolioInputs([{ type: RE, own: '100', pnl: { netProfit: 5000 }, priorPAL: '' }], 10000)
    expect(current.orphanedPriorPAL).toBe(0)
    expect(current.priorPAL).toBe(0)
    // With no rental cards at all the context value is still the only place a legacy
    // carryforward can live, so it is kept (it can be absorbed by passive K-1 income).
    const none = deriveRentalPortfolioInputs([], 10000)
    expect(none.orphanedPriorPAL).toBe(10000)
  })
  it('SPEC (releaseCardPriorPAL): removing the card subtracts its amount from the mirrored context', () => {
    const ctx = { priorPassiveLossCarryforward: 10000, w2Income: 120000 }
    const after = releaseCardPriorPAL(ctx, { type: RE, priorPAL: '10,000' })
    expect(after.priorPassiveLossCarryforward).toBe(0)
    expect(after.w2Income).toBe(120000)
    // Two cards, one removed: only that card's share comes out.
    expect(releaseCardPriorPAL({ priorPassiveLossCarryforward: 25000 }, { type: RE, priorPAL: 10000 }).priorPassiveLossCarryforward).toBe(15000)
    // Nothing to release → the same object back (no spurious write).
    expect(releaseCardPriorPAL(ctx, { type: RE, priorPAL: '' })).toBe(ctx)
    expect(releaseCardPriorPAL({ priorPassiveLossCarryforward: 0 }, { type: RE, priorPAL: 5000 })).toMatchObject({ priorPassiveLossCarryforward: 0 })
  })
  it('SPEC (engine): the live repro — a fresh rental with +$5,000 and no carryforward is allowed in full', () => {
    const cards = [{ type: RE, own: '100', pnl: { netProfit: 5000 }, priorPAL: '', isActiveParticipant: true }]
    const port  = deriveRentalPortfolioInputs(cards, 10000)   // stale context value from the removed card
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', w2: 200000, entities: cards, k1Total: 5000,
      priorPassiveLossCarryforward: port.priorPAL, isActiveParticipant: true })
    expect(r.rentalAllowed).toBe(5000)
    expect(r.palSuspendedRental).toBe(0)
    expect(r.agi).toBe(205000)
  })
  it('source: removeEntity releases the card PAL from the personal context, and new cards carry priorPAL', () => {
    const src = readFileSync(join(__dirname, 'CalculateTaxInner.jsx'), 'utf8')
    const start = src.indexOf('const removeEntity = useCallback')
    const fn = src.slice(start, src.indexOf('const handleIntegrationDisconnect', start))
    expect(fn).toMatch(/const removed = entities\[idx\]/)
    expect(fn).toMatch(/releaseCardPriorPAL\(ctxBefore, removed\)/)
    expect(fn).toMatch(/if \(ctxAfter !== ctxBefore\) writePersonalContext\(ctxAfter\)/)
    expect(src).toMatch(/isREP: false, isActiveParticipant: false,\s*\n\s*priorPAL: '',/)
  })
})

describe('EIGHTH PASS F-4 — guaranteed payments are deducted by the partnership in the P&L path', () => {
  it('SPEC: gross $400,000, expenses $100,000, GP $50,000 → Box 1 $250,000 (GP inside totalExpenses)', () => {
    const onUpdate = vi.fn()
    const entity = { type: 'Partnership / LLC', own: '100', pnl: {}, isManual: true, guaranteedPayments: '50000' }
    const { container } = render(<ManualEntryPanel entity={entity} idx={0} onUpdate={onUpdate} onCancel={() => {}} />)
    const inputs = container.querySelectorAll('input')
    fireEvent.change(inputs[0], { target: { value: '400000' } })   // Gross receipts
    fireEvent.change(inputs[1], { target: { value: '100000' } })   // Operating expenses
    const [, updated] = lastUpdate(onUpdate)
    expect(updated.pnl.grossRevenue).toBe(400000)
    expect(updated.pnl.guaranteedPayments).toBe(50000)
    expect(updated.pnl.totalExpenses).toBe(150000)
    expect(updated.pnl.netProfit).toBe(250000)
    expect(container.textContent).toContain('incl. Guaranteed Payments')
  })
  it('SPEC: K-1 direct mode is untouched — Box 1 is already net of guaranteed payments', () => {
    const onUpdate = vi.fn()
    const entity = { type: 'Partnership / LLC', own: '100', pnl: { netProfit: 250000 }, isManual: true, k1DirectMode: true, guaranteedPayments: '50000' }
    render(<ManualEntryPanel entity={entity} idx={0} onUpdate={onUpdate} onCancel={() => {}} />)
    const [, updated] = lastUpdate(onUpdate)
    expect(updated.k1DirectMode).toBe(true)
    expect(updated.pnl.netProfit).toBe(250000)
    expect(updated.pnl.totalExpenses).toBe(0)
  })
  it('SPEC (engine): the same card taxes $250,000 of Box 1 + $50,000 of GP = $300,000, SE on all of it, QBI on Box 1 only', () => {
    const e = { type: 'Partnership / LLC', own: '100', guaranteedPayments: '50000',
      pnl: { grossRevenue: 400000, totalExpenses: 150000, guaranteedPayments: 50000, netProfit: 250000 } }
    const r = calcTaxReturn({ taxYear: 2026, status: 'single', entities: [e], k1Total: 250000 })
    expect(r.guaranteedPaymentsTotal).toBe(50000)
    expect(r.seNetIncome).toBe(300000)
    expect(r.grossIncome).toBe(300000)
    expect(r.qbiBasis).toBe(250000 - r.halfSE)   // GP excluded, ½-SE netted (Reg. §1.199A-3(b)(2)(ii)(A), (b)(1)(vi))
  })
})

describe('EIGHTH PASS F-9 — the C-Corp card shows the corporate-level payroll-tax deduction', () => {
  it('SPEC: officer salary $100,000 on a $200,000 net-profit C-Corp → "less Employer Payroll Tax" $7,650 and corporate taxable income $192,350', () => {
    const entity = { type: 'C Corporation', name: 'CC', own: '100', isManual: true, officerW2: 100000,
      pnl: { grossRevenue: 400000, totalExpenses: 200000, officerSalary: 100000, employerPayrollTax: 0, netProfit: 200000 } }
    const { container } = render(
      <EntityCard entity={entity} idx={0} onUpdate={() => {}} onRemove={() => {}} isExpanded={true} onToggleExpand={() => {}} taxYear={2026} />,
    )
    expect(container.textContent).toContain('less Employer Payroll Tax on officer salary')
    expect(container.textContent).toContain('$7,650')
    expect(container.textContent).toContain('Corporate taxable income')
    expect(container.textContent).toContain('$192,350')
  })
})
