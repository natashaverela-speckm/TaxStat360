// @vitest-environment jsdom
// PHASE 2 (Prior-Year Review): upload → confirm → memo → seed this year, rendered.
// The PDF gate and the extract call are mocked at the module boundary; everything
// downstream (normalisation, the memo, the session seed, the engine) is real.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../lib/pdfTextGate.js', () => ({
  prepareTax1040TextForUpload: vi.fn(async (file) => {
    if (file.name.includes('image')) return { ok: false, code: 'IMAGE_ONLY_PDF', message: 'That PDF has no text layer.' }
    const title = file.name.includes('1120s') ? 'Form 1120-S U.S. Income Tax Return for an S Corporation'
      : file.name.includes('1065') ? 'Form 1065 U.S. Return of Partnership Income'
      : file.name.includes('mystery') ? 'a statement with no form name'
      : 'Form 1040 U.S. Individual Income Tax Return'
    return { ok: true, text: title + ' ' + 'x'.repeat(100), alnum: 100, redactedCount: 2 }
  }),
}))
const FIELDS_1040 = {
  taxYear: 2025, filingStatus: 'mfj', dependents: 2, w2Wages: 180000, w2Withheld: 20000, officerW2: 80000,
  k1ScorpOrdinary: 113880, schedERent: 42000, schedEExpenses: 30000, schedEDepreciation: 28000, rentalBuildingBasis: 400000,
  depreciationTotal: 28000, qbiDeduction: 18500, agi: 262000, totalTax: 43199, estimatedPaymentsMade: 12000, underpaymentPenalty: 612, priorPassiveLossCarryforward: 9000,
}
const FIELDS_1120S = {
  taxYear: 2025, shareholderCount: 1, grossReceipts: 420000, totalIncome: 420000, officerCompensation: 80000, salariesWages: 96000,
  rentsPaid: 24000, taxesAndLicenses: 13460, depreciation: 6200, otherDeductions: 86460, totalDeductions: 306120, ordinaryBusinessIncome: 113880,
  distributions: 150000, loansToShareholders: 20000, totalAssets: 148000, homeOfficeOrAccountablePlan: false,
}
vi.mock('../../lib/carryforwardExtractClient.js', () => ({
  extractTax1040ReviewText: vi.fn(async (_text, profile = 'tax-1040-review') => ({
    ok: true,
    result: {
      ok: true, profile,
      fields: profile === 'tax-1120s-review' ? FIELDS_1120S : profile === 'tax-1065-review' ? { taxYear: 2025, partnerCount: 2, guaranteedPayments: 60000, ordinaryBusinessIncome: 130000 } : FIELDS_1040,
      confidence: profile === 'tax-1040-review' ? { k1ScorpOrdinary: 0.4, officerW2: 1 } : { distributions: 0.3 },
      evidence: { retained: false, deletedAfterProcessing: true },
    },
  })),
}))

import ReviewScreen from './ReviewScreen.jsx'
import ResultScreen from './ResultScreen.jsx'
import { readStep1State, readPersonalContext, readTaxYear } from '../../utils/sessionState.js'
import { CURRENT_TAX_YEAR } from '../../lib/constants.js'

function mount() {
  return render(
    <MemoryRouter initialEntries={['/review']}>
      <Routes>
        <Route path="/review" element={<ReviewScreen />} />
        <Route path="/result" element={<ResultScreen />} />
        <Route path="/start" element={<div>START</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const pdf = (name = 'fixture-tax-1040-smoke.pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' })

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); localStorage.setItem('ts360_email', 't@example.com') })
afterEach(cleanup)

