import { BLUE as B, NAVY as N, SLATE as SL } from '../lib/theme.js'

/**
 * Soft offer shown when Continuing from Step 1 → Step 2.
 * Does not block planning — Skip goes straight to the personal return.
 */
export default function CarryforwardStepOffer({ onStartGuide, onSkip }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Carryforward guide offer"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '28px 28px',
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 800, color: N, margin: '0 0 8px' }}>
          Prior-year carryforwards?
        </h3>
        <p style={{ fontSize: 14, color: SL, margin: '0 0 18px', lineHeight: 1.55 }}>
          Before you finish your personal return, the carryforward guide walks you through
          items like passive losses (Form 8582), capital-loss carryforwards, NOL, and QBI —
          and feeds those numbers into this year&apos;s plan. You can skip and enter them
          later on the Tax Return page.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={onStartGuide}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              borderRadius: 8,
              background: N,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Start the carryforward guide →
          </button>
          <button
            type="button"
            onClick={onSkip}
            style={{
              width: '100%',
              padding: '10px 16px',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              background: '#fff',
              color: B,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Skip — continue to personal return
          </button>
        </div>
      </div>
    </div>
  )
}
