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
const gateTax1040PdfUpload = vi.fn()
const extractTax1040Carryforward = vi.fn()

vi.mock('../lib/carryforwardWizardAccess.js', () => ({
  canAccessCarryforwardWizard: () => wizardAccess,
}))

vi.mock('../lib/pdfTextGate.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    gateTax1040PdfUpload: (...args) => gateTax1040PdfUpload(...args),
  }
})

vi.mock('../lib/carryforwardExtractClient.js', () => ({
  extractTax1040Carryforward: (...args) => extractTax1040Carryforward(...args),
}))

vi.mock('../utils/sessionState.js', () => ({
  readPersonalContext: (...args) => readPersonalContext(...args),
  writePersonalContext: (...args) => writePersonalContext(...args),
  writeDirtyFlag: (...args) => writeDirtyFlag(...args),
  readEmail: (...args) => readEmail(...args),
  CARRYFORWARD_FLOW_OFFER_SKIP_KEY: 'ts360_carryforward_flow_offer_skipped_v1',
  hasSkippedCarryforwardFlowOffer: () => false,
  markCarryforwardFlowOfferSkipped: () => {},
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
  gateTax1040PdfUpload.mockReset()
  extractTax1040Carryforward.mockReset()
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
    expect(keys.length).toBe(7)
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
    expect(screen.getByText('1 of 9')).toBeTruthy()
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

  it('CHAR: guidance-only step has no amount input or Amount label', () => {
    renderWizard()
    const atRiskIndex = CARRYFORWARD_WIZARD_STEPS.findIndex((s) => s.id === 'at-risk-carryforward')
    for (let i = 0; i < atRiskIndex; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByRole('heading', { name: 'At-risk carryforwards' })).toBeTruthy()
    expect(screen.queryByLabelText('At-risk carryforwards')).toBeNull()
    expect(screen.queryByText(/^Amount$/i)).toBeNull()
    expect(screen.getByText(/Guidance only — there is no amount field on this step/)).toBeTruthy()
    expect(screen.getByText(/Step 1 \(Entities\)/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  it('CHAR: depreciation continuity step is guidance-only with no Amount label', () => {
    renderWizard()
    const depIndex = CARRYFORWARD_WIZARD_STEPS.findIndex((s) => s.id === 'depreciation-continuity')
    for (let i = 0; i < depIndex; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByRole('heading', { name: 'Depreciation continuity' })).toBeTruthy()
    expect(screen.queryByText(/^Amount$/i)).toBeNull()
    expect(screen.getByText(/Depreciation field \(Step 1: Entities\)/)).toBeTruthy()
    expect(screen.getByText(/disposition and recapture fields/)).toBeTruthy()
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
    expect(screen.getByText('9 of 9')).toBeTruthy()
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
    expect(screen.queryByText('1 of 9')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Upload text PDF' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Upgrade to Professional/ }))
    expect(navigate).toHaveBeenCalledWith('/upgrade')
  })

  it('CHAR: upload card shows text-PDF copy when prefill enabled', () => {
    renderWizard()
    expect(screen.getByRole('button', { name: 'Upload text PDF' })).toBeTruthy()
    expect(screen.getByText(/scanned or image-only PDFs are not supported yet/i)).toBeTruthy()
    expect(document.querySelector('input[type="file"]')?.getAttribute('accept')).toBe(
      'application/pdf,.pdf',
    )
  })

  it('CHAR: image-only gate blocks extract call', async () => {
    gateTax1040PdfUpload.mockResolvedValue({
      ok: false,
      code: 'IMAGE_ONLY_PDF',
      message: 'This looks like a scanned or image-only PDF. Text-PDF upload only for now.',
    })
    renderWizard()
    const input = document.querySelector('input[type="file"]')
    expect(input).toBeTruthy()
    const file = new File([new Uint8Array([1])], 'fixture-tax-1040-image-only.pdf', {
      type: 'application/pdf',
    })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
      await Promise.resolve()
    })
    await settle()
    expect(gateTax1040PdfUpload).toHaveBeenCalled()
    expect(extractTax1040Carryforward).not.toHaveBeenCalled()
    expect(
      screen.getByText('This looks like a scanned or image-only PDF. Text-PDF upload only for now.'),
    ).toBeTruthy()
  })

  it('CHAR: SSN gate blocks extract call', async () => {
    gateTax1040PdfUpload.mockResolvedValue({
      ok: false,
      code: 'SSN_DETECTED',
      message: 'This PDF still contains a Social Security number in its text. Nothing was uploaded.',
    })
    renderWizard()
    const input = document.querySelector('input[type="file"]')
    const file = new File([new Uint8Array([1])], 'fixture-tax-1040-text-with-ssn.pdf', {
      type: 'application/pdf',
    })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
      await Promise.resolve()
    })
    await settle()
    expect(extractTax1040Carryforward).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        'This PDF still contains a Social Security number in its text. Nothing was uploaded.',
      ),
    ).toBeTruthy()
  })

  it('CHAR: clean gate allows extract and shows prefill notice', async () => {
    gateTax1040PdfUpload.mockResolvedValue({
      ok: true,
      text: 'clean',
      alnum: 100,
    })
    extractTax1040Carryforward.mockResolvedValue({
      ok: true,
      result: {
        fields: { priorPassiveLossCarryforward: 12500 },
        warnings: [],
        evidence: { retained: false, deletedAfterProcessing: true },
      },
    })
    renderWizard()
    const input = document.querySelector('input[type="file"]')
    const file = new File([new Uint8Array([1])], 'fixture-tax-1040-text-clean.pdf', {
      type: 'application/pdf',
    })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
      await Promise.resolve()
    })
    await settle()
    expect(extractTax1040Carryforward).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Prefilled 1 field/i)).toBeTruthy()
  })

  it('CHAR: smoke extract prefills step-1 amount; Skip does not persist (Phase 4 HITL)', async () => {
    gateTax1040PdfUpload.mockResolvedValue({ ok: true, text: 'clean', alnum: 100 })
    extractTax1040Carryforward.mockResolvedValue({
      ok: true,
      result: {
        fields: {
          priorPassiveLossCarryforward: 12500,
          priorSuspendedLoss: 3200,
          capLossCarryforwardST: 1500,
          capLossCarryforwardLT: 8000,
          nolCarryforward: null,
          priorYearQBILoss: 4500,
          priorYearTax: 18750,
          priorYearAGI: 142000,
        },
        warnings: [],
        evidence: { retained: false, deletedAfterProcessing: true, retention: 'delete-after-processing' },
      },
    })
    renderWizard()
    const input = document.querySelector('input[type="file"]')
    const file = new File([new Uint8Array([1])], 'fixture-tax-1040-smoke.pdf', {
      type: 'application/pdf',
    })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
      await Promise.resolve()
    })
    await settle()
    expect(screen.getByText(/Prefilled 6 fields/i)).toBeTruthy()
    expect(screen.getByLabelText(CARRYFORWARD_WIZARD_STEPS[0].label).value).toBe('12,500')
    expect(writePersonalContext).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Skip to Personal Return' }))
    expect(writePersonalContext).not.toHaveBeenCalled()
    expect(writeDirtyFlag).not.toHaveBeenCalled()
    expect(markComplete).not.toHaveBeenCalled()
  })

  it('CHAR: Finish after smoke prefill persists mapped fields (Phase 4 HITL)', async () => {
    gateTax1040PdfUpload.mockResolvedValue({ ok: true, text: 'clean', alnum: 100 })
    extractTax1040Carryforward.mockResolvedValue({
      ok: true,
      result: {
        fields: {
          priorPassiveLossCarryforward: 12500,
          priorYearAGI: 142000,
          priorYearTax: 18750,
        },
        warnings: [],
        evidence: { retained: false, deletedAfterProcessing: true },
      },
    })
    readPersonalContext.mockReturnValue({ w2Income: 90000 })
    renderWizard()
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, {
        target: {
          files: [
            new File([new Uint8Array([1])], 'fixture-tax-1040-smoke.pdf', { type: 'application/pdf' }),
          ],
        },
      })
      await Promise.resolve()
    })
    await settle()
    expect(writePersonalContext).not.toHaveBeenCalled()

    for (let i = 0; i < CARRYFORWARD_WIZARD_STEPS.length - 1; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    fireEvent.click(screen.getByRole('button', { name: /Finish & continue to Personal Return/ }))
    expect(writePersonalContext).toHaveBeenCalledTimes(1)
    const saved = writePersonalContext.mock.calls[0][0]
    expect(saved.w2Income).toBe(90000)
    expect(saved.priorPassiveLossCarryforward).toBe(12500)
    expect(saved.priorYearAGI).toBe(142000)
    expect(saved.priorYearTax).toBe(18750)
    expect(writeDirtyFlag).toHaveBeenCalledWith(true)
  })

  it('CHAR: Evidence-retained extract is refused and does not prefill', async () => {
    gateTax1040PdfUpload.mockResolvedValue({ ok: true, text: 'clean', alnum: 100 })
    extractTax1040Carryforward.mockResolvedValue({
      ok: true,
      result: {
        fields: { priorPassiveLossCarryforward: 12500 },
        evidence: { retained: true, path: 'Evidence/x.pdf', bucket: 'Evidence' },
      },
    })
    renderWizard()
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, {
        target: {
          files: [new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })],
        },
      })
      await Promise.resolve()
    })
    await settle()
    expect(screen.getByText(/must not be stored in Evidence/i)).toBeTruthy()
    expect(screen.getByLabelText(CARRYFORWARD_WIZARD_STEPS[0].label).value).toBe('')
    expect(writePersonalContext).not.toHaveBeenCalled()
  })
})
