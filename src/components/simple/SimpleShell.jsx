// src/components/simple/SimpleShell.jsx
//
// PHASE 1 (simple flow): the frame around Screens 1–3. One header with three
// destinations (Your result · Advanced · Settings), the app-wide disclaimer strip
// under the content, and nothing else — no tour, no stacked banners. The Advanced link opens the
// existing Tax Tracker, which is where every field this flow hides still lives.
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../BrandLogo'
import { signOut } from '../../utils/SignOut'
import { NAVY as N, SLATE as SL } from '../../lib/theme.js'

const linkStyle = (active) => ({
  padding: '8px 12px', border: '1px solid ' + (active ? N : '#E2E8F0'), borderRadius: 8,
  background: active ? N : '#fff', color: active ? '#fff' : N, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', minHeight: 40,
})

export default function SimpleShell({ step, children, maxWidth = 640 }) {
  const nav = useNavigate()
  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', minHeight: '70vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 16px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button onClick={() => nav('/start')} aria-label="TaxStat360 home" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <BrandLogo size={30} />
        </button>
        <nav aria-label="Primary" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={() => nav('/result')} style={linkStyle(step === 'result')}>Your result</button>
          <button onClick={() => nav('/calculate-tax')} style={linkStyle(false)} title="Every field, including the ones this flow skips">Advanced</button>
          <button onClick={() => nav('/settings')} style={linkStyle(false)}>Settings</button>
          <button onClick={() => signOut(nav)} style={{ ...linkStyle(false), color: SL }}>Sign out</button>
        </nav>
      </header>
      <main style={{ flex: 1, width: '100%', maxWidth, margin: '0 auto', padding: '24px 16px 40px', boxSizing: 'border-box', textAlign: 'left' }}>
        {children}
      </main>
      {/* The app-wide disclaimer strip (AuthFooter in App.jsx) renders in flow under
          these routes — same legal line every signed-in page carries, no second footer. */}
    </div>
  )
}
