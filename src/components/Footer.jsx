import { DISCLAIMER_FULL, COMPANY_LEGAL_NAME, COMPANY_ADDRESS, SUPPORT_EMAIL } from '../lib/constants'
import BrandLogo from './BrandLogo'

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
// Logo: BrandLogo (same mark as the site header / Nav) — do not reintroduce a
// separate footer SVG; that was how the outdated 3-bar blue tile drifted.
//
// Usage: import Footer from './Footer'  then render  <Footer />
// Do NOT reintroduce an inline <footer> on any page.
//
// NOTE (routing pass): links use plain <a href> to match the prior footers' exact
// behavior. If/when the trailing-slash + SPA-navigation pass lands in App.jsx, these
// can be swapped to react-router <Link> to avoid full-page reloads. Left as <a> here
// so this change is purely a consolidation with no behavioral/routing side effects.

export default function Footer() {
  return (
    <footer style={{ background: '#0a1628', padding: '40px 32px', textAlign: 'center' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Same brand mark as header (BrandLogo); onDark for navy footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <BrandLogo size={28} onDark />
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
