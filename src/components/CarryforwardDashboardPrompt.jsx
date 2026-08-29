import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { readEmail, readStep1State } from '../utils/sessionState.js'
import {
  dismissCarryforwardDashboardPrompt,
  shouldShowCarryforwardDashboardPrompt,
} from '../utils/carryforwardWizard.js'
import { canAccessCarryforwardWizard } from '../lib/carryforwardWizardAccess.js'
import { BLUE as B, SLATE as SL } from '../lib/theme.js'

export default function CarryforwardDashboardPrompt() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(true)
  const email = readEmail()
  const { entities } = readStep1State()

  const shouldShow = visible
    && canAccessCarryforwardWizard()
    && shouldShowCarryforwardDashboardPrompt(email, entities || [])

  if (!shouldShow) return null

  const handleStart = () => {
    navigate('/carryforward-wizard')
  }

  const handleDismiss = () => {
    if (email) dismissCarryforwardDashboardPrompt(email)
    setVisible(false)
  }

  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 14px',
        borderRadius: 8,
        border: '1px solid #BFDBFE',
        background: '#EFF6FF',
        fontSize: 13,
        lineHeight: 1.55,
        color: '#1E3A8A',
      }}
    >
      <p style={{ margin: '0 0 10px' }}>
        Have prior-year carryforwards (passive losses, capital losses, NOL, QBI)? The
        carryforward guide can help you enter them.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleStart}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            margin: 0,
            font: 'inherit',
            color: B,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Start the carryforward guide →
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            margin: 0,
            font: 'inherit',
            color: SL,
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}
