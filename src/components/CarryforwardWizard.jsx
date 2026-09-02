import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CARRYFORWARD_WIZARD_STEPS,
  CARRYFORWARD_PDF_PREFILL_ENABLED,
  GLOBAL_DISCLAIMER,
  buildInitialWizardValues,
} from '../lib/carryforwardWizardConfig.js'
import { canAccessCarryforwardWizard } from '../lib/carryforwardWizardAccess.js'
import {
  loadWizardValuesFromContext,
  saveWizardValuesToContext,
} from '../lib/carryforwardWizardPersistence.js'
import { extractTax1040Carryforward } from '../lib/carryforwardExtractClient.js'
import {
  applyExtractFieldsToWizardValues,
  assertTaxExtractNotRetained,
} from '../lib/carryforwardExtractMap.js'
import {
  evaluateCarryforwardStepSanity,
  collectCarryforwardWarnings,
} from '../lib/carryforwardSanity.js'
import { readEmail } from '../utils/sessionState.js'
import { markCarryforwardWizardComplete } from '../utils/carryforwardWizard.js'
import MoneyInput from './MoneyInput.jsx'
import CarryforwardWizardUpgrade from './CarryforwardWizardUpgrade.jsx'
import { NAVY as N, BLUE as B, SLATE as SL, RED as R } from '../lib/theme.js'

const STEP_COUNT = CARRYFORWARD_WIZARD_STEPS.length

const moneyInputStyle = {
  width: '100%',
  padding: '9px 11px',
  border: '1.5px solid #E2E8F0',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
  color: N,
  position: 'relative',
  zIndex: 2,
}

const warnBannerStyle = {
  fontSize: 13,
  color: '#78350F',
  margin: '10px 0 0',
  padding: '10px 12px',
  background: '#FFFBEB',
  border: '1px solid #FDE68A',
  borderRadius: 8,
  lineHeight: 1.55,
}

const srOnlyStyle = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

export { buildInitialWizardValues }

export default function CarryforwardWizard() {
  if (!canAccessCarryforwardWizard()) {
    return <CarryforwardWizardUpgrade />
  }
  return <CarryforwardWizardFlow />
}

