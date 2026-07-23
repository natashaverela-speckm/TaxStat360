import { DISCLAIMER_FULL, COMPANY_LEGAL_NAME, COMPANY_ADDRESS, SUPPORT_EMAIL } from './lib/constants'

// ─── SHARED SITE-WIDE FOOTER ──────────────────────────────────────────────────
// Single source of truth for footer markup, links, the company NAP (Name / Address /
// contact — used for local-SEO consistency), and the canonical disclaimer string.
//
// Audit fix — Pass 5, "Footer is implemented at least three different ways":
//   • Landing.jsx and About.jsx each carried a full inline navy footer
//     (logo + About/Privacy/Terms/Contact + full company name + address + ©).
//   • Privacy.jsx and Terms.jsx carried a lighter inline footer with a DIFFERENT
//     link set (no About link), NO company name/address, and a SHORTER disclaimer
//     string that dropped the "not a tax preparation or filing service" and the
//     "federal tax only" clauses.
// This component replaces all four inline footers so links, NAP, and disclaimer
// wording are byte-identical on every page. The disclaimer text itself lives in
// constants.js (DISCLAIMER_FULL) — see Pass 5 "Disclaimer wording varies" fix.
//
// Usage: import Footer from './Footer'  then render  <Footer />
// Do NOT reintroduce an inline <footer> on any page.
//
// NOTE (routing pass): links use plain <a href> to match the prior footers' exact
// behavior. If/when the trailing-slash + SPA-navigation pass lands in App.jsx, these
// can be swapped to react-router <Link> to avoid full-page reloads. Left as <a> here
// so this change is purely a consolidation with no behavioral/routing side effects.

const B = '#2563EB'

export default function Footer() {
  return (
    <footer style={{ background: '#0a1628', padding: '40px 32px', textAlign: 'center' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Logo lockup */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, background: B, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
              <rect x="3" y="12" width="4" height="9" fill="white" rx="1" />
              <rect x="10" y="7" width="4" height="14" fill="white" rx="1" />
              <rect x="17" y="3" width="4" height="18" fill="white" rx="1" />
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>
            TaxStat<span style={{ color: B }}>360</span>
          </span>
        </div>

        {/* Consistent link set, site-wide (About link included on every page) */}
        <nav aria-label="Footer" style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
          <a href="/about"    style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>About</a>
          <a href="/privacy"  style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Privacy Policy</a>
          <a href="/terms"    style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Terms of Service</a>
          {/* Absolute "/#contact" so it works from any page that renders this footer */}
          <a href="/#contact" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Contact</a>
        </nav>

        {/* Canonical disclaimer — single source of truth in constants.js */}
        <p style={{ color: '#64748b', fontSize: 11, margin: '0 0 8px', lineHeight: 1.5 }}>{DISCLAIMER_FULL}</p>

        {/* NAP — present on every page for local-SEO consistency */}
        <p style={{ color: '#475569', fontSize: 11, margin: '0 0 8px' }}>
          {COMPANY_LEGAL_NAME} &middot; {COMPANY_ADDRESS} &middot; {SUPPORT_EMAIL}
        </p>

        <p style={{ color: '#475569', fontSize: 12, margin: 0 }}>
          © {new Date().getFullYear()} TaxStat360. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
