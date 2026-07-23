import { useState, useEffect } from 'react'
import { writeEmail, writePendingEmail, removeEmailVerified, readEmailVerified, writeEmailVerified, readEmailBannerCollapsed, writeEmailBannerCollapsed, readEmailConfirmedAck, writeEmailConfirmedAck, clearEmailConfirmedAck } from '../utils/sessionState.js'
import { NAVY as N, BLUE as B, SLATE as SL } from '../lib/theme.js'
import { apiGet, apiPost, ApiError } from '../utils/apiClient.js'

const linkBtn = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: B,
  fontWeight: 600,
  fontSize: 'inherit',
  cursor: 'pointer',
  textDecoration: 'underline',
  fontFamily: 'inherit',
}

export default function EmailVerificationBanner({ email, verified, onEmailUpdated }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [newEmail, setNewEmail] = useState(email || '')
  const [collapsed, setCollapsed] = useState(readEmailBannerCollapsed)
  const collapse = () => { setCollapsed(true); writeEmailBannerCollapsed(true) }
  const expand = () => { setCollapsed(false); writeEmailBannerCollapsed(false) }

  const showConfirmedAck = () => readEmailConfirmedAck()

  useEffect(() => {
    if (!verified || showConfirmedAck()) return
    const markSeen = () => writeEmailConfirmedAck()
    window.addEventListener('beforeunload', markSeen)
    return () => {
      markSeen()
      window.removeEventListener('beforeunload', markSeen)
    }
  }, [verified])

  if (!email) return null

  // Collapsed state: a compact, reopenable badge instead of the full-width bar.
  if (collapsed) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 16px', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <button
          type="button"
          onClick={expand}
          aria-label="Email not verified — show verification reminder"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 999,
            padding: '3px 10px', fontSize: 12, color: N, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          📧 Verify email
        </button>
      </div>
    )
  }

  if (verified) {
    if (showConfirmedAck()) return null
    return (
      <div
        style={{
          background: '#ECFDF5',
          borderBottom: '1px solid #A7F3D0',
          padding: '10px 16px',
          fontSize: 13,
          color: '#065F46',
          fontFamily: 'Inter, system-ui, sans-serif',
          lineHeight: 1.5,
          zIndex: 60,
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>✓ Your email is confirmed.</div>
      </div>
    )
  }

  async function resend() {
    setBusy(true)
    setMsg('')
    try {
      await apiPost('/auth/resend-verification', { email })
      setMsg(`✓ Verification email sent again to ${email}. Check your inbox (and junk/spam).`)
    } catch (e) {
      // Match the prior logic: server `detail` on a non-ok response, else a generic message;
      // a network error surfaces its native message (as before).
      if (e instanceof ApiError) {
        setMsg((e.body && e.body.detail) || 'Could not resend email')
      } else {
        setMsg(e.message || 'Could not resend email')
      }
    } finally {
      setBusy(false)
    }
  }

  async function updateEmail(e) {
    e.preventDefault()
    const next = newEmail.trim().toLowerCase()
    if (!next || next === email) {
      setEditing(false)
      return
    }
    setBusy(true)
    setMsg('')
    try {
      await apiPost('/auth/change-email', { new_email: next })
      writeEmail(next)
      writePendingEmail(next)
      removeEmailVerified()
      onEmailUpdated?.(next)
      setEditing(false)
      setMsg(`✓ Verification email sent again to ${next}. Check your inbox (and junk/spam).`)
    } catch (err) {
      if (err instanceof ApiError) {
        setMsg((err.body && err.body.detail) || 'Could not update email')
      } else {
        setMsg(err.message || 'Could not update email')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        background: '#EFF6FF',
        borderBottom: '1px solid #BFDBFE',
        padding: '10px 16px',
        fontSize: 13,
        color: N,
        fontFamily: 'Inter, system-ui, sans-serif',
        lineHeight: 1.5,
        zIndex: 60,
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
        {!editing ? (
          <span>
            📧 Please confirm your email. We sent a verification link to <strong>{email}</strong>. Check your inbox (and junk/spam).
            {' '}Wrong address?{' '}
            <button
              type="button"
              disabled={busy}
              onClick={() => { setEditing(true); setNewEmail(email); setMsg('') }}
              style={linkBtn}
            >
              Update it
            </button>
            {' · '}
            <button type="button" disabled={busy} onClick={resend} style={linkBtn}>
              {busy ? 'Sending…' : 'Resend'}
            </button>
          </span>
        ) : (
            <form onSubmit={updateEmail} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                style={{
                  padding: '6px 10px',
                  border: '1px solid #CBD5E1',
                  borderRadius: 6,
                  fontSize: 13,
                  minWidth: 200,
                }}
              />
              <button type="submit" disabled={busy} style={{ padding: '6px 12px', background: B, color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)} style={{ padding: '6px 10px', background: 'transparent', border: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
            </form>
        )}
        </div>
        <button
          type="button"
          onClick={collapse}
          aria-label="Hide email verification reminder"
          title="Hide"
          style={{ flex: '0 0 auto', background: 'transparent', border: 0, color: '#64748B', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 2 }}
        >
          ×
        </button>
      </div>
      {msg ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: SL, maxWidth: 1200 }}>
          {msg}
        </p>
      ) : null}
    </div>
  )
}

export async function fetchVerificationStatus(email) {
  if (!email) return { verified: true }
  if (readEmailVerified() === '1') {
    return { verified: true, email }
  }
  try {
    // Non-ok throws → caught below → fail open (returns unverified), same as the prior
    // code which only acted inside `if (res.ok)` and otherwise fell through.
    const data = await apiGet(
      `/auth/verification-status?email=${encodeURIComponent(email)}`,
      { headers: { Accept: 'application/json' } },
    )
    if (data?.verified) {
      writeEmailVerified('1')
      clearEmailConfirmedAck()
      return { verified: true, email: data.email || email }
    }
    return { verified: false, email: data?.email || email }
  } catch (_e) {
    /* fail open — never block the app */
  }
  return { verified: false, email }
}
