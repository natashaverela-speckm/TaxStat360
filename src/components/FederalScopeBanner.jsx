// src/components/FederalScopeBanner.jsx
//
// Persistent scope disclaimer shown above the federal tax liability total.
// Dismissible — once dismissed on a device, it stays dismissed via localStorage.
//
// Props:
//   variant?: 'light' | 'dark'  — 'dark' switches to high-contrast colors for
//             use on navy/dark backgrounds (e.g. the tax liability box).
//             Defaults to 'light' (white/grey background).
//
// FIX (contrast): default containerStyle used color:#374151 (grey) which was
//   illegible on the navy tax liability background. Added variant="dark" path
//   with rgba(255,255,255,0.87) text and a translucent amber border/background
//   that reads clearly at all viewport sizes.
//
// FIX (copy): "Not computed: Net Investment Income Tax (3.8%)" was incorrect.
//   calcTaxReturn DOES compute NIIT (IRC §1411) and surfaces it in the waterfall.
//   Corrected to "Not computed: State income tax, local/city tax."

import { useState } from 'react';
import DismissibleNotice from './DismissibleNotice';

const STORAGE_KEY = 'tx360.federalScopeBanner.dismissed';

const STYLES = {
  light: {
    container: {
      background: 'rgba(255, 193, 7, 0.08)',
      border: '1px solid rgba(255, 193, 7, 0.35)',
      borderRadius: 8,
      padding: '10px 12px',
      margin: '0 0 12px 0',
      fontSize: 12,
      lineHeight: 1.45,
      color: '#374151',
      gap: 8,
    },
    closeButton: { fontSize: 16, color: '#6b7280', padding: '0 2px' },
    toggle: { background: 'none', border: 'none', color: '#1d4ed8', padding: 0,
              cursor: 'pointer', fontSize: 12, textDecoration: 'underline', fontFamily: 'inherit' },
    expanded: { marginTop: 8, fontSize: 11.5, color: '#4b5563' },
  },
  dark: {
    container: {
      background: 'rgba(255, 193, 7, 0.10)',
      border: '1px solid rgba(255, 200, 60, 0.40)',
      borderRadius: 8,
      padding: '10px 12px',
      margin: '0 0 12px 0',
      fontSize: 12,
      lineHeight: 1.45,
      color: 'rgba(255,255,255,0.87)',
      gap: 8,
    },
    closeButton: { fontSize: 16, color: 'rgba(255,255,255,0.5)', padding: '0 2px' },
    toggle: { background: 'none', border: 'none', color: '#93c5fd', padding: 0,
              cursor: 'pointer', fontSize: 12, textDecoration: 'underline', fontFamily: 'inherit' },
    expanded: { marginTop: 8, fontSize: 11.5, color: 'rgba(255,255,255,0.70)' },
  },
}

export default function FederalScopeBanner({ variant = 'light' }) {
  const [expanded, setExpanded] = useState(false);
  const s = STYLES[variant] || STYLES.light;

  return (
    <DismissibleNotice
      storageKey={STORAGE_KEY}
      persistence="local"
      containerStyle={s.container}
      closeButtonStyle={s.closeButton}
    >
      <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1, marginRight: 8 }}>⚠</span>
      <strong style={{ fontWeight: 600 }}>Federal tax only.</strong>{' '}
      This estimate does not include state or local income tax.{' '}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={s.toggle}
      >
        {expanded ? 'Hide details' : 'What\u2019s included?'}
      </button>

      {expanded && (
        <div style={s.expanded}>
          <strong>Computed:</strong> Federal income tax, self-employment tax,
          QBI deduction (§199A), Net Investment Income Tax (3.8% §1411),
          Additional Medicare Tax (0.9%), AMT (Form 6251), federal quarterly
          estimates, FICA savings from S-Corp structure.
          <br />
          <strong>Not computed:</strong> State income tax, local/city tax,
          S Corp stock basis limits (Form 7203), Form 6198 at-risk limits,
          §704/§1367 partner/shareholder basis loss caps.
          <br />
          <em>For filing, work with a CPA or EA.</em>
        </div>
      )}
    </DismissibleNotice>
  );
}
