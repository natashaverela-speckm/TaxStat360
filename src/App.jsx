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
//   If ts360_session_start is absent (pre-existing sessions before this
//   change landed), the age check is skipped — no forced logout for
//   existing users. Once Onboarding writes ts360_session_start on login,
//   all new sessions will be age-gated automatically.
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
      <a href="mailto:support@taxstat360.com" style={link}>support@taxstat360.com</a>
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

// ─── Landing Section Scroll Helper ───────────────────────────────────────────
// FIX (F-01): /features, /pricing, and other Landing section paths previously
// fell through to the * wildcard and redirected to / (homepage top), losing
// the scroll position. Any link or bookmark to one of these paths — from a
// marketing email, shared URL, or the nav bar itself — landed at the top of
// the page with no visible indication that it had broken.
//
// This component renders Landing normally, then scrolls to the target section
// after the component mounts (100ms delay gives the DOM time to paint).
// scrollMarginTop on section headings in Landing.jsx accounts for the sticky
// nav height so the scroll lands cleanly below the nav bar.
//
// Route definitions below cover all five shareable section anchors:
//   /features      → id="features"     (entity structure cards)
//   /pricing       → id="pricing"      (plan cards + billing toggle)
//   /how-it-works  → id="how-it-works" (3-step process)
//   /faq           → id="faq"          (expandable questions)
//   /contact       → id="contact"      (contact form)
//
// F-09: Each section route that is externally linkable (/features, /pricing,
// /faq) gets unique <title>, <meta name="description">, <link rel="canonical">,
// and Open Graph tags so search engines index them as distinct pages.
// Less-visited routes (/how-it-works, /contact) inherit the homepage defaults.

// ── F-09: Per-route SEO metadata ─────────────────────────────────────────────
const SECTION_META = {
  features: {
    title: 'Features — TaxStat360 | S-Corp, LLC & Real Estate Tax Calculator',
    description:
      'See every TaxStat360 feature: live K-1 and Schedule C tax calculation, §199A QBI deduction, FICA savings, quarterly estimated payments, multi-entity consolidation, and AI-powered risk analysis. Built for S-Corp owners, partnerships, real estate investors, and sole proprietors.',
    canonical: 'https://www.taxstat360.com/features',
    ogTitle: 'TaxStat360 Features — Live Tax Calculator for Business Owners',
    ogDescription:
      'K-1 income, QBI deduction, FICA savings, quarterly estimates, and AI risk analysis — all in one place. Supports S-Corps, LLCs, partnerships, and real estate investors.',
  },
  pricing: {
    title: 'Pricing — TaxStat360 | Plans Starting at $79/mo',
    description:
      'TaxStat360 plans start at $79/month with a 7-day free trial. Compare Starter, Professional, and Enterprise plans — no hidden fees, cancel anytime. Includes live federal tax calculation, AI analysis, and QuickBooks/Xero integration.',
    canonical: 'https://www.taxstat360.com/pricing',
    ogTitle: 'TaxStat360 Pricing — Plans from $79/mo, 7-Day Free Trial',
    ogDescription:
      'Start free for 7 days. Starter $79/mo · Professional $149/mo · Enterprise $299/mo. Real-time federal tax calculations for S-Corp owners and business operators.',
  },
  faq: {
    title: 'FAQ — TaxStat360 | Common Questions About S-Corp Tax Tracking',
    description:
      'Answers to common questions about TaxStat360: accuracy of tax calculations, accounting software integrations, data security, multi-entity support, and how the 7-day free trial works.',
    canonical: 'https://www.taxstat360.com/faq',
    ogTitle: 'TaxStat360 FAQ — Your S-Corp Tax Tracking Questions Answered',
    ogDescription:
      'Do I need a CPA? How accurate are the calculations? What software integrates? All your TaxStat360 questions answered.',
  },
}

