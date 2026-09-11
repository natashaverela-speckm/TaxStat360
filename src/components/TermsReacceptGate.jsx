// src/components/TermsReacceptGate.jsx
//
// FRESH-EYES F-9 (11 Sep 2026): re-acceptance when the Terms or Privacy Policy change.
//
// Terms §13 promises at least 30 days' notice of a material change and says continued
// use constitutes acceptance; §11(h) gives an arbitration opt-out "within 30 days of
// first accepting these Terms." Neither sentence means anything unless the app notices
// that the version moved and asks again. Before this component nothing compared the
// accepted version to the current one — c12 rewrote Terms §10 and Privacy §3 the day
// after TERMS_VERSION was frozen, and every user was silently bound to the new text.
//
// How it works: RequireAuth (App.jsx) reads terms_version from /auth/me. If it does
// not equal the current TERMS_VERSION — including the EMPTY value carried by every
// account created before the assent record existed (F-8) — this gate renders instead
// of the app, with the same two-link consent label Onboarding uses, and posts the
// fresh acceptance to /auth/accept-terms. The user cannot reach a protected route
// until it succeeds. Sign-out remains available so nobody is trapped.
//
// This is a blocking gate, not a banner, on purpose: the assent record is only worth
// something if the user could not have proceeded without giving it.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../utils/apiClient.js'
import { signOut } from '../utils/SignOut.jsx'
import { TERMS_VERSION, PRIVACY_VERSION, LEGAL_CONSENT_PREFIX, LEGAL_CONSENT_JOINER, LEGAL_CONSENT_SUFFIX } from '../lib/constants.js'
import { NAVY as N, SLATE as SL, BLUE as B } from '../lib/theme.js'
import BrandLogo from './BrandLogo'

/**
 * @param {object} props
 * @param {string} props.acceptedVersion  the terms_version /auth/me returned ('' for none)
 * @param {() => void} props.onAccepted   called after the server confirms the new acceptance
 */
export default function TermsReacceptGate({ acceptedVersion, onAccepted }) {
  const nav = useNavigate()
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const firstTime = !acceptedVersion

  async function accept(e) {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true); setErr('')
    try {
      await apiFetch('/auth/accept-terms', {
        method: 'POST',
        credentials: 'include',
        body: { terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION, accepted_at: new Date().toISOString() },
      })
      onAccepted()
    } catch (ex) {
      setErr(ex?.message || 'Could not record your acceptance. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={accept} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '28px 28px 22px', maxWidth: 520, width: '100%', boxShadow: '0 4px 24px rgba(13,27,62,0.08)' }}>
        <div style={{ marginBottom: 18 }}><BrandLogo /></div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: N, margin: '0 0 8px' }}>
          {firstTime ? 'Please review our Terms' : 'Our Terms have been updated'}
        </h1>
        <p style={{ fontSize: 14, color: SL, lineHeight: 1.55, margin: '0 0 16px' }}>
          {firstTime
            ? 'We keep a record of which version of our Terms of Service and Privacy Policy each customer has agreed to. We don’t have one on file for your account yet, so please review and confirm below before continuing.'
            : `The Terms of Service and Privacy Policy were updated on ${TERMS_VERSION}. Please review the current versions and confirm your agreement to continue.`}
        </p>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '12px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#F8FAFC', marginBottom: 14 }}>
          <input
            id="terms-reaccept-ok"
            type="checkbox"
            checked={ok}
            onChange={(e) => setOk(e.target.checked)}
            style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 12, color: N, fontWeight: 500, lineHeight: 1.5 }}>
            {LEGAL_CONSENT_PREFIX}{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: B, textDecoration: 'underline', fontWeight: 600 }}>Terms of Service</a>
            {' '}{LEGAL_CONSENT_JOINER}{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: B, textDecoration: 'underline', fontWeight: 600 }}>Privacy Policy</a>
            {LEGAL_CONSENT_SUFFIX}
          </span>
        </label>

        {err && <p role="alert" style={{ fontSize: 12, color: '#B91C1C', margin: '0 0 10px' }}>{err}</p>}

        <button type="submit" disabled={!ok || busy} style={{ width: '100%', padding: 11, background: (!ok || busy) ? '#93c5fd' : B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: (!ok || busy) ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Saving…' : 'I agree — continue'}
        </button>
        <button type="button" onClick={() => signOut(nav)} style={{ width: '100%', marginTop: 10, padding: 9, background: 'transparent', color: SL, border: 'none', fontSize: 13, cursor: 'pointer' }}>
          Sign out instead
        </button>
      </form>
    </div>
  )
}
