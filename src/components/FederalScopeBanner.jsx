// src/components/FederalScopeBanner.jsx
//
// Persistent scope disclaimer shown above the federal tax liability total.
// Dismissible — once dismissed on a device, it stays dismissed via localStorage.
// Reset by clearing browser data or by toggling the "Show scope reminders"
// option in Settings (added separately).

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'tx360.scopeBanner.dismissed';

export default function FederalScopeBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Read dismissed state on mount
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch (e) {
      // localStorage may be blocked (private mode, etc.) — show banner anyway
      setDismissed(false);
    }
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch (e) {
      // Best effort; non-fatal
    }
  }

  if (dismissed) return null;

  return (
    <div
      role="note"
      aria-label="Federal scope notice"
      style={{
        background: 'rgba(255, 193, 7, 0.08)',
        border: '1px solid rgba(255, 193, 7, 0.35)',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 12,
        fontSize: 12,
        lineHeight: 1.45,
        color: '#374151',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>ⓘ</span>
        <div style={{ flex: 1 }}>
          <strong style={{ fontWeight: 600 }}>Federal tax only.</strong>{' '}
          This estimate does not include state or local income tax.{' '}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none',
              border: 'none',
              color: '#1d4ed8',
              padding: 0,
              cursor: 'pointer',
              fontSize: 12,
              textDecoration: 'underline',
              fontFamily: 'inherit',
            }}
          >
            {expanded ? 'Hide details' : 'What\u2019s included?'}
          </button>

          {expanded && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: '#4b5563' }}>
              <strong>Computed:</strong> Federal income tax, self-employment tax,
              QBI deduction, Additional Medicare Tax, AMT (Form 6251), federal
              quarterly estimates.
              <br />
              <strong>Not computed:</strong> State income tax, local/city tax,
              Net Investment Income Tax (3.8%), passive activity loss limits
              without REP, S Corp stock basis (Form 7203), Form 6198 at-risk
              limits, payroll tax beyond Add'l Medicare.
              <br />
              <em>For filing, work with a CPA or EA.</em>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss notice"
          title="Dismiss"
          style={{
            background: 'none',
            border: 'none',
            color: '#6b7280',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '0 2px',
            fontFamily: 'inherit',
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
