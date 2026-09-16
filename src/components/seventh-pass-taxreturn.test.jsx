// @vitest-environment jsdom
// SEVENTH PASS (independent wiring audit, 16 Sep 2026) — Step-2 (TaxReturn.jsx) SPEC tests
// against the REAL engine and the REAL sessionState module. calcTaxReturn is wrapped in a spy
// so the exact engine input Step 2 builds can be asserted alongside what the page renders.
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../lib/taxCalc.js', async () => {
  const actual = await vi.importActual('../lib/taxCalc.js')
  return { ...actual, calcTaxReturn: vi.fn(actual.calcTaxReturn) }
})

import TaxReturn from './TaxReturn.jsx'
import EntityCompareModal from './EntityCompareModal.jsx'
import { calcTaxReturn, calcCCorpCorporateLayer, calcEmployerFICA } from '../lib/taxCalc.js'
import { writePersonalContext, writeStep1State, writeTaxYear, readUserRecords, normalizeF1040 } from '../utils/sessionState.js'

const renderTR = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TaxReturn /></MemoryRouter>)
const lastInput  = () => calcTaxReturn.mock.calls[calcTaxReturn.mock.calls.length - 1][0]
const lastResult = () => calcTaxReturn.mock.results[calcTaxReturn.mock.results.length - 1].value
const rowValue = (label) => {
  const el = screen.getAllByText(label)[0]
  return el.parentElement.querySelector('span:last-child').textContent
}

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); vi.clearAllMocks()
  writeTaxYear(2026)
})

describe('H-1 (Step 2) — the rental card\'s "Active participant" box governs the §469(i) allowance', () => {
  it('SPEC: card unchecked after a Dashboard record load ⇒ loss suspended; the page and the engine agree', () => {
    writePersonalContext(normalizeF1040({ filingStatus: 'single', w2Income: 80000 }))   // restores the retired flag as true
    const rental = { type: 'Real Estate (Schedule E)', name: 'Duplex', own: '100',
      pnl: { grossRevenue: 20000, totalExpenses: 50000, netProfit: -30000 }, isREP: false, isActiveParticipant: false, qbiEligible: false }
    writeStep1State({ entities: [rental], entitiesRaw: [rental], k1Total: -30000 })
    renderTR()
    const r = lastResult()
    expect(screen.getByText('Passive · suspended')).toBeTruthy()
    expect(r.rentalAllowed).toBe(0)
    expect(r.palSuspendedRental).toBe(30000)
    expect(screen.getByText(/§469 Passive Loss Suspended/)).toBeTruthy()
  })
})

describe('M-1 (Step 2) — REP status is derived from the rental card on every render', () => {
  it('SPEC: session isREP=true from an earlier visit + card isREP=false ⇒ engine gets isREP=false; loss suspended', () => {
    writePersonalContext({ filingStatus: 'single', w2Income: 200000, isREP: true, rentalAggregationElection: true })
    const rental = { type: 'Real Estate (Schedule E)', name: 'Duplex', own: '100',
      pnl: { grossRevenue: 20000, totalExpenses: 80000, netProfit: -60000 },
      isREP: false, rentalAggregationElection: true, isActiveParticipant: false }
    writeStep1State({ entities: [rental], entitiesRaw: [rental], k1Total: -60000 })
    renderTR()
    expect(lastInput().isREP).toBe(false)
    expect(lastResult().rentalAllowed).toBe(0)
  })
})

describe('H-3 (Step 2) — "Save This Record" persists everything the page computed on', () => {
  it('SPEC: record.f1040 carries the itemized sub-fields, the engine-ready itemized lump, the 4797 attestation and the installment boxes', async () => {
    writePersonalContext({ filingStatus: 'single', w2Income: 250000, useItemized: true, itemizedAmt: '', mortgageInt: 30000, charitableContr: 12000, medicalAmt: 5000, saltAmount: 15000, f4797MateriallyParticipated: true, form4797: 50000, estQ1: 5000, estQ2: 5000 })
    writeStep1State({ entities: [], entitiesRaw: [], k1Total: 0 })
    renderTR()
    const inp = lastInput()
    expect(inp.itemizedAmt).toBe(57000)
    expect(inp.f4797MateriallyParticipated).toBe(true)
    fireEvent.click(screen.getByText('Save This Record'))
    await waitFor(() => expect(readUserRecords().length).toBe(1))
    const f = readUserRecords()[0].f1040
    expect(f.itemizedAmt).toBe(57000)
    expect(f).toMatchObject({ mortgageInt: 30000, charitableContr: 12000, medicalAmt: 5000, f4797MateriallyParticipated: true, estQ1: 5000, estQ2: 5000, taxYear: 2026 })
    // and the round trip reproduces the Step-2 deduction
    const pc = normalizeF1040(f)
    expect(pc.itemizedAmt).toBe(57000)
    expect(pc.charitableContr).toBe(12000)
  })
})

