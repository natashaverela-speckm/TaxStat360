import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

const N = '#0D1B3E', B = '#2563EB', SL = '#475569'
const API = 'https://app.taxstat360.com'

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 32, height: 32, background: N, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="12" width="4" height="9" fill="white" rx="1"/>
          <rect x="10" y="7" width="4" height="14" fill="white" rx="1"/>
          <rect x="17" y="3" width="4" height="18" fill="white" rx="1"/>
        </svg>
      </div>
      <span style={{ fontWeight: 800, fontSize: 18, color: N, letterSpacing: '-0.5px' }}>
        TaxStat<span style={{ color: B }}>360</span>
      </span>
    </div>
  )
}

export default function ResetPassword() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const email = searchParams.get('email') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token || !email) {
      setError('Invalid reset link. Please request a new password reset.')
    }
  }, [token, email])

  const handleSubmit = async () => {
    setError('')
    if (!password) return setError('Please enter a new password.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')

    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, new_password: password })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || 'Reset failed. The link may have expired.')
      } else {
        setSuccess(true)
      }
    } catch {
      setError('Network error. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', minHeight: '100vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ marginBottom: 32 }}><Logo /></div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '36px 40px', width: '100%', maxWidth: 420 }}>
        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, background: '#DCFCE7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 24 }}>✓</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: N, marginBottom: 8 }}>Password updated</h2>
            <p style={{ color: SL, fontSize: 14, marginBottom: 24 }}>Your password has been changed. You can now sign in with your new password.</p>
            <button onClick={() => nav('/login')} style={{ width: '100%', padding: '12px', background: B, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              Sign In →
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: N, marginBottom: 6 }}>Set new password</h2>
            <p style={{ color: SL, fontSize: 14, marginBottom: 28 }}>
              {email ? `Resetting password for ${email}` : 'Enter your new password below.'}
            </p>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 16 }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: N, display: 'block', marginBottom: 6 }}>New password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: N, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: N, display: 'block', marginBottom: 6 }}>Confirm new password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your new password"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: N, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading || !token || !email}
              style={{ width: '100%', padding: '12px', background: loading ? '#94A3B8' : B, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Updating...' : 'Update password'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <a href="/login" style={{ fontSize: 13, color: B, textDecoration: 'none' }}>← Back to sign in</a>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
        For security, reset links expire after 1 hour.
      </div>
    </div>
  )
}
