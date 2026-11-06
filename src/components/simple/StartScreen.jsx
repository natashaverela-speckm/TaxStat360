// src/components/simple/StartScreen.jsx — Screen 1, "Who are you?"
//
// The dashboard's persona tiles, full-screen, as the first thing a new user sees.
// One tap sets the entity type and decides which fields Screen 2 shows. No tax
// vocabulary on this screen. Mounting here also retires the welcome tour for
// this user (markOnboardingTourComplete) so the old gate never fires again.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import SimpleShell from './SimpleShell.jsx'
import { SIMPLE_TILES } from '../../lib/simpleFlow.js'
import { PRIOR_YEAR_REVIEW_ENABLED } from '../../lib/priorYearReview.js'
import { ADVANCED_HIDDEN } from '../../lib/pnlUpload.js'
import { readEmail } from '../../utils/sessionState.js'
import { markOnboardingTourComplete } from '../../utils/onboardingTour.js'
import { NAVY as N, SLATE as SL, BLUE as B } from '../../lib/theme.js'

export default function StartScreen() {
  const nav = useNavigate()
  useEffect(() => { markOnboardingTourComplete(readEmail()) }, [])

  return (
    <SimpleShell step="start">
      <h1 style={{ fontSize: 26, fontWeight: 800, color: N, margin: '8px 0 6px', letterSpacing: -0.3 }}>Which one describes your situation?</h1>
      <p style={{ fontSize: 14, color: SL, margin: '0 0 20px', lineHeight: 1.6 }}>Pick the closest match. You'll type a few numbers next, and see what you're on track to owe.</p>
      <div role="list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {SIMPLE_TILES.map(t => (
          <button
            key={t.key}
            role="listitem"
            onClick={() => nav(`/numbers?tile=${t.key}`)}
            style={{ textAlign: 'left', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, minHeight: 72 }}
          >
            <span aria-hidden="true" style={{ fontSize: 28, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: N }}>{t.label}</span>
          </button>
        ))}
      </div>
      {PRIOR_YEAR_REVIEW_ENABLED && (
        <button
          role="listitem"
          onClick={() => nav('/review')}
          style={{ marginTop: 12, width: '100%', textAlign: 'left', background: N, color: '#fff', border: 'none', borderRadius: 12, padding: '18px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, minHeight: 72 }}
        >
          <span aria-hidden="true" style={{ fontSize: 28, lineHeight: 1 }}>📄</span>
          <span>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>Review last year's return</span>
            <span style={{ display: 'block', fontSize: 12, opacity: 0.8, marginTop: 2 }}>Upload the PDF. See what it left on the table, and start this year from those figures.</span>
          </span>
        </button>
      )}
      {!ADVANCED_HIDDEN && (
        <div style={{ marginTop: 22, fontSize: 13, color: SL }}>
          More than one of these, or something else?{' '}
          <button onClick={() => nav('/calculate-tax')} style={{ background: 'none', border: 'none', color: B, fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 13 }}>Use the full form →</button>
        </div>
      )}
      <div style={{ marginTop: ADVANCED_HIDDEN ? 22 : 8, fontSize: 13, color: SL }}>
        Saved something before?{' '}
        <button onClick={() => nav('/records')} style={{ background: 'none', border: 'none', color: B, fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 13 }}>Open a saved record →</button>
      </div>
    </SimpleShell>
  )
}