function CarryforwardWizardFlow() {
  const navigate = useNavigate()
  const headingRef = useRef(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [values, setValues] = useState(() => loadWizardValuesFromContext())
  const [inputError, setInputError] = useState('')
  const [extractBusy, setExtractBusy] = useState(false)
  const [extractNotice, setExtractNotice] = useState(null) // { kind, text }
  const fileInputRef = useRef(null)

  const step = CARRYFORWARD_WIZARD_STEPS[stepIndex]
  const isGuidanceOnly = Boolean(step.informational || !step.fieldKey)
  const isLast = stepIndex === STEP_COUNT - 1
  const showDisclaimer = stepIndex === 0 || isLast

  const stepSanity = useMemo(
    () => (
      isGuidanceOnly
        ? { level: 'ok' }
        : evaluateCarryforwardStepSanity(step, values[step.fieldKey], values)
    ),
    [isGuidanceOnly, step, values],
  )

  const allWarnings = useMemo(() => collectCarryforwardWarnings(values), [values])

  useEffect(() => {
    setInputError('')
  }, [stepIndex])

  useEffect(() => {
    headingRef.current?.focus()
  }, [stepIndex])

  const setFieldValue = (fieldKey, value) => {
    setValues((prev) => ({ ...prev, [fieldKey]: value }))
    if (inputError) setInputError('')
  }

  const goNext = () => setStepIndex((i) => Math.min(i + 1, STEP_COUNT - 1))
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0))
  const handleSkipWizard = () => navigate('/tax-return')
  const handleFinish = () => {
    saveWizardValuesToContext(values)
    const email = readEmail()
    if (email) markCarryforwardWizardComplete(email)
    navigate('/tax-return?carryforwards=1')
  }

  const handlePrefillFromPdf = async (fileList) => {
    const file = fileList && fileList[0]
    if (!file) return
    setExtractBusy(true)
    setExtractNotice(null)
    const res = await extractTax1040Carryforward(file)
    setExtractBusy(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!res.ok) {
      setExtractNotice({ kind: 'error', text: res.error || 'Extract failed.' })
      return
    }
    if (!assertTaxExtractNotRetained(res.result?.evidence)) {
      setExtractNotice({
        kind: 'error',
        text: 'Extract refused — tax documents must not be stored in Evidence. Enter values manually.',
      })
      return
    }
    const mapped = applyExtractFieldsToWizardValues(res.result?.fields, values)
    setValues(mapped.values)
    const warn = Array.isArray(res.result?.warnings) ? res.result.warnings : []
    const n = mapped.appliedKeys.length
    setExtractNotice({
      kind: 'ok',
      text:
        n > 0
          ? `Prefilled ${n} field${n === 1 ? '' : 's'} from your PDF — review every step before Finish. Nothing is saved until you click Finish.`
          : 'No amounts detected — walk the steps and enter values manually.',
      warnings: warn,
    })
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F8FAFC',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <nav
        style={{
          background: '#fff',
          borderBottom: '1px solid #E2E8F0',
          padding: '0 20px',
          height: 58,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          position: 'sticky',
          top: 0,
          zIndex: 100,
          overflowX: 'auto',
        }}
      >
        {[
          { n: 1, label: 'Entities', current: false, done: true, onClick: () => navigate('/calculate-tax') },
          { n: 2, label: 'Carryforwards', current: true, done: false },
          { n: 3, label: 'Personal Return', current: false, done: false, onClick: () => navigate('/tax-return') },
        ].map((s, i, arr) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: s.done ? '#059669' : s.current ? B : '#E2E8F0',
                  color: s.done || s.current ? '#fff' : '#94A3B8',
                  fontSize: 11,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {s.done ? '✓' : s.n}
              </div>
              {s.onClick ? (
                <button
                  type="button"
                  onClick={s.onClick}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: 12,
                    fontWeight: s.current ? 800 : 600,
                    color: s.current ? N : SL,
                    cursor: 'pointer',
                    textDecoration: s.done ? 'underline' : 'none',
                    textUnderlineOffset: 2,
                  }}
                >
                  {s.label}
                </button>
              ) : (
                <span style={{ fontSize: 12, fontWeight: 800, color: N }}>{s.label}</span>
              )}
            </div>
            {i < arr.length - 1 && <span style={{ color: '#CBD5E1' }}>›</span>}
          </div>
        ))}
      </nav>

      <div
        style={{
          background: N,
          color: '#fff',
          padding: '12px 20px',
          textAlign: 'center',
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.45,
        }}
      >
        Step 2 of your calculation — prior-year carryforward guide
        <span style={{ fontWeight: 500, opacity: 0.85 }}>
          {' '}
          · Skip anytime to continue your personal return
        </span>
      </div>

      <div style={{ padding: '32px 20px 48px' }}>
      <div
        role="region"
        aria-label={`Carryforward guide, step ${stepIndex + 1} of ${STEP_COUNT}`}
        style={{
          maxWidth: 560,
          margin: '0 auto',
          background: '#fff',
          borderRadius: 16,
          padding: '32px 28px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 24px rgba(13,27,62,0.06)',
        }}
      >
        {stepIndex === 0 && CARRYFORWARD_PDF_PREFILL_ENABLED && (
          <div
            style={{
              marginBottom: 20,
              padding: '14px 14px',
              background: '#F0F9FF',
              border: '1px solid #BAE6FD',
              borderRadius: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: N, marginBottom: 6 }}>
              Prefill from prior-year PDF (optional)
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: SL, lineHeight: 1.55 }}>
              Upload last year’s Form 1040 / schedules. We draft carryforward amounts for you to
              review — nothing is saved until you click Finish. Tax PDFs are not kept in RepsRecord
              Evidence.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
              style={{ display: 'none' }}
              onChange={(e) => handlePrefillFromPdf(e.target.files)}
            />
            <button
              type="button"
              disabled={extractBusy}
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: extractBusy ? '#94A3B8' : B,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '9px 14px',
                fontSize: 13,
                fontWeight: 700,
                cursor: extractBusy ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {extractBusy ? 'Reading PDF…' : 'Upload PDF / image'}
            </button>
            {extractNotice && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: extractNotice.kind === 'error' ? '#991B1B' : '#0F766E',
                  background: extractNotice.kind === 'error' ? '#FEF2F2' : '#ECFDF5',
                  border: `1px solid ${extractNotice.kind === 'error' ? '#FECACA' : '#A7F3D0'}`,
                  borderRadius: 8,
                  padding: '8px 10px',
                }}
              >
                {extractNotice.text}
                {Array.isArray(extractNotice.warnings) && extractNotice.warnings.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {extractNotice.warnings.slice(0, 4).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        <span style={srOnlyStyle}>
          Step {stepIndex + 1} of {STEP_COUNT}: {step.label}
        </span>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          {CARRYFORWARD_WIZARD_STEPS.map((s, i) => (
            <div
              key={s.id}
              aria-hidden="true"
              style={{
                height: 8,
                borderRadius: 4,
                width: i === stepIndex ? 28 : 8,
                background: i === stepIndex ? B : '#E2E8F0',
                transition: 'all 0.3s',
              }}
            />
          ))}
        </div>

        <p
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: '#64748B',
            margin: '0 0 16px',
            fontWeight: 600,
          }}
        >
          {stepIndex + 1} of {STEP_COUNT}
        </p>

        <h1
          ref={headingRef}
          tabIndex={-1}
          style={{ fontSize: 22, fontWeight: 800, color: N, margin: '0 0 12px', lineHeight: 1.3, outline: 'none' }}
        >
          {step.label}
        </h1>

        <p style={{ fontSize: 14, color: SL, margin: '0 0 16px', lineHeight: 1.65 }}>
          {step.helperText}
        </p>

        <details
          style={{
            marginBottom: 20,
            padding: '12px 14px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            fontSize: 13,
            color: SL,
            lineHeight: 1.65,
          }}
        >
          <summary
            style={{ cursor: 'pointer', fontWeight: 700, color: N, marginBottom: 8 }}
          >
            What this is and why it matters
          </summary>
          {step.explainer}
        </details>

        {isGuidanceOnly ? (
          <p
            style={{
              fontSize: 13,
              color: '#64748B',
              margin: '0 0 20px',
              padding: '12px 14px',
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 8,
              lineHeight: 1.6,
            }}
          >
            {step.guidanceNote ||
              'Guidance only — there is no amount field on this step. Review with your preparer before relying on this item in your plan.'}
          </p>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor={`cfw-${step.fieldKey}`}
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 700,
                color: SL,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: 6,
              }}
            >
              Amount
            </label>
            <MoneyInput
              id={`cfw-${step.fieldKey}`}
              value={values[step.fieldKey] ?? ''}
              onChange={(v) => setFieldValue(step.fieldKey, v)}
              placeholder="0"
              nonNegative
              coerceEmptyBlurToZero
              ariaLabel={step.label}
              onError={setInputError}
              style={moneyInputStyle}
            />
            {inputError && (
              <div role="alert" style={{ fontSize: 11, color: R, fontWeight: 600, marginTop: 3 }}>
                {inputError}
              </div>
            )}
            {stepSanity.level === 'warn' && stepSanity.message && (
              <div role="alert" aria-live="polite" style={warnBannerStyle}>
                {stepSanity.message}
              </div>
            )}
          </div>
        )}

        {isLast && allWarnings.length > 0 && (
          <div
            style={{
              marginBottom: 20,
              padding: '12px 14px',
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 8,
              fontSize: 13,
              color: '#78350F',
              lineHeight: 1.6,
            }}
          >
            <p style={{ margin: '0 0 8px', fontWeight: 700 }}>
              Items to confirm with your preparer:
            </p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {allWarnings.map((w) => (
                <li key={w.stepId} style={{ marginBottom: 6 }}>
                  <strong>{w.label}:</strong> {w.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {showDisclaimer && (
          <p
            style={{
              fontSize: 12,
              color: '#64748B',
              margin: '0 0 20px',
              padding: '10px 12px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              lineHeight: 1.55,
            }}
          >
            {GLOBAL_DISCLAIMER}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={handleSkipWizard}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 13,
              color: '#64748B',
              cursor: 'pointer',
              fontWeight: 600,
              padding: '8px 0',
            }}
          >
            Skip to Personal Return
          </button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={goBack}
                style={{
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  color: SL,
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
            )}
            {!isLast && (
              <button
                type="button"
                onClick={goNext}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  color: SL,
                  cursor: 'pointer',
                }}
              >
                {isGuidanceOnly ? 'Continue' : 'Skip this item'}
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={handleFinish}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: B,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Finish & continue to Personal Return →
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: N,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
