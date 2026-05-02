// src/components/FederalScopeBanner.jsx
//
// Persistent scope disclaimer shown above the federal tax liability total.
// Dismissible — once dismissed on a device, it stays dismissed via
// localStorage. Reset by clearing browser data or by toggling the
// "Show scope reminders" option in Settings (added separately).
//
// Visual chrome and dismissal logic come from the shared DismissibleNotice
// primitive; this component supplies the federal-scope-specific copy and the
// "What’s included?" expand/collapse toggle.

import { useState } from 'react';
import DismissibleNotice from './DismissibleNotice';

const STORAGE_KEY = 'tx360.federalScopeBanner.dismissed';

const containerStyle = {
  background: 'rgba(255, 193, 7, 0.08)',
  border: '1px solid rgba(255, 193, 7, 0.35)',
  borderLeft: '1px solid rgba(255, 193, 7, 0.35)',
  borderRadius: 8,
  padding: '10px 12px',
  margin: '0 0 12px 0',
  fontSize: 12,
  lineHeight: 1.45,
  color: '#374151',
  gap: 8,
};

const closeButtonStyle = {
  fontSize: 16,
  color: '#6b7280',
  padding: '0 2px',
};

const toggleButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#1d4ed8',
  padding: 0,
  cursor: 'pointer',
  fontSize: 12,
  textDecoration: 'underline',
  fontFamily: 'inherit',
};

export default function FederalScopeBanner() {
  const [expanded, setExpanded] = useState(false);

  return (
    <DismissibleNotice
      storageKey={STORAGE_KEY}
      persistence="local"
      containerStyle={containerStyle}
      closeButtonStyle={closeButtonStyle}
    >
      <span
        aria-hidden="true"
        style={{ fontSize: 14, lineHeight: 1, marginRight: 8 }}
      >
        ⚠
      </span>
      <strong style={{ fontWeight: 600 }}>Federal tax only.</strong>{' '}
      This estimate does not include state or local income tax.{' '}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={toggleButtonStyle}
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
    </DismissibleNotice>
  );
}
