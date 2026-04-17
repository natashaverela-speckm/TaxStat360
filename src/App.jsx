import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import Landing    from './Landing'
import Onboarding from './Onboarding'
import CalculateTax from './CalculateTax'
import AIAnalysis   from './AIAnalysis'

// ‚îÄ‚îÄ‚îÄ OAuth Callback Handler ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// Handles /integrations/:provider/callback ‚Äî marks provider as connected
// and returns user to /calculate-tax
function OAuthCallback() {
  const { provider = 'unknown' } = useParams()

  useEffect(() => {
    const name = provider.charAt(0).toUpperCase() + provider.slice(1)
    localStorage.setItem('ts360_connected_app', name)
    localStorage.setItem(`ts360_${provider}_connected`, 'true')
    window.location.href = '/calculate-tax'
  }, [provider])

  return (
    <div style={{
      fontFamily: 'Inter,sans-serif',
      minHeight: '100vh',
      background: '#F8FAFC',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ textAlign:'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#EFF9FF', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: 28,
        }}>
          ‚úì
        </div>
        <h2 style={{ fontSize:20, fontWeight:700, color:'#0D1B3E', marginBottom:8 }}>
          Connecting {provider.charAt(0).toUpperCase() + provider.slice(1)}‚Ä¶
        </h2>
        <p style={{ color:'#475569', fontSize:14 }}>
          Completing secure OAuth handshake. You'll be redirected shortly.
        </p>
      </div>
    </div>
  )
}

// ‚îÄ‚îÄ‚îÄ Auth Guard ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
function RequireAuth({ children }) {
  const isLoggedIn = localStorage.getItem('ts360_user') || localStorage.getItem('ts360_session')
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return children
}

// ‚îÄ‚îÄ‚îÄ App ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/"              element={<Landing />} />
        <Route path="/signup"        element={<Onboarding screen="signup" />} />
        <Route path="/register"      element={<Onboarding screen="signup" />} />
        <Route path="/login"         element={<Onboarding screen="login"  />} />
        <Route path="/verify-email"  element={<Onboarding screen="verify" />} />

        {/* Onboarding flow */}
        <Route path="/onboarding/entity"   element={<Onboarding screen="entity"   />} />
        <Route path="/onboarding/business" element={<Onboarding screen="business" />} />
        <Route path="/onboarding/import"   element={<Onboarding screen="import"   />} />

        {/* OAuth callback ‚Äî must be accessible without auth guard */}
        <Route path="/integrations/:provider/callback" element={<OAuthCallback />} />

        {/* Protected app routes */}
        <Route path="/calculate-tax" element={<CalculateTax />} />
        <Route path="/tax-return"    element={<CalculateTax />} />
        <Route path="/ai-analysis"   element={<AIAnalysis />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

