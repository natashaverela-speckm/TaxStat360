import { useNavigate } from 'react-router-dom'
import { canAccessCarryforwardWizard } from '../lib/carryforwardWizardAccess.js'
import { BLUE as B, SLATE as SL } from '../lib/theme.js'
export default function CarryforwardGuideBanner() {
  const navigate = useNavigate()
  const unlocked = canAccessCarryforwardWizard()

  const handleClick = () => {
    navigate(unlocked ? '/carryforward-wizard' : '/upgrade')
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
        Not sure where to find these numbers? Start the carryforward guide
        {!unlocked ? ' 🔒' : ''} →
      </button>
      {!unlocked && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: SL }}>
          Available on the Professional plan.
        </p>
      )}
    </div>
  )
}
