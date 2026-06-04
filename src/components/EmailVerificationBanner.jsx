import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../constants.js'

const B = '#2563EB'
const N = '#0D1B3E'
const CONFIRMED_ACK_KEY = 'ts360_email_confirmed_ack'

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

  const showConfirmedAck = () => localStorage.getItem(CONFIRMED_ACK_KEY) === '1'

  useEffect(() => {
    if (!verified || showConfirmedAck()) return
    const markSeen = () => localStorage.setItem(CONFIRMED_ACK_KEY, '1')
    window.addEventListener('beforeunload', markSeen)
    return () => {
      markSeen()
      window.removeEventListener('beforeunload', markSeen)
    }
  }, [verified])

  if (!email) return null

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
      const res = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Could not resend email')
      }
      setMsg(`✓ Verification email sent again to ${email}. Check your inbox (and junk/spam).`)
    } catch (e) {
      setMsg(e.message || 'Could not resend email')
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
      const res = await fetch(`${API_BASE_URL}/auth/change-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, new_email: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Could not update email')
      localStorage.setItem('ts360_email', next)
      localStorage.setItem('pendingEmail', next)
      localStorage.removeItem('ts360_email_verified')
      onEmailUpdated?.(next)
      setEditing(false)
      setMsg(`✓ Verification email sent again to ${next}. Check your inbox (and junk/spam).`)
    } catch (err) {
      setMsg(err.message || 'Could not update email')
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
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
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
      {msg ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#475569', maxWidth: 1200 }}>
          {msg}
        </p>
      ) : null}
    </div>
  )
}

export async function fetchVerificationStatus(email) {
  if (!email) return { verified: true }
  if (localStorage.getItem('ts360_email_verified') === '1') {
    return { verified: true, email }
  }
  try {
    const res = await fetch(
      `${API_BASE_URL}/auth/verification-status?email=${encodeURIComponent(email)}`,
      { headers: { Accept: 'application/json' } },
    )
    if (res.ok) {
      const data = await res.json()
      if (data.verified) {
        localStorage.setItem('ts360_email_verified', '1')
        localStorage.removeItem(CONFIRMED_ACK_KEY)
        return { verified: true, email: data.email || email }
      }
      return { verified: false, email: data.email || email }
    }
  } catch (_e) {
    /* fail open — never block the app */
  }
  return { verified: false, email }
}
