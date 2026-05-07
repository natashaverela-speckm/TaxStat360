import { useEffect } from 'react'
import Privacy from './Privacy'
import Terms from './Terms'
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import Landing from './Landing'
import Onboarding from './Onboarding'
import CalculateTaxInner from './CalculateTaxInner'
import TaxReturn from './TaxReturn'
import AIAnalysis from './AIAnalysis'
import Dashboard from './Dashboard'
import Settings from './Settings'
import Upgrade from './Upgrade'

// ─── OAuth Callback Handler ───────────────────────────────────────────────────
// M1: Provider allowlist prevents arbitrary localStorage key pollution.
// OAuthCallback receives a :provider param from the URL. Without an allowlist,
// an attacker could craft /integrations/anything/callback to set arbitrary
// ts360_{anything}_connected keys in localStorage.
const OAUTH_PROVIDERS = new Set(['quickbooks', 'xero', 'wave', 'freshbooks'])

function OAuthCallback() {
  const { provider = 'unknown' } = useParams()
  const location = useLocation()
  useEffect(() => {
<<<<<<< fix/security-pass6-frontend
    // M1: Reject any provider not in the allowlist before touching localStorage
    if (!OAUTH_PROVIDERS.has(provider.toLowerCase())) {
      window.location.href = '/calculate-tax'
      return
    }
    const name = provider.charAt(0).toUpperCase() + provider.slice(1)
=======
    // M1: Reject any provider not in the allowlist before touching localStorage.
    // Normalize to lowercase for both the check AND the key writes — prevents
    // ts360_QuickBooks_connected vs ts360_quickbooks_connected mismatch if the
    // callback URL arrives with mixed case.
    const p = provider.toLowerCase()
    if (!OAUTH_PROVIDERS.has(p)) {
      window.location.href = '/calculate-tax'
      return
    }
    const name = p.charAt(0).toUpperCase() + p.slice(1)
>>>>>>> master
    localStorage.setItem('ts360_connected_app', name)
    localStorage.setItem(`ts360_${p}_connected`, 'true')
    window.location.href = '/calculate-tax'
  }, [provider])
  return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:56,height:56,borderRadius:'50%',background:'#EFF9FF',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:28}}>✓</div>
        <h2 style={{fontSize:20,fontWeight:700,color:'#0D1B3E',marginBottom:8}}>Connecting {provider.charAt(0).toUpperCase()+provider.slice(1)}…</h2>
        <p style={{color:'#475569',fontSize:14}}>Completing secure OAuth handshake. You'll be redirected shortly.</p>
      </div>
    </div>
  )
}

// ─── Auth Guard ───────────────────────────────────────────────────────────────
// Wraps protected routes. Unauthenticated users are redirected to /login with the
// originally-requested location captured in state.from so the login handler can
// redirect them back after they sign in.
//
// Auth presence is signaled by ts360_session — set by Onboarding LoginScreen and
// SignupScreen on successful auth, cleared by every sign-out handler. ts360_user
// was previously also checked here as an OR fallback but was never written by any
// code path (audited 2026-05-05); removed to reduce confusion about the canonical
// auth key.
function RequireAuth({ children }) {
  const isLoggedIn = localStorage.getItem('ts360_session')
  const location = useLocation()
  if (!isLoggedIn) return <Navigate to="/login" state={{ from: location }} replace />
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
        {/* Onboarding flow — B3: wrapped in RequireAuth (users always have a token
            by this point; legitimate traffic is unaffected; prevents unauthenticated
            access to /user/business-info POST endpoint via BusinessScreen) */}
        <Route path="/onboarding/entity"   element={<RequireAuth><Onboarding screen="entity" /></RequireAuth>} />
        <Route path="/onboarding/business" element={<RequireAuth><Onboarding screen="business" /></RequireAuth>} />
        <Route path="/onboarding/import"   element={<RequireAuth><Onboarding screen="import" /></RequireAuth>} />
        {/* OAuth callback */}
        <Route path="/integrations/:provider/callback" element={<OAuthCallback />} />
        {/* Protected app routes */}
        <Route path="/calculate-tax" element={<RequireAuth><CalculateTaxInner /></RequireAuth>} />
        <Route path="/dashboard"     element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/tax-return"    element={<RequireAuth><TaxReturn /></RequireAuth>} />
        <Route path="/ai-analysis"   element={<RequireAuth><AIAnalysis /></RequireAuth>} />
        <Route path="/settings"      element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/upgrade"       element={<RequireAuth><Upgrade /></RequireAuth>} />
        {/* Public legal */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms"   element={<Terms />} />
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
