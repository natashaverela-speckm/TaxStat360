import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CARRYFORWARD_WIZARD_STEPS,
  GLOBAL_DISCLAIMER,
  buildInitialWizardValues,
} from '../lib/carryforwardWizardConfig.js'
import { canAccessCarryforwardWizard } from '../lib/carryforwardWizardAccess.js'
import {
  loadWizardValuesFromContext,
  saveWizardValuesToContext,
} from '../lib/carryforwardWizardPersistence.js'
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

  const step = CARRYFORWARD_WIZARD_STEPS[stepIndex]
  const isLast = stepIndex === STEP_COUNT - 1
  const showDisclaimer = stepIndex === 0 || isLast

  const stepSanity = useMemo(
    () => (
      step.informational || !step.fieldKey
        ? { level: 'ok' }
        : evaluateCarryforwardStepSanity(step, values[step.fieldKey], values)
    ),
    [step, values],
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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F8FAFC',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '40px 20px',
      }}
    >
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

        {step.informational ? (
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
            Guidance only — TaxStat360 does not store a value for this item yet. Review with
            your preparer and enter related amounts in the appropriate planning fields if needed.
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
            Skip wizard
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
            {!step.informational && (
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
                Skip this item
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
                Finish
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
  )
}
