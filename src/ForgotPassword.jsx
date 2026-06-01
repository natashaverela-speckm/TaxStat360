import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from './BrandLogo'

const N = '#0D1B3E', B = '#2563EB', SL = '#475569'
const API = 'https://app.taxstat360.com'

function Logo() {
  return <div style={{ marginBottom: 24 }}><BrandLogo size={32} /></div>
}

export default function ForgotPassword() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async () => {
    if (!email) return
    setLoading(true)
    try {
      // SECURITY: always show success regardless of outcome — prevents email enumeration
      await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
    } catch(e) { /* intentional — always show success */ }
    setSent(true)
    setLoading(false)
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', minHeight: '100vh', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '32px', maxWidth: 420, width: '100%', boxShadow: '0 4px 20px rgba(37,99,235,0.10)', border: '1px solid #E2E8F0' }}>
        <Logo />

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: N, marginBottom: 8 }}>Check your email</h2>
            <p style={{ color: SL, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              If <strong>{email}</strong> is registered, we've sent a password reset link. Check your inbox and spam folder.
            </p>
            <button onClick={() => nav('/login')} style={{ width: '100%', padding: '11px', background: B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              Back to Sign In
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: N, marginBottom: 6 }}>Reset your password</h2>
            <p style={{ color: SL, fontSize: 13, marginBottom: 24 }}>Enter your email and we'll send you a reset link.</p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: SL, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="you@company.com"
                autoComplete="email"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 14, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'Inter, sans-serif' }}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading || !email}
              style={{ width: '100%', padding: '11px', background: loading ? '#93c5fd' : B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 12 }}
            >
              {loading ? 'Sending...' : 'Send Reset Link →'}
            </button>

            <p style={{ textAlign: 'center', fontSize: 12, color: SL, margin: 0 }}>
              <span onClick={() => nav('/login')} style={{ color: B, cursor: 'pointer' }}>← Back to Sign In</span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
