// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CarryforwardGuideBanner from './CarryforwardGuideBanner.jsx'

const navigate = vi.fn()
let wizardAccess = true

vi.mock('../lib/carryforwardWizardAccess.js', () => ({
  canAccessCarryforwardWizard: () => wizardAccess,
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
})

afterEach(() => {
  cleanup()
})

describe('CarryforwardGuideBanner', () => {
  it('CHAR: pro user navigates to carryforward wizard', () => {
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
})
