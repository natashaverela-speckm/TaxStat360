// @vitest-environment jsdom
// PHASE 1 (simple flow): Start → Numbers → Result, rendered, as a user would click.
// Counts the interactions needed to reach a non-zero estimate (spec target: < 12).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StartScreen from './StartScreen.jsx'
import NumbersScreen from './NumbersScreen.jsx'
import ResultScreen from './ResultScreen.jsx'
import { writeEmail, writePersonalContext, readPersonalContext, readStep1State, readUserRecords } from '../../utils/sessionState.js'
import { hasCompletedOnboardingTour } from '../../utils/onboardingTour.js'
import { PRIOR_YEAR_REVIEW_ENABLED } from '../../lib/priorYearReview.js'
import { vi } from 'vitest'

vi.mock('../../lib/pdfTextGate.js', () => ({
  prepareTax1040TextForUpload: vi.fn(async (file) => ({ ok: true, text: 'Profit and Loss ' + file.name + ' x'.repeat(60), alnum: 100, redactedCount: 0 })),
}))
vi.mock('../../lib/carryforwardExtractClient.js', () => ({
  extractTax1040ReviewText: vi.fn(async (_text, profile, fixture) => ({
    ok: true,
    result: { ok: true, profile, fields: fixture
      ? { periodLabel: 'January 1 - October 31, 2026', periodYear: 2026, totalIncome: 300000, costOfGoodsSold: null, grossProfit: 300000, totalExpenses: 186120, officerCompensation: 80000, wagesOther: null, payrollTaxes: 6120, depreciation: null, rentExpense: 24000, interestExpense: null, netIncome: 113880 }
      : { periodLabel: '', periodYear: 2026, totalIncome: null, totalExpenses: null, netIncome: 0 }, confidence: {}, evidence: { retained: false } },
  })),
}))
vi.mock('../../utils/serverApi.js', () => ({
  fetchRecordsFromServer: vi.fn(async () => []),
  upsertRecordOnServer: vi.fn(async (r) => r),
  deleteRecordOnServer: vi.fn(async () => ({})),
}))

function mountAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/start" element={<StartScreen />} />
        <Route path="/numbers" element={<NumbersScreen />} />
        <Route path="/result" element={<ResultScreen />} />
        <Route path="/calculate-tax" element={<div>ADVANCED TRACKER</div>} />
        <Route path="/personal-estimate" element={<div>ADVANCED RETURN</div>} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  )
}

const BANNED = /§|Form \d|\bK-1\b|SE tax|\bQBI\b|\bUBIA\b|\bSSTB\b|\bNIIT\b|\bAGI\b/

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  writeEmail('tester@example.com')
})
afterEach(cleanup)

describe('Screen 1 — Start', () => {
  it('shows the five tiles, retires the welcome tour, and carries no jargon', () => {
    mountAt('/start')
    expect(screen.getByText('Which one describes your situation?')).toBeInTheDocument()
    const tiles = screen.getAllByRole('listitem')
    // five persona tiles, plus the "Review last year's return" tile when that flag is on
    expect(tiles).toHaveLength(PRIOR_YEAR_REVIEW_ENABLED ? 6 : 5)
    expect(hasCompletedOnboardingTour('tester@example.com')).toBe(true)
    expect(document.body.textContent).not.toMatch(BANNED)
  })

  it('a tile routes to Screen 2 with that tile selected', () => {
    mountAt('/start')
    fireEvent.click(screen.getByText('I run an S-Corp'))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('I run an S-Corp')
  })
})

