import { useEffect } from 'react'
import Privacy from './Privacy'
import Terms from './Terms'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import Landing from './Landing'
import Onboarding from './Onboarding'
import CalculateTax from './CalculateTax'
import CalculateTaxInner from './CalculateTaxInner'
import TaxReturn from './TaxReturn'
import AIAnalysis from './AIAnalysis'
import Dashboard from './Dashboard'

// ─── OAuth Callback Handler ───────────────────────────────────────────────────
function OAuthCallback() {
  const { provider = 'unknown' } = useParams()
  useEffect(() => {
    const name = provider.charAt(0).toUpperCase() + provider.slice(1)
    localStorage.setItem('ts360_connected_app', name)
    localStorage.setItem(`ts360_${provider}_connected`, 'true')
    window.location.href = '/calculate-tax'
  }, [provider])
  return (
    <div style={{ fontFamily: 'Inter,sans-serif', minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#EFF9FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>✓</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0D1B3E', marginBottom: 8 }}>Connecting {provider.charAt(0).toUpperCase() + provider.slice(1)}…</h2>
        <p style={{ color: '#475569', fontSize: 14 }}>Completing secure OAuth handshake. You'll be redirected shortly.</p>
      </div>
    </div>
  )
}

// ─── Auth Guard ───────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const isLoggedIn = localStorage.getItem('ts360_user') || localStorage.getItem('ts360_session')
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return children
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<Onboarding screen="signup" />} />
        <Route path="/register" element={<Onboarding screen="signup" />} />
        <Route path="/signin" element={<Onboarding screen="login" />} />
        <Route path="/login" element={<Onboarding screen="login" />} />
        <Route path="/verify-email" element={<Onboarding screen="verify" />} />

        {/* Onboarding flow */}
        <Route path="/onboarding/entity" element={<Onboarding screen="entity" />} />
        <Route path="/onboarding/business" element={<Onboarding screen="business" />} />
        <Route path="/onboarding/import" element={<Onboarding screen="import" />} />

        {/* OAuth callback */}
        <Route path="/integrations/:provider/callback" element={<OAuthCallback />} />

        {/* Protected app routes */}
        <Route path="/calculate-tax" element={<CalculateTax />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/tax-return" element={<TaxReturn />} />
        <Route path="/ai-analysis" element={<AIAnalysis />} />

        {/* Fallback */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
