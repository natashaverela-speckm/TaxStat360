// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CarryforwardWizard from './CarryforwardWizard.jsx'
import {
  CARRYFORWARD_WIZARD_STEPS,
  GLOBAL_DISCLAIMER,
  buildInitialWizardValues,
} from '../lib/carryforwardWizardConfig.js'

const navigate = vi.fn()
let wizardAccess = true
const readPersonalContext = vi.fn(() => ({}))
const writePersonalContext = vi.fn()
const writeDirtyFlag = vi.fn()
const readEmail = vi.fn(() => 'user@example.com')
const markComplete = vi.fn()

vi.mock('../lib/carryforwardWizardAccess.js', () => ({
  canAccessCarryforwardWizard: () => wizardAccess,
}))

vi.mock('../utils/sessionState.js', () => ({
  readPersonalContext: (...args) => readPersonalContext(...args),
  writePersonalContext: (...args) => writePersonalContext(...args),
  writeDirtyFlag: (...args) => writeDirtyFlag(...args),
  readEmail: (...args) => readEmail(...args),
}))

vi.mock('../utils/carryforwardWizard.js', async () => {
  const actual = await vi.importActual('../utils/carryforwardWizard.js')
  return {
    ...actual,
    markCarryforwardWizardComplete: (...args) => markComplete(...args),
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
  readPersonalContext.mockReset()
  writePersonalContext.mockReset()
  writeDirtyFlag.mockReset()
  markComplete.mockReset()
  readEmail.mockReturnValue('user@example.com')
  readPersonalContext.mockReturnValue({})
  wizardAccess = true
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0))
})

afterEach(() => {
  cleanup()
})

function renderWizard() {
  return render(
    <MemoryRouter>
      <CarryforwardWizard />
    </MemoryRouter>,
  )
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 10)))

describe('buildInitialWizardValues', () => {
  it('CHAR: initializes every data-entry field to empty string', () => {
    const values = buildInitialWizardValues()
    const keys = Object.keys(values)
    expect(keys.length).toBe(8)
    for (const key of keys) {
      expect(values[key]).toBe('')
    }
  })
})