describe('Screens 2 and 3 — the acceptance walk', () => {
  it('S-Corp 300000 / 100000 / 80000 Single reaches $29,799 in 5 interactions and the cards follow', () => {
    mountAt('/start')
    let clicks = 0
    fireEvent.click(screen.getByText('I run an S-Corp')); clicks++

    // Screen 2: no jargon, four money fields + filing status visible
    expect(document.body.textContent).not.toMatch(BANNED)
    const revenue = screen.getByLabelText('What the business took in this year')
    const expenses = screen.getByLabelText("What the business spent (not counting your own pay)")
    const salary = screen.getByLabelText('What you paid yourself on payroll (W-2)')
    fireEvent.change(revenue, { target: { value: '300000' } }); clicks++
    fireEvent.change(expenses, { target: { value: '100000' } }); clicks++
    fireEvent.change(salary, { target: { value: '80000' } }); clicks++

    // live card updates before Continue
    const aside = screen.getByText(/On track to owe/).closest('aside')
    expect(within(aside).getByText('$29,799')).toBeInTheDocument()

    fireEvent.click(screen.getByText('See my result →')); clicks++

    // Screen 3
    const hero = screen.getByText(/on track to owe about/i).closest('section')
    expect(within(hero).getAllByText('$29,799').length).toBeGreaterThanOrEqual(1)   // headline (and, late in the year, the single remaining installment)
    expect(screen.getByText('Next estimated payment')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ways to lower it' })).toBeInTheDocument()
    // the S-Corp's existing SE-tax position is not a "way to lower it"
    for (const el of screen.getAllByText(/^Save ~\$/)) expect(el.closest('div').textContent).not.toMatch(/Salary vs\. Distribution/)
    expect(screen.getByText(/^Already saving ~\$/).closest('div').textContent).toMatch(/Salary vs\. Distribution/)
    // biggest dollar card first
    const cards = screen.getAllByText(/^Save ~\$/)
    expect(cards.length).toBeGreaterThan(2)
    const amounts = cards.map(el => parseInt(el.textContent.replace(/[^0-9]/g, ''), 10))
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts)
    // the law stays behind the expander until asked
    expect(screen.queryByText(/How to apply:/)).toBeNull()
    fireEvent.click(screen.getAllByText('Show how it works')[0])
    expect(screen.getByText(/How to apply:/)).toBeInTheDocument()

    expect(clicks).toBeLessThan(12)
  })

  it('blocks only on revenue; filing status alone is not enough', () => {
    mountAt('/numbers?tile=soleprop')
    fireEvent.click(screen.getByText('See my result →'))
    expect(screen.getByRole('alert').textContent).toMatch(/what came in/i)
    expect(screen.queryByText(/on track to owe about/i)).toBeNull()
  })

  it('side-business tile requires wages and reveals the withholding field', () => {
    mountAt('/numbers?tile=sidebiz')
    expect(screen.queryByLabelText('Federal tax already withheld')).toBeNull()
    fireEvent.change(screen.getByLabelText('Your wages from your job (W-2)'), { target: { value: '90000' } })
    expect(screen.getByLabelText('Federal tax already withheld')).toBeInTheDocument()
  })

  it('rental tile shows rent, expenses and depreciation and no accounting-software row', () => {
    mountAt('/numbers?tile=rental')
    expect(screen.getByLabelText('Rent you collected')).toBeInTheDocument()
    expect(screen.getByLabelText('Depreciation on the property (optional)')).toBeInTheDocument()
    expect(screen.queryByText(/Use accounting software/)).toBeNull()
  })

  it('the P&L upload fills the fields and says what it read; the tracker is not linked', async () => {
    mountAt('/numbers?tile=scorp')
    expect(screen.queryByText('QuickBooks')).toBeNull()
    expect(screen.queryByText('Advanced')).toBeNull()
    const input = screen.getByLabelText('Upload your P&L (PDF)')
    const file = new File(['%PDF-1.4'], 'fixture-pnl-smoke.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByRole('status')).toHaveTextContent(/Read from your P&L.*income \$300,000, spent \$100,000, your pay \$80,000/)
    expect(screen.getByText(/Please check these numbers against your actual P&L/)).toBeInTheDocument()
    expect(screen.getByText('support@taxstat360.com').getAttribute('href')).toMatch(/^mailto:support@taxstat360\.com/)
    expect(screen.getByLabelText('What the business took in this year').value).toBe('300,000')
    expect(screen.getByLabelText('What you paid yourself on payroll (W-2)').value).toBe('80,000')
    // 186,120 total − 80,000 officer − 6,120 employer payroll tax on it = 100,000
    expect(screen.getByLabelText("What the business spent (not counting your own pay)").value).toBe('100,000')
    // "Something look off?": correcting a report line recomputes the fields
    expect(screen.getByText('Something look off? Change any number here.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('P&L Other expenses'), { target: { value: '20000' } })
    expect(screen.getByLabelText("What the business spent (not counting your own pay)").value).toBe('120,000')
    fireEvent.change(screen.getByLabelText('P&L Total income'), { target: { value: '350000' } })
    expect(screen.getByLabelText('What the business took in this year').value).toBe('350,000')
  })

  it('a PDF that is not a P&L is refused with a plain message', async () => {
    mountAt('/numbers?tile=soleprop')
    fireEvent.change(screen.getByLabelText('Upload your P&L (PDF)'), { target: { files: [new File(['x'], 'balance-sheet.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not read as a profit and loss report/)
  })

  it('Result with nothing entered offers Start instead of a blank number', () => {
    mountAt('/result')
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Start →'))
    expect(screen.getByText('Which one describes your situation?')).toBeInTheDocument()
  })

  it('Start offers the saved-records list without calling it a dashboard', () => {
    mountAt('/start')
    expect(screen.getByText('Open a saved record →')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Dashboard/)
  })

  it('Start over drops the working figures so the next scenario starts clean', () => {
    mountAt('/start')
    fireEvent.click(screen.getByText('I run an S-Corp'))
    fireEvent.change(screen.getByLabelText('What the business took in this year'), { target: { value: '300000' } })
    fireEvent.click(screen.getByText('See my result →'))
    writePersonalContext({ ...readPersonalContext(), priorYearQBILoss: 945855, w2Withheld: 5000 })
    fireEvent.click(screen.getByText('Start over'))
    expect(screen.getByText('Which one describes your situation?')).toBeInTheDocument()
    expect(readStep1State().entities).toHaveLength(0)
    expect(readPersonalContext().priorYearQBILoss).toBeFalsy()
    expect(readPersonalContext().w2Withheld).toBeFalsy()
  })

  it('the result screen edits payments, withholding, retirement and HSA in place and saves', async () => {
    mountAt('/start')
    fireEvent.click(screen.getByText('I run an S-Corp'))
    fireEvent.change(screen.getByLabelText('What the business took in this year'), { target: { value: '300000' } })
    fireEvent.change(screen.getByLabelText("What the business spent (not counting your own pay)"), { target: { value: '100000' } })
    fireEvent.change(screen.getByLabelText('What you paid yourself on payroll (W-2)'), { target: { value: '80000' } })
    fireEvent.click(screen.getByText('See my result →'))
    const hero = screen.getByText(/on track to owe about/i).closest('section')
    const before = within(hero).getAllByText(/^\$[\d,]+$/)[0].textContent
    // no links out to the Advanced pages
    expect(screen.queryByText(/Add another business or property/)).toBeNull()
    expect(screen.queryByText(/Use the full form/)).toBeNull()
    fireEvent.change(screen.getByLabelText("Estimated payments I've made this year"), { target: { value: '10000' } })
    expect(readPersonalContext().estPaid).toBe(10000)
    fireEvent.change(screen.getByLabelText('Retirement contributions deducted'), { target: { value: '20000' } })
    expect(readPersonalContext().selfEmpRetirement).toBe(20000)
    const after = within(screen.getByText(/on track to owe about/i).closest('section')).getAllByText(/^\$[\d,]+$/)[0].textContent
    expect(after).not.toBe(before)
    // save without leaving the screen
    fireEvent.change(screen.getByLabelText('Record name'), { target: { value: 'My S-Corp 2026' } })
    fireEvent.click(screen.getByText('Save this record'))
    expect(await screen.findByText('Saved ✓')).toBeInTheDocument()
    expect(readUserRecords().some(r => r.name === 'My S-Corp 2026' && r.totalTax > 0)).toBe(true)
  })

  it('a loss year on the S-Corp tile is deducted and the result says the basis was assumed', async () => {
    mountAt('/numbers?tile=scorp')
    fireEvent.change(screen.getByLabelText(/What the business took in/), { target: { value: '226484' } })
    fireEvent.change(screen.getByLabelText(/What the business spent/), { target: { value: '267844' } })
    fireEvent.change(screen.getByLabelText(/paid yourself on payroll/), { target: { value: '48000' } })
    fireEvent.click(screen.getByText(/See my result/))
    await screen.findByText(/on track to owe about/i)
    expect(screen.getByText(/Your business lost \$9[\d,]+ this year/)).toBeInTheDocument()
    expect(screen.getByText(/we assume you put in the money that covered it/)).toBeInTheDocument()
    // the headline is the tax on (salary − loss), not on the salary alone
    const headline = within(screen.getByText(/on track to owe about/i).closest('section')).getAllByText(/^\$[\d,]+$|^—$/)[0].textContent
    expect(headline).toBe('$0')
  })

  it('a server rejection is never shown as "Saved ✓": the reason appears, the browser copy is kept', async () => {
    const { upsertRecordOnServer } = await import('../../utils/serverApi.js')
    const err = Object.assign(new Error('Session/account mismatch: this browser is signed in as a different account than this page expects.'), { status: 409 })
    upsertRecordOnServer.mockRejectedValueOnce(err)
    mountAt('/numbers?tile=scorp')
    fireEvent.change(screen.getByLabelText(/What the business took in/), { target: { value: '200000' } })
    fireEvent.change(screen.getByLabelText(/What the business spent/), { target: { value: '80000' } })
    fireEvent.change(screen.getByLabelText(/paid yourself on payroll/), { target: { value: '60000' } })
    fireEvent.click(screen.getByText(/See my result/))
    await screen.findByText(/on track to owe about/i)
    fireEvent.click(screen.getByText('Save this record'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Not saved to your account/)
    expect(alert.textContent).toMatch(/mismatch/)
    expect(alert.textContent).toMatch(/409/)
    expect(screen.queryByText('Saved ✓')).toBeNull()
    expect(readUserRecords().length).toBe(1)   // local copy still written
  })

  it('new month: "Update these numbers" reopens the tile prefilled, keeps withholding, and Save updates the same record', async () => {
    mountAt('/start')
    fireEvent.click(screen.getByText('I run an S-Corp'))
    fireEvent.change(screen.getByLabelText('What the business took in this year'), { target: { value: '300000' } })
    fireEvent.change(screen.getByLabelText("What the business spent (not counting your own pay)"), { target: { value: '100000' } })
    fireEvent.change(screen.getByLabelText('What you paid yourself on payroll (W-2)'), { target: { value: '80000' } })
    fireEvent.click(screen.getByText('See my result →'))
    fireEvent.change(screen.getByLabelText('Federal tax withheld from paychecks'), { target: { value: '12000' } })
    fireEvent.change(screen.getByLabelText('Record name'), { target: { value: 'Moneynista 2026' } })
    fireEvent.click(screen.getByText('Save this record'))
    await screen.findByText('Saved ✓')
    const first = readUserRecords().find(r => r.name === 'Moneynista 2026')
    expect(first).toBeTruthy()

    fireEvent.click(screen.getByText(/New month, new P&L\? Update these numbers/))
    expect(screen.getByText(/Updating Moneynista 2026/)).toBeInTheDocument()
    expect(screen.getByLabelText('What the business took in this year').value).toBe('300,000')
    expect(screen.getByLabelText("What the business spent (not counting your own pay)").value).toBe('100,000')
    expect(screen.getByLabelText('What you paid yourself on payroll (W-2)').value).toBe('80,000')
    fireEvent.change(screen.getByLabelText('What the business took in this year'), { target: { value: '350000' } })
    fireEvent.click(screen.getByText('See my result →'))
    expect(readPersonalContext().w2Withheld).toBe(12000)   // the Result-screen withholding survived the round trip
    fireEvent.click(screen.getByText('Save this record'))
    await screen.findByText('Saved ✓')
    const all = readUserRecords().filter(r => r.name === 'Moneynista 2026')
    expect(all).toHaveLength(1)
    expect(String(all[0].id)).toBe(String(first.id))
    expect(all[0].totalTax).not.toBe(first.totalTax)
  })
})