describe('ReviewScreen', () => {
  it('refuses an image-only PDF at the gate with the gate message', async () => {
    mount()
    fireEvent.change(document.getElementById("review-file"), { target: { files: [pdf("image-scan.pdf")] } })
    expect(await screen.findByText('no text layer', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(/Check the figures/)).toBeNull()
    expect(screen.queryByText("Here's what we read")).toBeNull()
  })

  it('upload → confirm (low-confidence flagged, editable) → memo in the six-section order → seeds this year', async () => {
    mount()
    fireEvent.change(document.getElementById('review-file'), { target: { files: [pdf()] } })
    expect(await screen.findByText('Personal return (1040)', { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Check the figures/))

    // confirm step
    expect(await screen.findByText("Here's what we read")).toBeInTheDocument()
    expect(document.body.textContent).toMatch(/1 field is marked/)
    // 1040 only: the memo will ask for the 1120-S
    const k1 = screen.getByLabelText('S-Corp income (K-1)')
    expect(k1.value).toBe('113,880')
    expect(document.body.textContent).toMatch(/double-check/)
    // no §/form numbers in the labels (sources may carry them)
    for (const el of screen.getAllByRole('textbox')) expect(el.getAttribute('aria-label') || '').not.toMatch(/§|Form \d/)
    // edit a figure before confirming
    fireEvent.change(screen.getByLabelText('Underpayment penalty'), { target: { value: '900' } })
    fireEvent.click(screen.getByText(/These are right/))

    // memo
    expect(await screen.findByText(/What 2025 left on the table/)).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    const order = ['Books and records', 'Ordinary and necessary business expenses', 'Bonus depreciation on rental property', 'Passive activity rules, REPS and the short-term rental exception', 'Expensing equipment', 'Reasonable compensation', 'Everything else the engine found']
    const idx = order.map(t => headings.indexOf(t))
    expect(idx.every(i => i >= 0)).toBe(true)
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
    expect(screen.getByText('As filed')).toBeInTheDocument()
    expect(screen.getByText('With REPS')).toBeInTheDocument()
    expect(screen.getByText('STR exception')).toBeInTheDocument()
    expect(document.body.textContent).toContain('$900')          // the edited penalty flowed through
    expect(document.body.textContent).toMatch(/Add the 1120-S on the upload step/)
    expect(document.body.textContent).not.toMatch(/was wrong|you must amend/i)
    // the rule stays behind the expander until asked
    expect(screen.queryByText(/What has to be true:/)).toBeNull()
    fireEvent.click(screen.getAllByText('Show the rule and conditions')[0])
    expect(screen.getByText(/What has to be true:/)).toBeInTheDocument()

    // seed this year
    fireEvent.click(screen.getByText(new RegExp(`See how ${CURRENT_TAX_YEAR} is tracking`)))
    await waitFor(() => expect(screen.getByText(/on track to owe about/i)).toBeInTheDocument())
    expect(readTaxYear()).toBe(CURRENT_TAX_YEAR)
    const s1 = readStep1State()
    expect(s1.entities.map(e => e.type)).toEqual(['S Corporation', 'Real Estate (Schedule E)'])
    const pc = readPersonalContext()
    expect(pc.filingStatus).toBe('mfj')
    expect(pc.w2Income).toBe(100000)
    expect(pc.estPaid).toBe(0)        // last year's payments do not carry into this year
    const hero = screen.getByText(/on track to owe about/i).closest('section')
    expect(within(hero).getAllByText(/^\$[\d,]+$/).length).toBeGreaterThan(0)
  })

  it('1040 + 1120-S: both are detected, the 1120-S gets its own confirm section, and the memo reads it', async () => {
    mount()
    fireEvent.change(document.getElementById('review-file'), { target: { files: [pdf('fixture-tax-1120s-smoke.pdf'), pdf()] } })
    expect(await screen.findByText('S-Corp return (1120-S)', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Personal return (1040)', { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Check the figures \(1040 \+ 1120-S\)/))

    expect(await screen.findByText("Here's what we read")).toBeInTheDocument()
    const scorp = screen.getByLabelText('S-Corp return (1120-S)')
    expect(within(scorp).getByLabelText('Officer salary (W-2 from the company)').value).toBe('80,000')
    expect(within(scorp).getByLabelText('Distributions to shareholders').value).toBe('150,000')
    expect(document.body.textContent).toMatch(/2 fields are marked/)   // k1 on the 1040, distributions on the 1120-S
    fireEvent.change(within(scorp).getByLabelText('Loans to shareholders (year end)'), { target: { value: '0' } })
    fireEvent.click(screen.getByText(/These are right/))

    expect(await screen.findByText(/What 2025 left on the table/)).toBeInTheDocument()
    expect(document.body.textContent).toMatch(/from the 1040 and the 1120-S/)
    expect(document.body.textContent).not.toMatch(/Add the 1120-S on the upload step/)
    expect(document.body.textContent).toMatch(/Per the 1120-S, officer salary/)
    expect(document.body.textContent).toMatch(/No retirement plan deducted on the 1120-S/)
    expect(document.body.textContent).toMatch(/distributions exceeded/i)
    expect(document.body.textContent).not.toMatch(/Loan to shareholder needs a note/)   // edited to 0 on confirm
  })

  it('a 1120-S alone cannot continue; a file with no form name is reported, not sent', async () => {
    mount()
    fireEvent.change(document.getElementById('review-file'), { target: { files: [pdf('fixture-tax-1120s-smoke.pdf'), pdf('mystery.pdf')] } })
    expect(await screen.findByText(/could not tell which federal return/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Add the 1040 to continue'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Add the personal return/)
    fireEvent.click(screen.getByLabelText('Remove mystery.pdf'))
    expect(screen.queryByText(/could not tell/)).toBeNull()
  })
})