describe('CarryforwardWizard', () => {
  it('CHAR: renders step 1 label, helper text, and disclaimer', () => {
    renderWizard()
    const step1 = CARRYFORWARD_WIZARD_STEPS[0]
    expect(screen.getByRole('heading', { name: step1.label })).toBeTruthy()
    expect(screen.getByText(step1.helperText)).toBeTruthy()
    expect(screen.getByText(GLOBAL_DISCLAIMER)).toBeTruthy()
    expect(screen.getByText('1 of 10')).toBeTruthy()
  })

  it('CHAR: Next advances to step 2; Back returns to step 1', () => {
    renderWizard()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: CARRYFORWARD_WIZARD_STEPS[1].label })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: CARRYFORWARD_WIZARD_STEPS[0].label })).toBeTruthy()
  })

  it('CHAR: typed value is preserved when navigating forward and back', async () => {
    renderWizard()
    const step1 = CARRYFORWARD_WIZARD_STEPS[0]
    const input = screen.getByLabelText(step1.label)
    fireEvent.change(input, { target: { value: '14000', selectionStart: 5 } })
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText(step1.label).value).toBe('14,000')
  })

  it('CHAR: informational step has no amount input', () => {
    renderWizard()
    const atRiskIndex = CARRYFORWARD_WIZARD_STEPS.findIndex((s) => s.id === 'at-risk-carryforward')
    for (let i = 0; i < atRiskIndex; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByRole('heading', { name: 'At-risk carryforwards' })).toBeTruthy()
    expect(screen.queryByLabelText('At-risk carryforwards')).toBeNull()
    expect(screen.getByText(/Guidance only/)).toBeTruthy()
  })

  it('CHAR: Skip to Personal Return navigates to tax return without persisting', () => {
    renderWizard()
    fireEvent.click(screen.getByRole('button', { name: 'Skip to Personal Return' }))
    expect(navigate).toHaveBeenCalledWith('/tax-return')
    expect(writePersonalContext).not.toHaveBeenCalled()
    expect(writeDirtyFlag).not.toHaveBeenCalled()
  })

  it('CHAR: prefills existing context value on step 1', () => {
    readPersonalContext.mockReturnValue({ priorPassiveLossCarryforward: 14000 })
    renderWizard()
    const step1 = CARRYFORWARD_WIZARD_STEPS[0]
    expect(screen.getByLabelText(step1.label).value).toBe('14,000')
  })

  it('CHAR: explainer details can be opened', () => {
    renderWizard()
    const summary = screen.getByText('What this is and why it matters')
    fireEvent.click(summary)
    expect(CARRYFORWARD_WIZARD_STEPS[0].explainer.length).toBeGreaterThan(0)
  })

  it('CHAR: disclaimer also shows on last step; Finish persists and navigates', async () => {
    readPersonalContext.mockReturnValue({ w2Income: 90000 })
    renderWizard()
    const step1 = CARRYFORWARD_WIZARD_STEPS[0]
    const input = screen.getByLabelText(step1.label)
    fireEvent.change(input, { target: { value: '5000', selectionStart: 4 } })
    await settle()
    for (let i = 0; i < CARRYFORWARD_WIZARD_STEPS.length - 1; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByText('10 of 10')).toBeTruthy()
    expect(screen.getByText(GLOBAL_DISCLAIMER)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Finish & continue to Personal Return/ }))
    expect(writePersonalContext).toHaveBeenCalledWith({
      w2Income: 90000,
      priorPassiveLossCarryforward: 5000,
    })
    expect(writeDirtyFlag).toHaveBeenCalledWith(true)
    expect(markComplete).toHaveBeenCalledWith('user@example.com')
    expect(navigate).toHaveBeenCalledWith('/tax-return?carryforwards=1')
  })

  it('CHAR: Skip to Personal Return does not mark wizard complete', () => {
    renderWizard()
    fireEvent.click(screen.getByRole('button', { name: 'Skip to Personal Return' }))
    expect(markComplete).not.toHaveBeenCalled()
  })

  it('CHAR: Next moves focus to the new step heading', async () => {
    renderWizard()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await settle()
    const step2 = CARRYFORWARD_WIZARD_STEPS[1]
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: step2.label }))
  })

  it('CHAR: empty step shows no sanity warning banner', () => {
    renderWizard()
    expect(screen.queryByText(/Confirm with your preparer/i)).toBeNull()
  })

  it('CHAR: amount above warnAbove shows inline preparer warning', async () => {
    renderWizard()
    const step1 = CARRYFORWARD_WIZARD_STEPS[0]
    const input = screen.getByLabelText(step1.label)
    fireEvent.change(input, { target: { value: '2000000', selectionStart: 7 } })
    await settle()
    expect(screen.getByText(/unusually large/i)).toBeTruthy()
    expect(screen.getByText(/Confirm with your preparer/i)).toBeTruthy()
  })

  it('CHAR: Finish still navigates when warnings are present', async () => {
    renderWizard()
    const step1 = CARRYFORWARD_WIZARD_STEPS[0]
    const input = screen.getByLabelText(step1.label)
    fireEvent.change(input, { target: { value: '2000000', selectionStart: 7 } })
    await settle()
    for (let i = 0; i < CARRYFORWARD_WIZARD_STEPS.length - 1; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByText(/Items to confirm with your preparer/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Finish & continue to Personal Return/ }))
    expect(navigate).toHaveBeenCalledWith('/tax-return?carryforwards=1')
  })

  it('CHAR: starter plan sees upgrade screen instead of wizard steps', () => {
    wizardAccess = false
    renderWizard()
    expect(screen.getByRole('heading', { name: /Carryforward Guide — Professional Feature/ })).toBeTruthy()
    expect(screen.queryByText('1 of 10')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Upgrade to Professional/ }))
    expect(navigate).toHaveBeenCalledWith('/upgrade')
  })
})
