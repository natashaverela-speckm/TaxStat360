import { useState } from 'react'
import './Landing.css'

const N = '#0D1B3E'
const B = '#2563EB'

const CTA_LABEL = 'Start Free 7-Day Trial'

/* Shared site navigation — single source of truth for the marketing/legal pages
   (Landing, About, Privacy, Terms, Resources). Extracted from the former inline
   nav that lived in Landing.jsx so every page stays in sync and inherits the
   same mobile hamburger behavior. (#7 — nav consistency.)

   Anchors use FULL paths (e.g. "/#how-it-works") so they work from ANY page:
   from a sub-page they route back to the landing page and scroll to the section;
   on the landing page itself they just scroll (same-path hash change, no reload).

   Mobile hamburger styling comes from the existing .nav-links / .nav-hamburger /
   .nav-cta-btn rules in Landing.css (imported above). If you later move those
   rules into a dedicated Nav.css, update that import.

   Usage: <Nav nav={nav} />  where  const nav = useNavigate()
   NOTE: this nav is position:fixed (height 64), so the page that renders it must
   offset its content with paddingTop: 64 on the outermost container. */
export default function Nav({ nav }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => nav('/')}>
        <div style={{ width: 32, height: 32, background: N, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="13" width="4" height="8" fill="#475569" rx="1"/><rect x="7.5" y="9" width="4" height="12" fill="#94A3B8" rx="1"/><rect x="12.5" y="5" width="4" height="16" fill="#E2E8F0" rx="1"/><rect x="17.5" y="1" width="4" height="20" fill="#2563EB" rx="1"/></svg>
        </div>
        <div style={{ display: 'inline-block', borderBottom: '2px solid ' + B, paddingBottom: 1 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: N }}>TaxStat<span style={{ color: B }}>360</span></span>
        </div>
      </div>
      {/* Desktop + mobile-drawer nav links */}
      <div className={`nav-links${menuOpen ? ' open' : ''}`}>
        <a href="/#how-it-works" style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>How It Works</a>
        <a href="/#features"     style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>Features</a>
        <a href="/#pricing"      style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>Pricing</a>
        <a href="/#faq"          style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>FAQ</a>
        <a href="/resources"     style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>Resources</a>
        <button onClick={() => nav('/login')}  style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 15, color: N }}>Sign In</button>
        <button onClick={() => nav('/signup')} className="nav-cta-btn" style={{ background: N, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{CTA_LABEL}</button>
      </div>
      {/* Hamburger — visible on mobile only via Landing.css @media rule */}
      <button
        className="nav-hamburger"
        onClick={() => setMenuOpen(o => !o)}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
      >
        <span />
        <span />
        <span />
      </button>
    </nav>
  )
}
