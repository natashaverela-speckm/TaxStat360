import { useNavigate } from 'react-router-dom'
import { NAVY as N, BLUE as B } from '../lib/theme.js'

/** Shown when a Starter user opens /carryforward-wizard directly. */
export default function CarryforwardWizardUpgrade() {
  const navigate = useNavigate()

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F0F4FF',
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          border: '1.5px dashed #cbd5e1',
          padding: '48px 36px',
          maxWidth: 480,
          textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 16 }} aria-hidden="true">
          🔒
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: N, margin: '0 0 10px' }}>
          Carryforward Guide — Professional Feature
        </h1>
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 24px' }}>
          Step-by-step guidance for prior-year carryforwards — passive losses (Form 8582), NOL,
          capital-loss carryovers, QBI, and estimated-tax safe harbor — is included on the{' '}
          <strong>Professional</strong> and <strong>Enterprise</strong> plans.
        </p>
        <button
          type="button"
          onClick={() => navigate('/upgrade')}
          style={{
            background: B,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '12px 28px',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Upgrade to Professional →
        </button>
        <button
          type="button"
          onClick={() => navigate('/tax-return')}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748B',
            fontSize: 13,
            cursor: 'pointer',
            marginTop: 12,
          }}
        >
          ← Back to Personal Return
        </button>
      </div>
    </div>
  )
}
