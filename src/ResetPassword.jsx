import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BrandLogo from './BrandLogo'
import PasswordInput from './components/PasswordInput.jsx'
import { apiPost, ApiError } from './utils/apiClient.js'

const N = '#0D1B3E', B = '#2563EB', SL = '#475569'

function Logo() {
  return <BrandLogo size={32} />
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
    } else {
      // SECURITY: scrub token and email from URL immediately after reading
      // to prevent them appearing in browser history and Referer headers
      window.history.replaceState(null, '', '/reset-password')
    }
  }, [token, email])

  const handleSubmit = async () => {
    setError('')
    if (!password) return setError('Please enter a new password.')
    if (password.length < 12) return setError('Password must be at least 12 characters.')
    if (password.length > 128) return setError('Password must be under 128 characters.')
    if (password !== confirm) return setError('Passwords do not match.')

    setLoading(true)
    try {
      await apiPost('/auth/reset-password', { email, token, new_password: password })
      setSuccess(true)
    } catch (e) {
      // Faithful to the prior fetch logic: a non-ok response WITH a parsed JSON body shows
      // its `detail` (falling back to the expired-link message); a non-ok response with an
      // unparseable body, or any network / parse failure, shows the network-error message.
      if (e instanceof ApiError && e.body != null) {
        const detail = e.body.detail
        setError(typeof detail === 'string' ? detail : 'Reset failed. The link may have expired.')
      } else {
        setError('Network error. Please try again.')
      }
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
              <PasswordInput
                id="reset-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 12 characters"
                autoComplete="new-password"
                inputStyle={{ padding: '11px 40px 11px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0' }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: N, display: 'block', marginBottom: 6 }}>Confirm new password</label>
              <PasswordInput
                id="reset-password-confirm"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your new password"
                autoComplete="new-password"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                inputStyle={{ padding: '11px 40px 11px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0' }}
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
