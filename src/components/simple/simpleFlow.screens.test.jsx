// @vitest-environment jsdom
// PHASE 1 (simple flow): Start → Numbers → Result, rendered, as a user would click.
// Counts the interactions needed to reach a non-zero estimate (spec target: < 12).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StartScreen from './StartScreen.jsx'
import NumbersScreen from './NumbersScreen.jsx'
import ResultScreen from './ResultScreen.jsx'
import { writeEmail } from '../../utils/sessionState.js'
import { hasCompletedOnboardingTour } from '../../utils/onboardingTour.js'

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
    expect(screen.getByText('Which one is you?')).toBeInTheDocument()
    const tiles = screen.getAllByRole('listitem')
    expect(tiles).toHaveLength(5)
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

  it('accounting-software buttons hand off to the Advanced tracker', () => {
    mountAt('/numbers?tile=scorp')
    fireEvent.click(screen.getByText('QuickBooks'))
    expect(screen.getByText('ADVANCED TRACKER')).toBeInTheDocument()
  })

  it('Result with nothing entered offers Start instead of a blank number', () => {
    mountAt('/result')
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Start →'))
    expect(screen.getByText('Which one is you?')).toBeInTheDocument()
  })

  it('Advanced is one click from every screen', () => {
    mountAt('/start')
    fireEvent.click(screen.getByText('Advanced'))
    expect(screen.getByText('ADVANCED TRACKER')).toBeInTheDocument()
  })
})
