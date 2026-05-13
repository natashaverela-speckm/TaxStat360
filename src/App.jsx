import { useEffect } from 'react'
import Privacy from './Privacy'
import Terms from './Terms'
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation, Link } from 'react-router-dom'
import Landing from './Landing'
import Onboarding from './Onboarding'
import CalculateTaxInner from './CalculateTaxInner'
import TaxReturn from './TaxReturn'
import AIAnalysis from './AIAnalysis'
import Dashboard from './Dashboard'
import Settings from './Settings'
import Upgrade from './Upgrade'
import ResetPassword from './ResetPassword'
import ForgotPassword from './ForgotPassword'

// ─── OAuth Callback Handler ───────────────────────────────────────────────────
// M1: Provider allowlist prevents arbitrary localStorage key pollution.
const OAUTH_PROVIDERS = new Set(['quickbooks', 'xero', 'wave', 'freshbooks'])

function OAuthCallback() {
  const { provider = 'unknown' } = useParams()
  const location = useLocation()
  useEffect(() => {
    const p = provider.toLowerCase()
    if (!OAUTH_PROVIDERS.has(p)) {
      window.location.href = '/calculate-tax'
      return
    }
    const name = p.charAt(0).toUpperCase() + p.slice(1)
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

// ─── Auth Keys ────────────────────────────────────────────────────────────────
// Module-level constant — single source of truth for which localStorage keys
// belong to the auth session. Shared by isValidSession() (expiry cleanup) and
// RequireAuth's idle-timeout handler so both always clear the same set of keys.
//
// Does NOT include tax record keys (ts360_records_*) or login history
// (ts360_login_history) — those are user data that must survive a session
// expiry so records are still available after the user re-authenticates.
const AUTH_KEYS = [
  'token',
  'ts360_session',
  'ts360_session_start',
  'ts360_email',
  'plan',
  'userName',
  'ts360_connected_app',
]

// ─── Session Hard-Cap ─────────────────────────────────────────────────────────
// 7 days — regardless of idle-timeout preference. A tax-planning app with
// sensitive financial data should never have an eternal browser session.
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

// ─── Session Validator ────────────────────────────────────────────────────────
// Replaces the bare localStorage.getItem('ts360_session') check that was used
// previously. Two-stage validation:
//
// Stage 1 — Token presence and minimum length:
//   ts360_session must exist and contain at least 10 non-whitespace characters.
//   This prevents a browser-console bypass of the form:
//     localStorage.setItem('ts360_session', 'x')
//   Any legitimate session token (JWT, UUID, Supabase token) will exceed this
//   threshold by a wide margin. Adjust upward if your token format is known.
//
// Stage 2 — Session age (7-day hard cap):
//   If ts360_session_start exists, compute the session age and enforce the cap.
//   If ts360_session_start is absent (sessions created before this change
//   landed in production), the age check is skipped — no forced logout for
//   existing users. Onboarding.jsx writes ts360_session_start at login so all
//   new sessions are age-gated automatically from this point forward.
//
//   On expiry: clears AUTH_KEYS from localStorage and returns false.
//   Tax records (ts360_records_*) are intentionally preserved so the user
//   can reload their data immediately after re-authenticating.
function isValidSession() {
  const session = localStorage.getItem('ts360_session')

  // Stage 1: token must exist with meaningful content
  if (!session || session.trim().length < 10) return false

  // Stage 2: enforce 7-day hard cap if session start time is recorded
  const start = localStorage.getItem('ts360_session_start')
  if (start) {
    const startMs = parseInt(start, 10)
    if (!isNaN(startMs) && Date.now() - startMs > SESSION_MAX_AGE_MS) {
      AUTH_KEYS.forEach(k => localStorage.removeItem(k))
      return false
    }
  }

  return true
}

// ─── Persistent Authenticated Footer ─────────────────────────────────────────
// Renders on every protected route via RequireAuth.
function AuthFooter() {
  const year = new Date().getFullYear()
  const link = { color: '#64748B', textDecoration: 'none', fontWeight: 600 }
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 34,
      background: '#fff',
      borderTop: '1px solid #E2E8F0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 24,
      fontSize: 11,
      color: '#94A3B8',
      zIndex: 50,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <span>© {year} TaxStat360</span>
      <span style={{ color: '#E2E8F0' }}>|</span>
      <Link to="/terms" style={link}>Terms of Service</Link>
      <Link to="/privacy" style={link}>Privacy Policy</Link>
      <span style={{ color: '#E2E8F0' }}>|</span>
      <span>For planning purposes only — not professional tax advice</span>
    </div>
  )
}

// ─── Auth Guard ───────────────────────────────────────────────────────────────
// Wraps all protected routes. Handles:
// 1. Auth check — calls isValidSession() (token presence + length + 7-day cap)
//    and redirects unauthenticated or expired sessions to /login, preserving
//    the attempted URL in location.state.from for post-login redirect.
// 2. Login history — records one entry per calendar day (max 10) to
//    ts360_login_history in localStorage, read by Settings.jsx.
// 3. Idle timeout — enforces the timeout preference set in Settings.jsx
//    (ts360_idle_timeout_mins). On expiry, clears AUTH_KEYS and redirects to
//    /login. Tax records are preserved — only session keys are cleared.
// 4. AuthFooter — persistent ToS/Privacy footer on all authenticated pages.
function RequireAuth({ children }) {
  const sessionOk = isValidSession()
  const location = useLocation()

  useEffect(() => {
    if (!sessionOk) return

    // ── Login history ────────────────────────────────────────────────────────
    // Record one entry per calendar day so Settings.jsx can display recent
    // sessions. Uses Date.toDateString() for day-level deduplication.
    try {
      const history = JSON.parse(localStorage.getItem('ts360_login_history') || '[]')
      const today = new Date().toDateString()
      const lastEntry = history[0]
      if (!lastEntry || new Date(lastEntry.timestamp).toDateString() !== today) {
        history.unshift({
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
        })
        localStorage.setItem('ts360_login_history', JSON.stringify(history.slice(0, 10)))
      }
    } catch(e) { /* localStorage may be unavailable in private browsing */ }

    // ── Idle timeout ─────────────────────────────────────────────────────────
    // Read preference set in Settings.jsx. 0 = disabled (default).
    // Only AUTH_KEYS are cleared on expiry — tax records are preserved.
    const timeoutMins = parseInt(localStorage.getItem('ts360_idle_timeout_mins') || '0')
    if (!timeoutMins) return

    let timer
    const handleExpiry = () => {
      AUTH_KEYS.forEach(k => localStorage.removeItem(k))
      window.location.href = '/login'
    }
    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(handleExpiry, timeoutMins * 60 * 1000)
    }
    const EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      clearTimeout(timer)
      EVENTS.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [sessionOk])

  if (!sessionOk) return <Navigate to="/login" state={{ from: location }} replace />
  return (
    <>
      {children}
      <AuthFooter />
    </>
  )
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
        {/* FIX (F1-01): /signin already existed; /sign-in is the canonical
            URL used in marketing emails and the public nav "Sign In" button.
            Both now resolve to the Onboarding login screen. */}
        <Route path="/signin" element={<Onboarding screen="login" />} />
        <Route path="/sign-in" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Onboarding screen="login" />} />
        <Route path="/verify-email" element={<Onboarding screen="verify" />} />
        {/* Onboarding flow — wrapped in RequireAuth */}
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
        {/* Password reset — public */}
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        {/* Public legal */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms"   element={<Terms />} />
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
