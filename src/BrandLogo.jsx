const N = '#0D1B3E'
const B = '#2563EB'

/* Single source of truth for the TaxStat360 brand mark (icon tile + wordmark).
   Matches the public site nav (src/Nav.jsx): navy tile, 4 ascending gradient
   bars, navy "TaxStat" + blue "360" with a blue underline.

   Use this everywhere a logo is needed instead of re-defining the SVG inline,
   so the mark can never drift out of sync again.

   Props:
     size  – tile size in px (default 32). The icon and wordmark scale with it.

   Usage:
     import BrandLogo from './BrandLogo'
     <BrandLogo />            // default 32px
     <BrandLogo size={28} />  // smaller, e.g. onboarding cards
   If the logo needs to be clickable, wrap it where it's used:
     <div onClick={() => nav('/dashboard')} style={{ cursor: 'pointer' }}><BrandLogo /></div>
*/
export default function BrandLogo({ size = 32 }) {
  const icon = Math.round(size * 0.5625) // 32 -> 18, same ratio as the site nav
  const font = Math.round(size * 0.5625)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: size, height: size, background: N, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none">
          <rect x="2.5" y="13" width="4" height="8" rx="1" fill="#475569"/>
          <rect x="7.5" y="9" width="4" height="12" rx="1" fill="#94A3B8"/>
          <rect x="12.5" y="5" width="4" height="16" rx="1" fill="#E2E8F0"/>
          <rect x="17.5" y="1" width="4" height="20" rx="1" fill="#2563EB"/>
        </svg>
      </div>
      <span style={{ display: 'inline-block', fontWeight: 800, fontSize: font, color: N, borderBottom: '2px solid ' + B, paddingBottom: 1, lineHeight: 1, letterSpacing: '-0.5px' }}>
        TaxStat<span style={{ color: B }}>360</span>
      </span>
    </div>
  )
}
