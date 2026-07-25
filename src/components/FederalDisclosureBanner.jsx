// src/components/FederalDisclosureBanner.jsx
//
// Batch 7 (Jul 2026): extracted verbatim from Dashboard.jsx so the federal-scope
// disclosure renders on BOTH the Dashboard and the Tax Return page — the page
// where customers read their actual liability figure previously carried no
// "federal only" notice (raised after the orphaned FederalScopeBanner deletion,
// D-01). Dismissal is per-device and SHARED across pages (one storage key):
// a user who has acknowledged the scope once isn't nagged per-page.

import { useState } from 'react'
import { readFedBannerDismissed, writeFedBannerDismissed } from '../utils/sessionState.js'

export default function FederalDisclosureBanner() {
  const [visible, setVisible] = useState(() => !readFedBannerDismissed())
  if (!visible) return null
  // M5: if persistence fails the banner is still dismissed for this render; it may
  // reappear next visit — acceptable for a disclosure banner.
  const dismiss = () => { writeFedBannerDismissed(); setVisible(false) }
  return (
    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16 }}>🇺🇸</span>
        <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 500 }}>
          <strong>Federal estimates only.</strong> TaxStat360 calculates federal income tax liability. State income tax is not included — add your state's effective rate separately for a complete picture.
        </span>
      </div>
      <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 18, lineHeight: 1, padding: 0 }} aria-label="Dismiss">×</button>
    </div>
  )
}