// ── F-09: Helper — write tags into <head>, restore originals on unmount ───────
function useSectionMeta(sectionId) {
  useEffect(() => {
    const meta = SECTION_META[sectionId]
    if (!meta) return

    // Capture originals so we can restore on unmount (SPA navigation)
    const origTitle    = document.title
    const origDesc     = document.querySelector('meta[name="description"]')?.content || ''
    const origCanon    = document.querySelector('link[rel="canonical"]')?.href || ''
    const origOgTitle  = document.querySelector('meta[property="og:title"]')?.content || ''
    const origOgDesc   = document.querySelector('meta[property="og:description"]')?.content || ''
    const origOgUrl    = document.querySelector('meta[property="og:url"]')?.content || ''
    const origOgImage  = document.querySelector('meta[property="og:image"]')?.content || ''
    const origTwCard   = document.querySelector('meta[name="twitter:card"]')?.content || ''
    const origTwTitle  = document.querySelector('meta[name="twitter:title"]')?.content || ''
    const origTwDesc   = document.querySelector('meta[name="twitter:description"]')?.content || ''
    const origTwImage  = document.querySelector('meta[name="twitter:image"]')?.content || ''

    // Set page title
    document.title = meta.title

    // Set or create <meta name="description">
    let descEl = document.querySelector('meta[name="description"]')
    if (!descEl) { descEl = document.createElement('meta'); descEl.name = 'description'; document.head.appendChild(descEl) }
    descEl.content = meta.description

    // Set or create <link rel="canonical">
    let canonEl = document.querySelector('link[rel="canonical"]')
    if (!canonEl) { canonEl = document.createElement('link'); canonEl.rel = 'canonical'; document.head.appendChild(canonEl) }
    canonEl.href = meta.canonical

    // OG tags
    const setOg = (prop, val) => {
      let el = document.querySelector(`meta[property="${prop}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el) }
      el.content = val
    }
    setOg('og:title',       meta.ogTitle)
    setOg('og:description', meta.ogDescription)
    setOg('og:url',         meta.canonical)
    // SEO-03: og:image and Twitter card tags — uses og-image.png which is live at HTTP 200.
    // Note: social-preview.png was the intended final asset (1200×630px branded image)
    // but currently returns 404. Using og-image.png until social-preview.png is created.
    const OG_IMAGE = 'https://www.taxstat360.com/og-image.png'
    setOg('og:image', OG_IMAGE)
    const setMeta = (name, val) => {
      let el = document.querySelector(`meta[name="${name}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el) }
      el.content = val
    }
    setMeta('twitter:card',        'summary_large_image')
    setMeta('twitter:title',       meta.ogTitle)
    setMeta('twitter:description', meta.ogDescription)
    setMeta('twitter:image',       OG_IMAGE)

    return () => {
      document.title = origTitle
      if (descEl)  descEl.content  = origDesc
      if (canonEl) canonEl.href    = origCanon
      setOg('og:title',       origOgTitle)
      setOg('og:description', origOgDesc)
      setOg('og:url',         origOgUrl)
      setOg('og:image',       origOgImage)
      setMeta('twitter:card',        origTwCard)
      setMeta('twitter:title',       origTwTitle)
      setMeta('twitter:description', origTwDesc)
      setMeta('twitter:image',       origTwImage)
    }
  }, [sectionId])
}

function LandingAtSection({ sectionId }) {
  useSectionMeta(sectionId)
  useEffect(() => {
    const timer = setTimeout(() => {
      const el = document.getElementById(sectionId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
    return () => clearTimeout(timer)
  }, [sectionId])
  return <Landing />
}

// ─── L-09: Route-level page titles ───────────────────────────────────────────
// Sets a unique document.title on every SPA navigation.
// useSectionMeta already owns /features, /pricing, /faq — skip those so the
// richer titles set there are not overwritten by this more generic setter.
const ROUTE_TITLES = {
  '/':                 'TaxStat360 — Year-Round Tax Liability Management for Business Owners',
  '/how-it-works':     'How It Works | TaxStat360',
  '/contact':          'Contact | TaxStat360',
  '/login':            'Sign In | TaxStat360',
  '/signin':           'Sign In | TaxStat360',
  '/sign-in':          'Sign In | TaxStat360',
  '/signup':           'Start Free Trial | TaxStat360',
  '/register':         'Start Free Trial | TaxStat360',
  '/verify-email':     'Verify Email | TaxStat360',
  '/dashboard':        'Dashboard | TaxStat360',
  '/calculate-tax':    'Tax Calculator | TaxStat360',
  '/calculator':       'Tax Calculator | TaxStat360',
  '/tax-return':       'Personal Return | TaxStat360',
  '/ai-analysis':      'AI Tax Analysis | TaxStat360',
  '/settings':         'Account Settings | TaxStat360',
  '/upgrade':          'Upgrade Plan | TaxStat360',
  '/reset-password':   'Reset Password | TaxStat360',
  '/forgot-password':  'Forgot Password | TaxStat360',
  '/privacy':          'Privacy Policy | TaxStat360',
  '/privacy-policy':   'Privacy Policy | TaxStat360',
  '/terms':            'Terms of Service | TaxStat360',
  '/terms-of-service': 'Terms of Service | TaxStat360',
}
// Routes where useSectionMeta sets a richer title — don't overwrite
const META_OWNED_ROUTES = ['/features', '/pricing', '/faq']

function RouteTitle() {
  const location = useLocation()
  useEffect(() => {
    const path = location.pathname.replace(/\/$/, '') || '/'
    if (META_OWNED_ROUTES.some(r => path.startsWith(r))) return
    if (path.startsWith('/onboarding')) {
      document.title = 'Set Up Your Account | TaxStat360'
      return
    }
    if (path.startsWith('/integrations')) return // callback — no title needed
    const title = ROUTE_TITLES[path]
    if (title) document.title = title
  }, [location.pathname])
  return null
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <RouteTitle />
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />

        {/* FIX (F-01): Landing section routes — previously fell through to *
            wildcard and redirected to homepage top. Each renders Landing and
            scrolls to the named section anchor after mount. */}
        <Route path="/features"     element={<LandingAtSection sectionId="features" />} />
        <Route path="/pricing"      element={<LandingAtSection sectionId="pricing" />} />
        <Route path="/how-it-works" element={<LandingAtSection sectionId="how-it-works" />} />
        <Route path="/faq"          element={<LandingAtSection sectionId="faq" />} />
        <Route path="/contact"      element={<LandingAtSection sectionId="contact" />} />

        <Route path="/signup"   element={<Onboarding screen="signup" />} />
        <Route path="/register" element={<Onboarding screen="signup" />} />
        {/* FIX (F1-01): /signin already existed; /sign-in is the canonical
            URL used in marketing emails and the public nav "Sign In" button.
            Both now resolve to the Onboarding login screen. */}
        <Route path="/signin"  element={<Onboarding screen="login" />} />
        <Route path="/sign-in" element={<Navigate to="/login" replace />} />
        <Route path="/login"   element={<Onboarding screen="login" />} />
        <Route path="/verify-email" element={<Onboarding screen="verify" />} />

        {/* Onboarding flow — wrapped in RequireAuth */}
        <Route path="/onboarding/entity"   element={<RequireAuth><Onboarding screen="entity" /></RequireAuth>} />
        <Route path="/onboarding/business" element={<RequireAuth><Onboarding screen="business" /></RequireAuth>} />
        <Route path="/onboarding/import"   element={<RequireAuth><Onboarding screen="import" /></RequireAuth>} />

        {/* OAuth callback */}
        <Route path="/integrations/:provider/callback" element={<OAuthCallback />} />

        {/* Protected app routes */}
        <Route path="/calculate-tax" element={<RequireAuth><CalculateTaxInner /></RequireAuth>} />

        {/* FIX (F-02): /calculator is the natural URL users type or bookmark.
            Previously fell through to the * wildcard and silently redirected
            to the homepage. Now renders Step 1 (Entity Calculator) directly.
            RequireAuth handles unauthenticated access — redirects to /login. */}
        <Route path="/calculator"    element={<RequireAuth><CalculateTaxInner /></RequireAuth>} />

        <Route path="/dashboard"     element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/tax-return"    element={<RequireAuth><TaxReturn /></RequireAuth>} />
        <Route path="/ai-analysis"   element={<RequireAuth><AIAnalysis /></RequireAuth>} />
        <Route path="/settings"      element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/upgrade"       element={<RequireAuth><Upgrade /></RequireAuth>} />

        {/* Password reset — public */}
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Public legal — canonical routes */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms"   element={<Terms />} />
        {/* FIX (F-03): Alias redirects for common long-form legal URLs.
            External links, bookmarks, email footers, and search engines often
            reference /privacy-policy and /terms-of-service. Without these routes
            the * fallback sends those visitors to the homepage instead of the
            legal document — a UX failure and a compliance exposure for users who
            try to read the documents they consented to at registration.
            Navigate replace keeps browser history clean (no back-button loop). */}
        <Route path="/privacy-policy"   element={<Navigate to="/privacy" replace />} />
        <Route path="/terms-of-service" element={<Navigate to="/terms"   replace />} />

        {/* Fallback — unrecognised paths go to homepage */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
