import { useState } from 'react'
import './Landing.css'
// #4 FIX: CTA_LABEL now comes from the single source in constants.js (was a local
// duplicate here, in Landing.jsx, and in About.jsx).
import { CTA_LABEL } from '../lib/constants.js'

// CONSISTENCY PASS (Jul 9 2026): palette from src/theme.js — the CC-M01
// migration finished; local hex constants retired. Aliased so usage sites
// are untouched.
import { NAVY as N, BLUE as B } from '../lib/theme.js'

/* Shared site navigation — single source of truth for the marketing/legal pages
   (Landing, About, Privacy, Terms, Resources). Extracted from the former inline
   nav that lived in Landing.jsx so every page stays in sync and inherits the
   same mobile hamburger behavior. (#6 — nav consistency.)

   Anchors use FULL paths (e.g. "/#how-it-works") so they work from ANY page:
   from a sub-page they route back to the landing page and scroll to the section;
   on the landing page itself they just scroll (same-path hash change, no reload).

   #6 FIX: every genuine navigation target (logo, Sign In, Start Trial) is now a
   real <a href> rather than a <button onClick> or a <div role="link">. This makes
   them crawlable, focusable, and openable in a new tab (cmd/ctrl/middle-click).
   A plain left-click is intercepted by spaNav() for client-side React Router
   navigation; modified clicks fall through to the browser's native behavior.

   Mobile hamburger styling comes from the existing .nav-links / .nav-hamburger /
   .nav-cta-btn rules in Landing.css (imported above). Those selectors must be
   class-based (not `button.nav-cta-btn` / `.nav-links button`) for the converted
   anchors to inherit the drawer styling — verify after this change.

   Usage: <Nav nav={nav} />  where  const nav = useNavigate()
   NOTE: this nav is position:fixed (height 64), so the page that renders it must
   offset its content with paddingTop: 64 on the outermost container. */
export default function Nav({ nav }) {
  const [menuOpen, setMenuOpen] = useState(false)

  // Intercept plain left-clicks for SPA routing; let modified clicks (new tab/
  // window) and non-primary buttons fall through to the native anchor behavior.
  const spaNav = (path) => (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    nav(path)
  }

  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      {/* #6 FIX: logo is now a real <a href="/"> — crawlable + keyboard-focusable +
          cmd/middle-clickable, with no need for the manual role/tabIndex/onKeyDown. */}
      <a
        href="/"
        aria-label="TaxStat360 — home"
        onClick={spaNav('/')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textDecoration: 'none' }}
      >
        <div style={{ width: 32, height: 32, background: N, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="13" width="4" height="8" fill="#475569" rx="1"/><rect x="7.5" y="9" width="4" height="12" fill="#94A3B8" rx="1"/><rect x="12.5" y="5" width="4" height="16" fill="#E2E8F0" rx="1"/><rect x="17.5" y="1" width="4" height="20" fill="#2563EB" rx="1"/></svg>
        </div>
        <div style={{ display: 'inline-block', borderBottom: '2px solid ' + B, paddingBottom: 1 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: N }}>TaxStat<span style={{ color: B }}>360</span></span>
        </div>
      </a>
      {/* Desktop + mobile-drawer nav links */}
      <div className={`nav-links${menuOpen ? ' open' : ''}`}>
        <a href="/#how-it-works" style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>How It Works</a>
        <a href="/#features"     style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>Features</a>
        <a href="/#pricing"      style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>Pricing</a>
        <a href="/#faq"          style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>FAQ</a>
        <a href="/resources"     style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>Resources</a>
        {/* #6 FIX: Sign In is genuine navigation → real anchor styled as a text button. */}
        <a href="/login" onClick={spaNav('/login')} style={{ textDecoration: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 15, color: N, padding: '4px 2px' }}>Sign In</a>
        {/* #6 FIX: Start Trial is genuine navigation → real anchor styled as the CTA button. */}
        <a href="/signup" onClick={spaNav('/signup')} className="nav-cta-btn" style={{ display: 'inline-block', background: N, color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{CTA_LABEL}</a>
      </div>
      {/* Hamburger — visible on mobile only via Landing.css @media rule.
          This stays a <button>: it toggles UI state, it is NOT navigation. */}
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
