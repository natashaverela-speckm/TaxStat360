// @vitest-environment jsdom
// NINTH PASS (22 Sep 2026) — pre-launch final review, Step-1 surfaces.
//
//   N-3  An S-Corp card entered in K-1 direct mode and then changed to Sole Proprietor kept
//        writing the stale Box 1 as the Schedule C net; the P&L fields the user typed into
//        changed nothing (live: Box 1 $20,000 → sole prop, gross receipts $420, card $20,000).
//   N-4  The "Passive shareholder" (§469(h)) and "Limited partner" (§1402(a)(13)) attestations
//        rendered only in the P&L branch — a K-1-only investor never saw them.
//   N-9  "Compare Entity Structures" always targeted entities[0], even a Schedule E rental.
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

const lastUpdate = (spy) => spy.mock.calls[spy.mock.calls.length - 1]
const k1Entity = (type) => ({
  id: 'e1', name: 'K1', type, own: '100', k1DirectMode: true, officerW2: 0,
  pnl: { grossRevenue: 0, totalExpenses: 0, officerSalary: 0, employerPayrollTax: 0, depreciation: 0, advertising: 0, otherDeductions: 0, netProfit: 20000, categories: {} },
})

describe('NINTH PASS N-3 — K-1 direct mode is gated on the entity type', () => {
  it('a sole prop carrying a stale k1DirectMode flag renders the P&L form and the P&L drives the net', () => {
    const onUpdate = vi.fn()
    const entity = k1Entity('Sole Proprietor / SMLLC')
    const { container, queryByText } = render(<ManualEntryPanel entity={entity} idx={0} onUpdate={onUpdate} onCancel={() => {}} />)
    // No K-1 toggle, no Box 1 field, gross receipts visible.
    expect(queryByText(/Have a K-1\? Enter Box 1 directly/)).toBeNull()
    expect(queryByText(/K-1 Box 1 — Net Ordinary Business Income/)).toBeNull()
    const gross = container.querySelector('input[aria-label="Gross receipts"]')
    expect(gross).not.toBeNull()
    fireEvent.change(gross, { target: { value: '420' } })
    const [, updated] = lastUpdate(onUpdate)
    expect(updated.k1DirectMode).toBe(false)
    expect(updated.pnl.netProfit).toBe(420)
  })
  it('an S-Corp in K-1 mode still renders the Box 1 field (mode preserved for K-1 issuers)', () => {
    const onUpdate = vi.fn()
    const { queryByText } = render(<ManualEntryPanel entity={k1Entity('S Corporation')} idx={0} onUpdate={onUpdate} onCancel={() => {}} />)
    expect(queryByText(/K-1 Box 1 — Net Ordinary Business Income/)).not.toBeNull()
  })
  it('source: the entity-type change handler clears k1DirectMode for types without a K-1 path', () => {
    const src = readFileSync(join(__dirname, 'CalculateTaxInner.jsx'), 'utf8')
    expect(src).toMatch(/const dropK1Mode = !!entity\.k1DirectMode && !\(isSCorpEntity\(newType\) \|\| isLimitedPartnerEligibleType\(newType\)\)/)
    expect((src.match(/\.\.\.k1ResetPatch,/g) || []).length).toBe(2)
    expect(src).toMatch(/const k1Active\s+= useK1Direct && k1DirectAllowed/)
  })
})

describe('NINTH PASS N-4 — passive attestations render in K-1 direct mode', () => {
  it('S-Corp, K-1 mode: the §469(h) passive-shareholder checkbox is present and wired', () => {
    const onUpdate = vi.fn()
    const { container } = render(<ManualEntryPanel entity={k1Entity('S Corporation')} idx={0} onUpdate={onUpdate} onCancel={() => {}} />)
    const box = container.querySelector('#passivesh_0')
    expect(box).not.toBeNull()
    fireEvent.click(box)
    const [, updated] = lastUpdate(onUpdate)
    expect(updated.passiveShareholder).toBe(true)
  })
  it('Partnership, K-1 mode: the §1402(a)(13) limited-partner checkbox is present', () => {
    const { container } = render(<ManualEntryPanel entity={k1Entity('Partnership / LLC')} idx={0} onUpdate={vi.fn()} onCancel={() => {}} />)
    expect(container.querySelector('#limpartner_0')).not.toBeNull()
  })
  it('P&L mode still shows them (unchanged)', () => {
    const e = { ...k1Entity('S Corporation'), k1DirectMode: false }
    const { container } = render(<ManualEntryPanel entity={e} idx={0} onUpdate={vi.fn()} onCancel={() => {}} />)
    expect(container.querySelector('#passivesh_0')).not.toBeNull()
  })
})

describe('NINTH PASS N-9 — the compare modal targets business entities only', () => {
  it('source: the modal receives the first non-rental entity and a picker exists for several', () => {
    const src = readFileSync(join(__dirname, 'CalculateTaxInner.jsx'), 'utf8')
    expect(src).toMatch(/\.filter\(\(\{ e \}\) => e && !isRealEstateEntity\(e\.type\)\)/)
    expect(src).toMatch(/entity=\{compareIdx >= 0 \? entities\[compareIdx\] : undefined\}/)
    expect(src).toMatch(/entityIdx=\{compareIdx\}/)
    expect(src).toMatch(/id="compare-entity-pick"/)
  })
  it('EntityCard for a rental still renders (smoke)', () => {
    const entity = { id: 'r', name: 'R', type: 'Real Estate (Schedule E)', own: '100', pnl: { netProfit: 5000 }, priorPAL: '' }
    const { container } = render(<EntityCard entity={entity} idx={0} onUpdate={() => {}} onRemove={() => {}} isExpanded={true} onToggleExpand={() => {}} taxYear={2026} />)
    expect(container.textContent).toMatch(/Real Estate/)
  })
})
