// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CarryforwardGuideBanner from './CarryforwardGuideBanner.jsx'

const navigate = vi.fn()
let wizardAccess = true
let needsWizard = true

vi.mock('../lib/carryforwardWizardAccess.js', () => ({
  canAccessCarryforwardWizard: () => wizardAccess,
}))

vi.mock('../utils/carryforwardWizard.js', () => ({
  needsCarryforwardWizard: () => needsWizard,
}))

vi.mock('../utils/sessionState.js', () => ({
  readEmail: () => 'user@example.com',
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

beforeEach(() => {
  navigate.mockClear()
  wizardAccess = true
  needsWizard = true
})

afterEach(() => {
  cleanup()
})

describe('CarryforwardGuideBanner', () => {
  it('CHAR: pro user navigates to carryforward wizard (inline)', () => {
    render(
      <MemoryRouter>
        <CarryforwardGuideBanner />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Start the carryforward guide/ }))
    expect(navigate).toHaveBeenCalledWith('/carryforward-wizard')
  })

  it('CHAR: starter user navigates to upgrade', () => {
    wizardAccess = false
    render(
      <MemoryRouter>
        <CarryforwardGuideBanner />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Available on the Professional plan/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Start the carryforward guide/ }))
    expect(navigate).toHaveBeenCalledWith('/upgrade')
  })

  it('CHAR: prominent variant shows top-of-flow entry for incomplete users', () => {
    render(
      <MemoryRouter>
        <CarryforwardGuideBanner variant="prominent" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Carryforward guide')).toBeTruthy()
    expect(document.querySelector('[data-section="carryforwards-entry"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Start the carryforward guide/ }))
    expect(navigate).toHaveBeenCalledWith('/carryforward-wizard')
  })

  it('CHAR: prominent variant stays visible after wizard is complete (Edit CTA)', () => {
    needsWizard = false
    render(
      <MemoryRouter>
        <CarryforwardGuideBanner variant="prominent" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Carryforward guide')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Edit carryforward guide/ }))
    expect(navigate).toHaveBeenCalledWith('/carryforward-wizard')
  })
})