describe('H-2 (Step 2) — the installment boxes are credited and persisted', () => {
  it('SPEC: typing Q1 + Q2 = 10,000 with the total blank ⇒ totalPayments 10,000 and the boxes reach ts360_f1040', () => {
    writePersonalContext({ filingStatus: 'single', w2Income: 150000 })
    writeStep1State({ entities: [], entitiesRaw: [], k1Total: 0 })
    renderTR()
    fireEvent.change(screen.getByLabelText('Q1 paid (Apr 15)'), { target: { value: '5000' } })
    fireEvent.change(screen.getByLabelText('Q2 paid (Jun 15)'), { target: { value: '5000' } })
    const r = lastResult()
    expect(lastInput().estQ1).toBe(5000)
    expect(r.totalPayments).toBe(10000)
    const stored = JSON.parse(sessionStorage.getItem('ts360_f1040'))
    expect(stored.estQ1).toBe('5000')
    expect(stored.estQ2).toBe('5000')
    expect(rowValue('Withholding & Estimated Tax Payments')).toBe('−$10,000')
  })
})

describe('M-7 (Step 2) — YTD mode: the C-Corp layer and the income rows are annualized', () => {
  it('SPEC: ytdMonth 6 (×2) ⇒ Corporate Tax row is the full-year figure; Capital Gains (LT) row shows the annualized entry', () => {
    writePersonalContext({ filingStatus: 'single', w2Income: 0, ytdMode: true, ytdMonth: 6, capitalGains: 10000, ltGain: 10000 })
    const cc = { type: 'C Corporation', name: 'Acme Inc', own: '100', officerW2: 50000,
      pnl: { grossRevenue: 200000, totalExpenses: 100000, officerSalary: 50000, employerPayrollTax: 0, netProfit: 100000 } }
    writeStep1State({ entities: [cc], entitiesRaw: [cc], k1Total: 0 })
    renderTR()
    const inp = lastInput()
    const r = lastResult()
    const annual = calcCCorpCorporateLayer({ netProfit: 300000, officerSalary: 100000, taxYear: 2026 })
    expect(inp.ytdFactor).toBe(2)
    expect(inp.divInc).toBe(Math.round(annual.dividends / 2))   // YTD slice; the engine annualizes
    expect(rowValue('Corporate Tax (C-Corp, 21%)')).toBe(`$${annual.corpTax.toLocaleString()}`)
    expect(rowValue('Capital Gains (LT)')).toBe('$20,000')
    expect(r.capitalGainNetIncluded).toBe(20000)
  })
})

describe('M-8 / F-L (Step 2) — a C-Corp whose P&L still carries S-Corp employer FICA (legacy record) vs. the corrected layer', () => {
  it('SPEC: an entity converted S→C by the fixed type-change handler carries no employerPayrollTax, so the 21% is right', () => {
    const sal = 100000
    const cc = { type: 'C Corporation', name: 'Acme', own: '100', officerW2: sal,
      pnl: { grossRevenue: 300000, totalExpenses: 50000 + sal, officerSalary: sal, employerPayrollTax: 0, netProfit: 300000 - 50000 - sal } }
    writePersonalContext({ filingStatus: 'single', w2Income: 0 })
    writeStep1State({ entities: [cc], entitiesRaw: [cc], k1Total: 0 })
    renderTR()
    const correct = calcCCorpCorporateLayer({ netProfit: 250000, officerSalary: sal, taxYear: 2026 })
    expect(rowValue('Corporate Tax (C-Corp, 21%)')).toBe(`$${correct.corpTax.toLocaleString()}`)
  })
})

describe('M-6 (modal) — "Net profit share" adds back officer salary AND the employer payroll tax', () => {
  it('SPEC: S-Corp: 300k receipts, 50k opex, 100k salary ⇒ header shows the true pre-salary, pre-FICA profit of 250,000', () => {
    const sal = 100000, fica = calcEmployerFICA(sal, 2026)
    const ent = { type: 'S Corporation', name: 'Acme', own: '100', officerW2: sal,
      pnl: { grossRevenue: 300000, totalExpenses: 50000 + sal + fica, officerSalary: sal, employerPayrollTax: fica, netProfit: 300000 - 50000 - sal - fica } }
    render(<EntityCompareModal isOpen onClose={() => {}} entity={ent} entities={[ent]} entityIdx={0}
      personalContext={{ filingStatus: 'single', taxYear: 2026, w2Income: 0 }} />)
    const header = screen.getByText(/Net profit share:/).textContent
    expect(header).toContain('$250,000')
  })
})
