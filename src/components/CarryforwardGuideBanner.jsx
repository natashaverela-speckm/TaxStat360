import { useNavigate } from 'react-router-dom'
import { canAccessCarryforwardWizard } from '../lib/carryforwardWizardAccess.js'
import { needsCarryforwardWizard } from '../utils/carryforwardWizard.js'
import { readEmail } from '../utils/sessionState.js'
import { BLUE as B, NAVY as N, SLATE as SL } from '../lib/theme.js'

/**
 * @param {{ variant?: 'inline' | 'prominent' }} props
 * - inline: compact link near carryforward fields (always offered)
 * - prominent: always-visible top-of-Tax-Return callout (Start or Edit)
 */
export default function CarryforwardGuideBanner({ variant = 'inline' }) {
  const navigate = useNavigate()
  const unlocked = canAccessCarryforwardWizard()
  const email = readEmail()
  const incomplete = needsCarryforwardWizard(email)
  const ctaLabel = !unlocked
    ? 'Start the carryforward guide 🔒 →'
    : incomplete
      ? 'Start the carryforward guide →'
      : 'Edit carryforward guide →'

  const handleClick = () => {
    navigate(unlocked ? '/carryforward-wizard' : '/upgrade')
  }

  if (variant === 'prominent') {
    return (
      <div
        data-section="carryforwards-entry"
        style={{
          marginBottom: 14,
          padding: '14px 16px',
          borderRadius: 10,
          border: `1px solid ${unlocked ? '#BFDBFE' : '#E2E8F0'}`,
          background: unlocked ? '#EFF6FF' : '#F8FAFC',
          fontSize: 13,
          lineHeight: 1.55,
          color: unlocked ? '#1E3A8A' : '#64748B',
        }}
      >
        <div style={{ fontWeight: 800, color: unlocked ? N : SL, marginBottom: 4, fontSize: 14 }}>
          Carryforward guide
        </div>
        <p style={{ margin: '0 0 10px', color: unlocked ? '#1E3A8A' : SL }}>
          Have prior-year numbers (passive losses, capital-loss carryforwards, NOL, QBI)?
          This short guide walks you through each item and saves them into your current plan.
        </p>
        <button
          type="button"
          onClick={handleClick}
          style={{
            background: unlocked ? N : '#E2E8F0',
            border: 'none',
            padding: '9px 14px',
            borderRadius: 8,
            font: 'inherit',
            color: unlocked ? '#fff' : '#64748B',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {ctaLabel}
        </button>
        {!unlocked && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: SL }}>
            Available on the Professional plan.
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      data-section="carryforwards"
      style={{
        marginBottom: 14,
        padding: '12px 14px',
        borderRadius: 8,
        border: `1px solid ${unlocked ? '#BFDBFE' : '#E2E8F0'}`,
        background: unlocked ? '#EFF6FF' : '#F8FAFC',
        fontSize: 13,
        lineHeight: 1.55,
        color: unlocked ? '#1E3A8A' : '#64748B',
      }}
    >
      <button
        type="button"
        onClick={handleClick}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          font: 'inherit',
          color: unlocked ? B : '#94A3B8',
          fontWeight: 700,
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
        }}
      >
        Not sure where to find these numbers? {ctaLabel}
      </button>
      {!unlocked && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: SL }}>
          Available on the Professional plan.
        </p>
      )}
    </div>
  )
}
