// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CarryforwardDashboardPrompt from './CarryforwardDashboardPrompt.jsx'

const navigate = vi.fn()
let wizardAccess = true
const readEmail = vi.fn(() => 'user@example.com')
const readStep1State = vi.fn(() => ({ entities: [] }))
const dismissPrompt = vi.fn()
let shouldShowPrompt = true

vi.mock('../lib/carryforwardWizardAccess.js', () => ({
  canAccessCarryforwardWizard: () => wizardAccess,
}))

vi.mock('../utils/sessionState.js', () => ({
  readEmail: (...args) => readEmail(...args),
  readStep1State: (...args) => readStep1State(...args),
}))

vi.mock('../utils/carryforwardWizard.js', async () => {
  const actual = await vi.importActual('../utils/carryforwardWizard.js')
  return {
    ...actual,
    shouldShowCarryforwardDashboardPrompt: () => shouldShowPrompt,
    dismissCarryforwardDashboardPrompt: (...args) => dismissPrompt(...args),
  }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

beforeEach(() => {
  navigate.mockClear()
  dismissPrompt.mockClear()
  wizardAccess = true
  shouldShowPrompt = true
  readEmail.mockReturnValue('user@example.com')
  readStep1State.mockReturnValue({
    entities: [{ type: 'Rental Real Estate', pnl: {} }],
  })
})

afterEach(() => {
  cleanup()
})

describe('CarryforwardDashboardPrompt', () => {
  it('CHAR: renders when prompt conditions are met', () => {
    render(
      <MemoryRouter>
        <CarryforwardDashboardPrompt />
      </MemoryRouter>,
    )
    expect(screen.getByText(/prior-year carryforwards from rental/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Start the carryforward guide/ })).toBeTruthy()
  })

  it('CHAR: does not render when shouldShowCarryforwardDashboardPrompt is false', () => {
    shouldShowPrompt = false
    render(
      <MemoryRouter>
        <CarryforwardDashboardPrompt />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/prior-year carryforwards from rental/i)).toBeNull()
  })

  it('CHAR: Start navigates to carryforward wizard', () => {
    render(
      <MemoryRouter>
        <CarryforwardDashboardPrompt />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Start the carryforward guide/ }))
    expect(navigate).toHaveBeenCalledWith('/carryforward-wizard')
  })

  it('CHAR: Not now dismisses and hides the prompt', () => {
    render(
      <MemoryRouter>
        <CarryforwardDashboardPrompt />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(dismissPrompt).toHaveBeenCalledWith('user@example.com')
    expect(screen.queryByText(/prior-year carryforwards from rental/i)).toBeNull()
  })
})
