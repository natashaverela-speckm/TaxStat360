// src/Admin.jsx
// Admin-only tool to permanently delete a specified user â for deletion requests
// that arrive by email. Reuses the same backend deletion flow as self-service.
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from './BrandLogo'
import { apiGet } from './utils/apiClient.js'
import { adminDeleteUser } from './utils/serverApi.js'
import { NAVY as N, BLUE as B, SLATE as SL } from './theme.js'


export default function Admin() {
  const nav = useNavigate()
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [me, setMe] = useState('')

  const [target, setTarget] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    apiGet('/auth/me', { credentials: 'include' })
      .then(u => {
        if (!alive) return
        setIsAdmin(!!(u && u.is_admin))
        setMe((u && u.email) || '')
        setChecking(false)
      })
      .catch(() => {
        if (!alive) return
        setIsAdmin(false)
        setChecking(false)
      })
    return () => { alive = false }
  }, [])

  async function handleDelete() {
    setErr(''); setMsg('')
    const email = target.trim().toLowerCase()
    if (!email) { setErr('Enter the email address to delete.'); return }
    if (email === (me || '').trim().toLowerCase()) {
      setErr("That's your own account. Delete your own account from Settings, not here.")
      return
    }
    if (confirmText.trim().toUpperCase() !== 'DELETE') {
      setErr('Type DELETE to confirm.'); return
    }
    setBusy(true)
    try {
      const res = await adminDeleteUser(email)
      const note = res && res.already_absent ? ' (no account existed â nothing to remove)' : ''
      setMsg(`Deleted ${email}${note}.`)
      setTarget(''); setConfirmText('')
    } catch (e) {
      if (e && e.status === 403) setErr('You are not authorized to delete users.')
      else if (e && e.status === 400) setErr((e.body && e.body.detail) || 'Invalid request.')
      else setErr((e && (e.body?.detail || e.message)) || 'Deletion failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, maxWidth: 520, margin: '0 auto' }

  if (checking) {
    return <div style={{ padding: 48, textAlign: 'center', color: SL }}>Checking accessâ¦</div>
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '48px 16px' }}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: N, marginBottom: 8 }}>Not authorized</div>
          <div style={{ fontSize: 14, color: SL, marginBottom: 18 }}>This page is for administrators only.</div>
          <button onClick={() => nav('/dashboard')} style={{ padding: '9px 18px', background: B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '40px 16px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BrandLogo size={28} />
        <div style={{ fontSize: 18, fontWeight: 700, color: N }}>Admin Â· Delete a user</div>
      </div>
      <div style={{ ...card, border: '1px solid #FCA5A5' }}>
        <div style={{ fontSize: 13.5, color: SL, lineHeight: 1.55, marginBottom: 18 }}>
          Permanently delete a user who requested deletion by email. This cancels their subscription, erases their account and all saved tax records, and writes an audit-log entry. <strong>This cannot be undone.</strong>
        </div>

        <label style={{ fontSize: 12, fontWeight: 700, color: SL, letterSpacing: '0.04em', textTransform: 'uppercase' }}>User email</label>
        <input
          value={target}
          onChange={e => setTarget(e.target.value)}
          placeholder="user@example.com"
          disabled={busy}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, margin: '6px 0 16px' }}
        />

        <label style={{ fontSize: 12, fontWeight: 700, color: SL, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Type DELETE to confirm</label>
        <input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder="DELETE"
          disabled={busy}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, margin: '6px 0 16px' }}
        />

        {err && <div role="alert" style={{ fontSize: 13, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>{err}</div>}
        {msg && <div role="status" style={{ fontSize: 13, color: '#065F46', background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>{msg}</div>}

        <button
          onClick={handleDelete}
          disabled={busy || !target.trim() || confirmText.trim().toUpperCase() !== 'DELETE'}
          style={{ padding: '10px 18px', background: (busy || !target.trim() || confirmText.trim().toUpperCase() !== 'DELETE') ? '#FCA5A5' : '#DC2626', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: (busy || !target.trim() || confirmText.trim().toUpperCase() !== 'DELETE') ? 'default' : 'pointer' }}
        >
          {busy ? 'Deletingâ¦' : 'Permanently delete user'}
        </button>
      </div>
    </div>
  )
}
